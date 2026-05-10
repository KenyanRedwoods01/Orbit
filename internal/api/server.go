// Package api wires together all HTTP/2 routes and WebSocket endpoints.
package api

import (
        "context"
        "crypto/sha256"
        "crypto/subtle"
        "encoding/hex"
        "net/http"
        "strings"
        "sync"
        "time"

        "github.com/KenyanRedwoods01/Orbit/internal/config"
        "github.com/KenyanRedwoods01/Orbit/internal/db"
)

// csrfTokens tracks recently issued CSRF tokens (in-memory, TTL 1h).
var csrfTokens struct {
        mu    sync.Mutex
        tokens map[string]time.Time
}

func init() {
        csrfTokens.tokens = make(map[string]time.Time)
}

// generateCSRFToken creates a token bound to the current session.
func (s *Server) generateCSRFToken(r *http.Request) string {
        cookie, err := r.Cookie("orbit_session")
        if err != nil {
                return ""
        }
        data := cookie.Value + ":" + r.UserAgent()
        sum := sha256.Sum256([]byte(data))
        token := hex.EncodeToString(sum[:16])

        csrfTokens.mu.Lock()
        csrfTokens.tokens[token] = time.Now()
        csrfTokens.mu.Unlock()
        return token
}

// validateCSRFToken checks the X-CSRF-Token header against the session.
func (s *Server) validateCSRFToken(r *http.Request) bool {
        token := r.Header.Get("X-CSRF-Token")
        if token == "" {
                return false
        }
        csrfTokens.mu.Lock()
        expireAt, ok := csrfTokens.tokens[token]
        if !ok {
                csrfTokens.mu.Unlock()
                return false
        }
        // Token TTL: 1 hour
        if time.Since(expireAt) > time.Hour {
                delete(csrfTokens.tokens, token)
                csrfTokens.mu.Unlock()
                return false
        }
        csrfTokens.mu.Unlock()

        // Verify token is bound to the session cookie
        cookie, err := r.Cookie("orbit_session")
        if err != nil {
                return false
        }
        data := cookie.Value + ":" + r.UserAgent()
        sum := sha256.Sum256([]byte(data))
        expected := hex.EncodeToString(sum[:16])

        return subtle.ConstantTimeCompare([]byte(token), []byte(expected)) == 1
}

// gcCSRFTokens periodically purges expired tokens.
func gcCSRFTokens() {
        ticker := time.NewTicker(10 * time.Minute)
        for range ticker.C {
                csrfTokens.mu.Lock()
                for k, v := range csrfTokens.tokens {
                        if time.Since(v) > time.Hour {
                                delete(csrfTokens.tokens, k)
                        }
                }
                csrfTokens.mu.Unlock()
        }
}

// rateLimiter provides per-IP rate limiting with a sliding window.
type rateLimiter struct {
        mu       sync.Mutex
        visitors map[string]*visitorEntry
        rate     int
        window   time.Duration
}

type visitorEntry struct {
        count    int
        windowStart time.Time
}

func newRateLimiter(rate int, window time.Duration) *rateLimiter {
        rl := &rateLimiter{
                visitors: make(map[string]*visitorEntry),
                rate:     rate,
                window:   window,
        }
        go func() {
                ticker := time.NewTicker(window)
                for range ticker.C {
                        rl.mu.Lock()
                        for k, v := range rl.visitors {
                                if time.Since(v.windowStart) > window {
                                        delete(rl.visitors, k)
                                }
                        }
                        rl.mu.Unlock()
                }
        }()
        return rl
}

func (rl *rateLimiter) allow(ip string) bool {
        rl.mu.Lock()
        defer rl.mu.Unlock()

        entry, exists := rl.visitors[ip]
        now := time.Now()
        if !exists || time.Since(entry.windowStart) > rl.window {
                rl.visitors[ip] = &visitorEntry{count: 1, windowStart: now}
                return true
        }
        if entry.count >= rl.rate {
                return false
        }
        entry.count++
        return true
}

var globalRateLimiter = newRateLimiter(300, time.Minute) // 300 requests/min/IP
var authRateLimiter = newRateLimiter(10, time.Minute)    // 10 auth attempts/min/IP
var userRateLimiter = newRateLimiter(60, time.Minute)    // 60 mutations/min/user

// Server is the main HTTP server for Orbit.
type Server struct {
        cfg *config.Config
        db  *db.DB
        mux *http.ServeMux
}

// NewServer creates a Server and registers all routes.
func NewServer(cfg *config.Config, database *db.DB) (*Server, error) {
        s := &Server{cfg: cfg, db: database, mux: http.NewServeMux()}
        s.registerRoutes()
        s.seedMissingPlugins()
        s.seedServerApps()
        return s, nil
}

// Run starts the server and blocks until ctx is cancelled.
func (s *Server) Run(ctx context.Context) error {
	go s.runUptimePoller(ctx)
	go s.runMetricsCollector(ctx)
	go s.runCronScheduler(ctx)
	go s.runBackupScheduler(ctx)
	go s.runAgentStalenessChecker(ctx)
	go s.runManagedServerPinger(ctx)
	go gcCSRFTokens()
	go s.runLogRetention(ctx)
	s.startFirewallAgents(ctx)

        srv := &http.Server{
                Addr:              s.cfg.ListenAddr,
                Handler:           s.securityMiddleware(s.mux),
                MaxHeaderBytes:    1 << 20, // 1 MB
                ReadHeaderTimeout: 10 * time.Second,
                ReadTimeout:       60 * time.Second,
                IdleTimeout:       120 * time.Second,
        }
        go func() {
                <-ctx.Done()
                srv.Shutdown(context.Background()) //nolint:errcheck
        }()
        var err error
        if s.cfg.TLSCertFile != "" && s.cfg.TLSKeyFile != "" {
                err = srv.ListenAndServeTLS(s.cfg.TLSCertFile, s.cfg.TLSKeyFile)
        } else {
                err = srv.ListenAndServe()
        }
        if err != nil && err != http.ErrServerClosed {
                return err
        }
        return nil
}

// securityMiddleware chains CORS, CSRF, rate limiting, and security-header middleware.
func (s *Server) securityMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// ── Security headers ──────────────────────────────────────────────
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("X-XSS-Protection", "1; mode=block")
		w.Header().Set("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' ws: wss:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")
		w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
		w.Header().Set("Permissions-Policy", "geolocation=(), microphone=(), camera=()")
		if s.cfg.TLSCertFile != "" {
			w.Header().Set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload")
		}

		// ── CORS ─────────────────────────────────────────────────────────
		origin := r.Header.Get("Origin")
		if origin != "" && isTrustedOrigin(origin, r.Host) {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-CSRF-Token")
			w.Header().Set("Vary", "Origin")
		}

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		// ── Global rate limiting ──────────────────────────────────────────
		ip := extractAuditIP(r)
		if r.URL.Path != "/api/auth/login" && r.URL.Path != "/api/auth/totp/login" {
			if !globalRateLimiter.allow(ip) {
				http.Error(w, "rate limit exceeded", http.StatusTooManyRequests)
				return
			}
		}

		// ── Request body size limit (32 MB) ───────────────────────────────
		if r.Body != nil {
			r.Body = http.MaxBytesReader(w, r.Body, 32<<20)
		}

		// ── CSRF protection for state-changing methods (cookie auth only) ─
		if r.Method == http.MethodPost || r.Method == http.MethodPut || r.Method == http.MethodDelete || r.Method == http.MethodPatch {
			// Skip CSRF for login/logout and API token auth (Bearer token)
			if strings.HasPrefix(r.Header.Get("Authorization"), "Bearer ") {
				next.ServeHTTP(w, r)
				return
			}
			// Skip CSRF for public endpoints
			if strings.HasPrefix(r.URL.Path, "/api/setup/") ||
				r.URL.Path == "/api/auth/login" ||
				r.URL.Path == "/api/auth/logout" ||
				r.URL.Path == "/api/auth/totp/login" ||
				strings.HasPrefix(r.URL.Path, "/webhook/") {
				next.ServeHTTP(w, r)
				return
			}
			if !s.validateCSRFToken(r) {
				http.Error(w, "CSRF token missing or invalid", http.StatusForbidden)
				return
			}
		}

		next.ServeHTTP(w, r)
	})
}

// isTrustedOrigin returns true when origin matches the server host (same-site).
// It accepts both http and https schemes to support dev/prod.
func isTrustedOrigin(origin, host string) bool {
        origin = strings.TrimPrefix(origin, "https://")
        origin = strings.TrimPrefix(origin, "http://")
        host = strings.TrimPrefix(host, "https://")
        host = strings.TrimPrefix(host, "http://")
        return strings.EqualFold(origin, host)
}

// handleCSRFToken returns a fresh CSRF token for the current session.
func (s *Server) handleCSRFToken(w http.ResponseWriter, r *http.Request) {
	token := s.generateCSRFToken(r)
	if token == "" {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"csrf_token": token}) //nolint:errcheck
}

func (s *Server) registerRoutes() {
        // ─── Setup (public, only active before first user is created) ───
        s.mux.HandleFunc("GET /api/setup/status", s.handleSetupStatus)
        s.mux.HandleFunc("POST /api/setup/complete", s.handleSetupComplete)

        // ─── Auth ───
        s.mux.HandleFunc("POST /api/auth/login", loginRateLimiter(s.handleLogin))
        s.mux.HandleFunc("POST /api/auth/logout", s.handleLogout)

        // ─── TOTP / 2FA ───
        s.mux.HandleFunc("GET /api/auth/totp/status", s.requireAuth(s.handleTOTPStatus))
        s.mux.HandleFunc("POST /api/auth/totp/setup", s.requireAuth(s.handleTOTPSetup))
        s.mux.HandleFunc("POST /api/auth/totp/verify", s.requireAuth(s.handleTOTPVerify))
        s.mux.HandleFunc("POST /api/auth/totp/disable", s.requireAuth(s.handleTOTPDisable))
        s.mux.HandleFunc("POST /api/auth/totp/backup-codes", s.requireAuth(s.handleTOTPBackupCodes))
        s.mux.HandleFunc("POST /api/auth/totp/login", loginRateLimiter(s.handleTOTPLogin))

        // ─── Current User ───
        s.mux.HandleFunc("GET /api/users/me", s.requireAuth(s.handleUserMe))

        // ─── Profile (self-service) ───
        s.mux.HandleFunc("GET /api/profile",                  s.requireAuth(s.handleProfileGet))
        s.mux.HandleFunc("PUT /api/profile",                  s.requireAuth(s.handleProfileUpdate))
        s.mux.HandleFunc("POST /api/profile/username",        s.requireAuth(s.handleProfileChangeUsername))
        s.mux.HandleFunc("POST /api/profile/password",        s.requireAuth(s.handleProfileChangePassword))
        s.mux.HandleFunc("GET /api/profile/sessions",         s.requireAuth(s.handleProfileSessions))
        s.mux.HandleFunc("DELETE /api/profile/sessions/{id}", s.requireAuth(s.handleProfileRevokeSession))
        s.mux.HandleFunc("GET /api/profile/activity",         s.requireAuth(s.handleProfileActivity))

        // ─── User Management ───
        s.mux.HandleFunc("GET /api/users", s.requireAdmin(s.handleUserList))
        s.mux.HandleFunc("POST /api/users", s.requireAdmin(s.handleUserCreate))
        s.mux.HandleFunc("PUT /api/users/{id}", s.requireAdmin(s.handleUserUpdate))
        s.mux.HandleFunc("DELETE /api/users/{id}", s.requireAdmin(s.handleUserDelete))
        s.mux.HandleFunc("POST /api/users/{id}/password", s.requireAdmin(s.handleUserChangePassword))

        // ─── Settings (key-value) ───
        s.mux.HandleFunc("GET /api/settings", s.requireAdmin(s.handleSettingsGet))
        s.mux.HandleFunc("PUT /api/settings", s.requireAdmin(s.handleSettingsPut))
        s.mux.HandleFunc("GET /api/settings/{key}", s.requireAdmin(s.handleSettingGet))

        // ─── Settings (structured sections) ───
        s.mux.HandleFunc("GET /api/settings/appearance",          s.requireAuth(s.handleSettingsAppearanceGet))
        s.mux.HandleFunc("PUT /api/settings/appearance",          s.requireAuth(s.handleSettingsAppearancePut))
        s.mux.HandleFunc("GET /api/settings/auth-policy",         s.requireAuth(s.handleSettingsAuthPolicyGet))
        s.mux.HandleFunc("PUT /api/settings/auth-policy",         s.requireAdmin(s.handleSettingsAuthPolicyPut))
        s.mux.HandleFunc("GET /api/settings/auth-methods",        s.requireAuth(s.handleSettingsAuthMethodsGet))
        s.mux.HandleFunc("PUT /api/settings/auth-methods",        s.requireAdmin(s.handleSettingsAuthMethodsPut))
        s.mux.HandleFunc("GET /api/settings/notif-config",        s.requireAuth(s.handleSettingsNotifConfigGet))
        s.mux.HandleFunc("PUT /api/settings/notif-config",        s.requireAuth(s.handleSettingsNotifConfigPut))
        s.mux.HandleFunc("GET /api/settings/notif-matrix",        s.requireAuth(s.handleSettingsNotifMatrixGet))
        s.mux.HandleFunc("PUT /api/settings/notif-matrix",        s.requireAuth(s.handleSettingsNotifMatrixPut))
        s.mux.HandleFunc("GET /api/settings/backup-config",       s.requireAuth(s.handleSettingsBackupConfigGet))
        s.mux.HandleFunc("PUT /api/settings/backup-config",       s.requireAdmin(s.handleSettingsBackupConfigPut))
        s.mux.HandleFunc("GET /api/settings/backup-files",        s.requireAuth(s.handleSettingsBackupFiles))
        s.mux.HandleFunc("POST /api/settings/backup-now",                    s.requireAdmin(s.handleSettingsBackupNow))
        s.mux.HandleFunc("GET /api/settings/system-info",                   s.requireAuth(s.handleSettingsSystemInfo))
        s.mux.HandleFunc("GET /api/settings/export",                        s.requireAdmin(s.handleSettingsExport))
        s.mux.HandleFunc("POST /api/settings/import",                       s.requireAdmin(s.handleSettingsImport))
        s.mux.HandleFunc("POST /api/settings/restore-defaults",             s.requireAdmin(s.handleSettingsRestoreDefaults))
        s.mux.HandleFunc("POST /api/settings/notif-test",                   s.requireAdmin(s.handleSettingsNotifTest))
        s.mux.HandleFunc("GET /api/settings/check-updates",                 s.requireAuth(s.handleSettingsCheckUpdates))
        s.mux.HandleFunc("GET /api/settings/releases",                      s.requireAuth(s.handleSettingsListReleases))
        s.mux.HandleFunc("DELETE /api/settings/backup-files/{id}",          s.requireAdmin(s.handleSettingsBackupFileDelete))
        s.mux.HandleFunc("POST /api/settings/backup-files/{id}/restore",    s.requireAdmin(s.handleSettingsBackupFileRestore))
        s.mux.HandleFunc("GET /api/settings/backup-files/{id}/download",    s.requireAdmin(s.handleSettingsBackupFileDownload))

        // ─── API Tokens (scoped, separate from MCP) ───
        s.mux.HandleFunc("GET /api/tokens", s.requireAdmin(s.handleAPITokenList))
        s.mux.HandleFunc("POST /api/tokens", s.requireAdmin(s.handleAPITokenCreate))
        s.mux.HandleFunc("DELETE /api/tokens/{id}", s.requireAdmin(s.handleAPITokenRevoke))

        // ─── Audit Log ───
        s.mux.HandleFunc("GET /api/audit/logs", s.requireAuth(s.handleAuditList))
        s.mux.HandleFunc("GET /api/audit/export", s.requireAuth(s.handleAuditExport))
        s.mux.HandleFunc("DELETE /api/audit/logs", s.requireAdmin(s.handleAuditClear))

        // ─── Server Info ───
        s.mux.HandleFunc("GET /api/server/info", s.requireAuth(s.handleServerInfo))

        // ─── Prometheus metrics export (authenticated only) ───
        // When a browser navigates to /metrics (the React route), serve the SPA instead.
        s.mux.HandleFunc("GET /metrics", func(w http.ResponseWriter, r *http.Request) {
                if strings.Contains(r.Header.Get("Accept"), "text/html") {
                        r.URL.Path = "/"
                        spaHandler{http.FS(staticFiles)}.ServeHTTP(w, r)
                        return
                }
                s.requireAuth(s.handlePrometheusMetrics)(w, r)
        })
        s.mux.HandleFunc("GET /api/metrics/prometheus", s.requireAuth(s.handlePrometheusMetrics))

        // ─── Metrics ───
        s.mux.HandleFunc("GET /api/metrics/snapshot", s.requireAuth(s.handleMetricsSnapshot))
        s.mux.HandleFunc("GET /api/metrics/history", s.requireAuth(s.handleMetricsHistory))
        s.mux.HandleFunc("GET /api/metrics/summary", s.requireAuth(s.handleMetricsSummary))
        s.mux.HandleFunc("GET /ws/metrics", s.requireAuth(s.handleMetricsWS))

        // ─── Processes ───
        s.mux.HandleFunc("GET /api/processes", s.requireAuth(s.handleProcessList))
        s.mux.HandleFunc("GET /api/processes/{pid}", s.requireAuth(s.handleProcessGet))
        s.mux.HandleFunc("POST /api/processes/{pid}/signal", s.requireAdmin(s.auditMiddleware(s.handleProcessSignal)))
        s.mux.HandleFunc("POST /api/processes/{pid}/nice", s.requireAdmin(s.auditMiddleware(s.handleProcessRenice)))
        s.mux.HandleFunc("GET /api/processes/{pid}/files", s.requireAdmin(s.handleProcessOpenFiles))
        s.mux.HandleFunc("GET /api/processes/{pid}/environ", s.requireAdmin(s.handleProcessEnviron))
        s.mux.HandleFunc("POST /api/processes/batch-signal", s.requireAdmin(s.auditMiddleware(s.handleProcessBatchSignal)))

        // ─── Services (systemd) ───
        s.mux.HandleFunc("GET /api/services", s.requireAuth(s.handleServiceList))
        s.mux.HandleFunc("GET /api/services/{name}", s.requireAuth(s.handleServiceDetail))
        s.mux.HandleFunc("POST /api/services/{name}/start", s.requireAdmin(s.auditMiddleware(s.handleServiceStart)))
        s.mux.HandleFunc("POST /api/services/{name}/stop", s.requireAdmin(s.auditMiddleware(s.handleServiceStop)))
        s.mux.HandleFunc("POST /api/services/{name}/restart", s.requireAdmin(s.auditMiddleware(s.handleServiceRestart)))
        s.mux.HandleFunc("POST /api/services/{name}/enable", s.requireAdmin(s.auditMiddleware(s.handleServiceEnable)))
        s.mux.HandleFunc("POST /api/services/{name}/disable", s.requireAdmin(s.auditMiddleware(s.handleServiceDisable)))
        s.mux.HandleFunc("GET /api/services/{name}/logs", s.requireAuth(s.handleServiceLogsPoll))
        s.mux.HandleFunc("GET /ws/services/{name}/logs", s.requireAuth(s.handleServiceLogsWS))

        // ─── Logs ───
        s.mux.HandleFunc("GET /api/logs", s.requireAuth(s.handleLogList))
        s.mux.HandleFunc("GET /api/logs/sources", s.requireAuth(s.handleLogSources))
        s.mux.HandleFunc("GET /api/logs/entries", s.requireAuth(s.handleLogEntries))
        s.mux.HandleFunc("GET /api/logs/stats", s.requireAuth(s.handleLogStats))
        s.mux.HandleFunc("GET /ws/logs", s.requireAuth(s.handleLogTailWS))

        // ─── Firewall (UFW) — Status & Control ───
        s.mux.HandleFunc("GET /api/firewall/status", s.requireAuth(s.handleFirewallStatus))
        s.mux.HandleFunc("POST /api/firewall/enable", s.requireAdmin(s.auditMiddleware(s.handleFirewallEnable)))
        s.mux.HandleFunc("POST /api/firewall/disable", s.requireAdmin(s.auditMiddleware(s.handleFirewallDisable)))
        s.mux.HandleFunc("POST /api/firewall/reset", s.requireAdmin(s.auditMiddleware(s.handleFirewallReset)))
        s.mux.HandleFunc("POST /api/firewall/default", s.requireAdmin(s.auditMiddleware(s.handleFirewallSetDefault)))

        // ─── Firewall — Rules CRUD ───
        s.mux.HandleFunc("GET /api/firewall/rules", s.requireAuth(s.handleFirewallRules))
        s.mux.HandleFunc("GET /api/firewall/rules/export", s.requireAuth(s.handleFirewallExportRules))
        s.mux.HandleFunc("POST /api/firewall/rules/import", s.requireAdmin(s.auditMiddleware(s.handleFirewallImportRules)))
        s.mux.HandleFunc("POST /api/firewall/rules/reorder", s.requireAdmin(s.auditMiddleware(s.handleFirewallReorderRules)))
        s.mux.HandleFunc("GET /api/firewall/rules/{id}", s.requireAuth(s.handleFirewallGetRule))
        s.mux.HandleFunc("POST /api/firewall/rules", s.requireAdmin(s.auditMiddleware(s.handleFirewallAddRule)))
        s.mux.HandleFunc("PUT /api/firewall/rules/{id}", s.requireAdmin(s.auditMiddleware(s.handleFirewallUpdateRule)))
        s.mux.HandleFunc("DELETE /api/firewall/rules/{id}", s.requireAdmin(s.auditMiddleware(s.handleFirewallDeleteRule)))
        s.mux.HandleFunc("GET /api/firewall/rules/{id}/hits", s.requireAuth(s.handleFirewallRuleHits))

        // ─── Firewall — App Profiles ───
        s.mux.HandleFunc("GET /api/firewall/profiles", s.requireAuth(s.handleFirewallProfiles))
        s.mux.HandleFunc("POST /api/firewall/profiles", s.requireAdmin(s.auditMiddleware(s.handleFirewallCreateProfile)))
        s.mux.HandleFunc("PUT /api/firewall/profiles/{id}", s.requireAdmin(s.auditMiddleware(s.handleFirewallUpdateProfile)))
        s.mux.HandleFunc("DELETE /api/firewall/profiles/{id}", s.requireAdmin(s.auditMiddleware(s.handleFirewallDeleteProfile)))
        s.mux.HandleFunc("POST /api/firewall/profiles/{id}/toggle", s.requireAdmin(s.auditMiddleware(s.handleFirewallToggleProfile)))

        // ─── Firewall — NAT / Port Forwarding ───
        s.mux.HandleFunc("GET /api/firewall/nat", s.requireAuth(s.handleFirewallNATList))
        s.mux.HandleFunc("POST /api/firewall/nat", s.requireAdmin(s.auditMiddleware(s.handleFirewallNATCreate)))
        s.mux.HandleFunc("PUT /api/firewall/nat/{id}", s.requireAdmin(s.auditMiddleware(s.handleFirewallNATUpdate)))
        s.mux.HandleFunc("DELETE /api/firewall/nat/{id}", s.requireAdmin(s.auditMiddleware(s.handleFirewallNATDelete)))
        s.mux.HandleFunc("POST /api/firewall/nat/{id}/toggle", s.requireAdmin(s.auditMiddleware(s.handleFirewallNATToggle)))

        // ─── Firewall — Fail2ban ───
        s.mux.HandleFunc("GET /api/firewall/f2b/jails", s.requireAuth(s.handleFirewallF2BJails))
        s.mux.HandleFunc("POST /api/firewall/f2b/jails/{name}/toggle", s.requireAdmin(s.auditMiddleware(s.handleFirewallF2BToggleJail)))
        s.mux.HandleFunc("GET /api/firewall/f2b/banned", s.requireAuth(s.handleFirewallF2BBanned))
        s.mux.HandleFunc("POST /api/firewall/f2b/banned", s.requireAdmin(s.auditMiddleware(s.handleFirewallF2BBan)))
        s.mux.HandleFunc("DELETE /api/firewall/f2b/banned/{ip}", s.requireAdmin(s.auditMiddleware(s.handleFirewallF2BUnban)))

        // ─── Firewall — Logs & Stats ───
        s.mux.HandleFunc("GET /api/firewall/logs", s.requireAuth(s.handleFirewallLogs))
        s.mux.HandleFunc("DELETE /api/firewall/logs", s.requireAdmin(s.auditMiddleware(s.handleFirewallClearLogs)))
        s.mux.HandleFunc("GET /api/firewall/stats", s.requireAuth(s.handleFirewallStats))
        s.mux.HandleFunc("POST /api/firewall/command", s.requireAuth(s.handleFirewallBuildCommand))

        // ─── Firewall — Live log WebSocket ───
        s.mux.HandleFunc("GET /ws/firewall/logs", s.requireAuth(s.handleFirewallLogsWS))

        // ─── Web Server (nginx) ───
        s.mux.HandleFunc("GET /api/webserver/sites", s.requireAuth(s.handleWebServerSites))
        s.mux.HandleFunc("POST /api/webserver/sites", s.requireAdmin(s.auditMiddleware(s.handleWebServerCreateSite)))
        s.mux.HandleFunc("PUT /api/webserver/sites/{name}", s.requireAdmin(s.auditMiddleware(s.handleWebServerUpdateSite)))
        s.mux.HandleFunc("DELETE /api/webserver/sites/{name}", s.requireAdmin(s.auditMiddleware(s.handleWebServerDeleteSite)))
        s.mux.HandleFunc("POST /api/webserver/sites/{name}/toggle", s.requireAdmin(s.auditMiddleware(s.handleWebServerToggleSite)))
        s.mux.HandleFunc("GET /api/webserver/status", s.requireAuth(s.handleWebServerStatus))
        s.mux.HandleFunc("GET /api/webserver/performance", s.requireAuth(s.handleWebServerPerformance))
        s.mux.HandleFunc("GET /api/webserver/global", s.requireAuth(s.handleWebServerGlobalGet))
        s.mux.HandleFunc("PUT /api/webserver/global", s.requireAdmin(s.auditMiddleware(s.handleWebServerGlobalPut)))
        s.mux.HandleFunc("POST /api/webserver/reload", s.requireAdmin(s.auditMiddleware(s.handleWebServerReload)))
        s.mux.HandleFunc("POST /api/webserver/start", s.requireAdmin(s.auditMiddleware(s.handleWebServerStart)))
        s.mux.HandleFunc("POST /api/webserver/stop", s.requireAdmin(s.auditMiddleware(s.handleWebServerStop)))
        s.mux.HandleFunc("POST /api/webserver/restart", s.requireAdmin(s.auditMiddleware(s.handleWebServerRestart)))
        s.mux.HandleFunc("GET /api/webserver/logs", s.requireAuth(s.handleWebServerLogs))

        // ─── Deploy Hooks ───
        s.mux.HandleFunc("GET /api/deploy/stats", s.requireAuth(s.handleDeployStats))
        s.mux.HandleFunc("GET /api/deploy/hooks", s.requireAuth(s.handleDeployList))
        s.mux.HandleFunc("POST /api/deploy/hooks", s.requireAdmin(s.handleDeployCreate))
        s.mux.HandleFunc("PUT /api/deploy/hooks/{id}", s.requireAdmin(s.handleDeployUpdate))
        s.mux.HandleFunc("DELETE /api/deploy/hooks/{id}", s.requireAdmin(s.handleDeployDelete))
        s.mux.HandleFunc("POST /api/deploy/hooks/{id}/trigger", s.requireAdmin(s.handleDeployTrigger))
        s.mux.HandleFunc("GET /api/deploy/hooks/{id}/runs", s.requireAuth(s.handleDeployHookRuns))
        s.mux.HandleFunc("GET /api/deploy/runs", s.requireAuth(s.handleDeployAllRuns))
        s.mux.HandleFunc("GET /api/deploy/runs/{run_id}", s.requireAuth(s.handleDeployRunGet))
        s.mux.HandleFunc("POST /webhook/{secret}", s.handleDeployWebhook)

        // ─── Containers (Docker) ───
        s.mux.HandleFunc("GET /api/containers", s.requireAuth(s.handleContainerList))
        s.mux.HandleFunc("POST /api/containers", s.requireAdmin(s.handleContainerCreate))
        s.mux.HandleFunc("POST /api/containers/{id}/start", s.requireAdmin(s.handleContainerStart))
        s.mux.HandleFunc("POST /api/containers/{id}/stop", s.requireAdmin(s.handleContainerStop))
        s.mux.HandleFunc("POST /api/containers/{id}/restart", s.requireAdmin(s.handleContainerRestart))
        s.mux.HandleFunc("DELETE /api/containers/{id}", s.requireAdmin(s.handleContainerRemove))
        s.mux.HandleFunc("GET /api/containers/{id}/inspect", s.requireAuth(s.handleContainerInspect))
        s.mux.HandleFunc("GET /api/containers/images", s.requireAuth(s.handleImageList))
        s.mux.HandleFunc("POST /api/containers/images/pull", s.requireAdmin(s.handleImagePull))
        s.mux.HandleFunc("DELETE /api/containers/images/{id}", s.requireAdmin(s.handleImageRemove))
        s.mux.HandleFunc("POST /api/containers/prune", s.requireAdmin(s.handleSystemPrune))
        s.mux.HandleFunc("GET /api/containers/volumes", s.requireAuth(s.handleVolumeList))
        s.mux.HandleFunc("GET /api/containers/networks", s.requireAuth(s.handleNetworkList))
        s.mux.HandleFunc("GET /api/docker/info", s.requireAuth(s.handleDockerSystemInfo))
        s.mux.HandleFunc("GET /ws/containers/{id}/logs", s.requireAuth(s.handleContainerLogsWS))
        s.mux.HandleFunc("GET /ws/containers/{id}/stats", s.requireAuth(s.handleContainerStatsWS))

        // ─── Uptime Monitors ───
        s.mux.HandleFunc("GET /api/uptime", s.requireAuth(s.handleUptimeList))
        s.mux.HandleFunc("POST /api/uptime", s.requireAdmin(s.handleUptimeCreate))
        s.mux.HandleFunc("PUT /api/uptime/{id}", s.requireAdmin(s.handleUptimeUpdate))
        s.mux.HandleFunc("DELETE /api/uptime/{id}", s.requireAdmin(s.handleUptimeDelete))
        s.mux.HandleFunc("GET /api/uptime/{id}/summary", s.requireAuth(s.handleUptimeSummary))
        s.mux.HandleFunc("POST /api/uptime/{id}/ping", s.requireAuth(s.handleUptimePing))
        s.mux.HandleFunc("GET /api/uptime-stats", s.requireAuth(s.handleUptimeStats))
        // ─── Uptime Incidents ───
        s.mux.HandleFunc("GET /api/uptime-incidents", s.requireAuth(s.handleUptimeIncidentList))
        s.mux.HandleFunc("POST /api/uptime-incidents", s.requireAdmin(s.handleUptimeIncidentCreate))
        s.mux.HandleFunc("PUT /api/uptime-incidents/{incident_id}", s.requireAdmin(s.handleUptimeIncidentUpdate))
        s.mux.HandleFunc("DELETE /api/uptime-incidents/{incident_id}", s.requireAdmin(s.handleUptimeIncidentDelete))
        s.mux.HandleFunc("POST /api/uptime-incidents/{incident_id}/resolve", s.requireAdmin(s.handleUptimeIncidentResolve))

        // ─── Security Audit ───
        s.mux.HandleFunc("GET /api/security/audit", s.requireAuth(s.handleSecurityAudit))
        s.mux.HandleFunc("GET /api/security/stats", s.requireAuth(s.handleSecurityStats))

        // ─── Alert Rules ───
        s.mux.HandleFunc("GET /api/alerts/rules", s.requireAuth(s.handleAlertRuleList))
        s.mux.HandleFunc("POST /api/alerts/rules", s.requireAdmin(s.handleAlertRuleCreate))
        s.mux.HandleFunc("PUT /api/alerts/rules/{id}", s.requireAdmin(s.handleAlertRuleUpdate))
        s.mux.HandleFunc("DELETE /api/alerts/rules/{id}", s.requireAdmin(s.handleAlertRuleDelete))
        s.mux.HandleFunc("POST /api/alerts/rules/{id}/toggle", s.requireAdmin(s.handleAlertRuleToggle))
        s.mux.HandleFunc("GET /api/alerts/events", s.requireAuth(s.handleAlertEventList))

        // ─── Cron Jobs ───
        s.mux.HandleFunc("GET /api/cron/jobs", s.requireAuth(s.handleCronList))
        s.mux.HandleFunc("POST /api/cron/jobs", s.requireAdmin(s.handleCronCreate))
        s.mux.HandleFunc("PUT /api/cron/jobs/{id}", s.requireAdmin(s.handleCronUpdate))
        s.mux.HandleFunc("DELETE /api/cron/jobs/{id}", s.requireAdmin(s.handleCronDelete))
        s.mux.HandleFunc("POST /api/cron/jobs/{id}/run", s.requireAdmin(s.handleCronRun))
        s.mux.HandleFunc("GET /api/cron/jobs/{id}/history", s.requireAuth(s.handleCronHistory))
        s.mux.HandleFunc("GET /api/cron/system", s.requireAuth(s.handleCronSystemList))

        // ─── Backups ───
        s.mux.HandleFunc("GET /api/backups", s.requireAuth(s.handleBackupList))
        s.mux.HandleFunc("POST /api/backups", s.requireAdmin(s.handleBackupCreate))
        s.mux.HandleFunc("PUT /api/backups/{id}", s.requireAdmin(s.handleBackupUpdate))
        s.mux.HandleFunc("DELETE /api/backups/{id}", s.requireAdmin(s.handleBackupDelete))
        s.mux.HandleFunc("POST /api/backups/{id}/run", s.requireAdmin(s.handleBackupRun))
        s.mux.HandleFunc("GET /api/backups/{id}/runs", s.requireAuth(s.handleBackupRuns))
        s.mux.HandleFunc("GET /api/backup-runs/{run_id}", s.requireAuth(s.handleBackupRunGet))

	// ─── Multi-server Fleet ───
	s.mux.HandleFunc("GET /api/servers", s.requireAuth(s.handleManagedServerList))
	s.mux.HandleFunc("POST /api/servers", s.requireAdmin(s.handleManagedServerCreate))
	s.mux.HandleFunc("POST /api/servers/bulk/exec", s.requireAdmin(s.auditMiddleware(s.handleManagedServerBulkExec)))
	s.mux.HandleFunc("POST /api/servers/reorder", s.requireAdmin(s.handleManagedServerReorder))
	s.mux.HandleFunc("POST /api/servers/test-connection", s.requireAdmin(s.handleServerTestConnection))
	s.mux.HandleFunc("GET /api/servers/{id}", s.requireAuth(s.handleManagedServerGet))
	s.mux.HandleFunc("PUT /api/servers/{id}", s.requireAdmin(s.handleManagedServerUpdate))
	s.mux.HandleFunc("DELETE /api/servers/{id}", s.requireAdmin(s.handleManagedServerDelete))
	s.mux.HandleFunc("POST /api/servers/{id}/ping", s.requireAdmin(s.handleManagedServerPing))
	s.mux.HandleFunc("POST /api/servers/{id}/exec", s.requireAdmin(s.auditMiddleware(s.handleManagedServerExec)))
	s.mux.HandleFunc("GET /api/servers/{id}/metrics", s.requireAuth(s.handleManagedServerMetrics))
	s.mux.HandleFunc("GET /api/csrf-token", s.requireAuth(s.handleCSRFToken))
        s.mux.HandleFunc("GET /api/servers/{id}/services", s.requireAuth(s.handleManagedServerServices))
        s.mux.HandleFunc("GET /api/servers/{id}/alerts", s.requireAuth(s.handleManagedServerAlerts))
        s.mux.HandleFunc("POST /api/servers/{id}/alerts/{alert_id}/resolve", s.requireAdmin(s.handleManagedServerAlertResolve))
        s.mux.HandleFunc("GET /api/servers/{id}/history", s.requireAuth(s.handleManagedServerHistory))
        s.mux.HandleFunc("GET /ws/servers/{id}/terminal", s.requireAdmin(s.handleManagedServerTerminalWS))

        // ─── Server Groups ───
        s.mux.HandleFunc("GET /api/server-groups", s.requireAuth(s.handleServerGroupList))
        s.mux.HandleFunc("POST /api/server-groups", s.requireAdmin(s.handleServerGroupCreate))
        s.mux.HandleFunc("PUT /api/server-groups/{id}", s.requireAdmin(s.handleServerGroupUpdate))
        s.mux.HandleFunc("DELETE /api/server-groups/{id}", s.requireAdmin(s.handleServerGroupDelete))

        // ─── Saved Commands ───
        s.mux.HandleFunc("GET /api/saved-commands", s.requireAuth(s.handleSavedCommandList))
        s.mux.HandleFunc("POST /api/saved-commands", s.requireAdmin(s.handleSavedCommandCreate))
        s.mux.HandleFunc("PUT /api/saved-commands/{id}", s.requireAdmin(s.handleSavedCommandUpdate))
        s.mux.HandleFunc("DELETE /api/saved-commands/{id}", s.requireAdmin(s.handleSavedCommandDelete))

        // ─── Agent ───
        s.mux.HandleFunc("GET /api/agents", s.requireAuth(s.handleAgentList))
        s.mux.HandleFunc("POST /api/agents/register", s.handleAgentRegister)
        s.mux.HandleFunc("POST /api/agents/{id}/metrics", s.handleAgentMetrics)
        s.mux.HandleFunc("DELETE /api/agents/{id}", s.requireAdmin(s.handleAgentDelete))

        // ─── Certificates ───
        s.mux.HandleFunc("GET /api/certificates", s.requireAuth(s.handleCertificateList))
        s.mux.HandleFunc("POST /api/certificates", s.requireAdmin(s.auditMiddleware(s.handleCertificateCreate)))
        s.mux.HandleFunc("DELETE /api/certificates/{id}", s.requireAdmin(s.auditMiddleware(s.handleCertificateDelete)))
        s.mux.HandleFunc("POST /api/certificates/{id}/renew", s.requireAdmin(s.auditMiddleware(s.handleCertificateRenew)))

        // ─── SSH Keys ───
        s.mux.HandleFunc("GET /api/ssh/keys", s.requireAuth(s.handleSSHKeyList))
        s.mux.HandleFunc("POST /api/ssh/keys", s.requireAdmin(s.auditMiddleware(s.handleSSHKeyGenerate)))
        s.mux.HandleFunc("GET /api/ssh/keys/{id}/download", s.requireAdmin(s.handleSSHKeyDownload))
        s.mux.HandleFunc("DELETE /api/ssh/keys/{id}", s.requireAdmin(s.auditMiddleware(s.handleSSHKeyDelete)))
        s.mux.HandleFunc("GET /api/ssh/known-hosts", s.requireAuth(s.handleSSHKnownHosts))
        s.mux.HandleFunc("DELETE /api/ssh/known-hosts/{id}", s.requireAdmin(s.auditMiddleware(s.handleSSHKnownHostDelete)))

        // ─── SSH Collab Sessions ───
        s.mux.HandleFunc("GET /api/ssh/sessions", s.requireAuth(s.handleSSHCollabList))
        s.mux.HandleFunc("POST /api/ssh/sessions", s.requireAdmin(s.handleSSHCollabCreate))
        s.mux.HandleFunc("DELETE /api/ssh/sessions/{id}", s.requireAdmin(s.handleSSHCollabDelete))
        s.mux.HandleFunc("GET /ws/ssh/sessions/{id}", s.requireAuth(s.handleSSHCollabWS))

        // ─── File System ───
        s.mux.HandleFunc("GET /api/files", s.requireAuth(s.handleFSList))
        s.mux.HandleFunc("GET /api/files/stat", s.requireAuth(s.handleFSStat))
        s.mux.HandleFunc("GET /api/files/read", s.requireAuth(s.handleFSRead))
        s.mux.HandleFunc("POST /api/files/write", s.requireAdmin(s.auditMiddleware(s.handleFSWrite)))
        s.mux.HandleFunc("POST /api/files/upload", s.requireAdmin(s.auditMiddleware(s.handleFSUpload)))
        s.mux.HandleFunc("GET /api/files/download", s.requireAdmin(s.handleFSDownload))
        s.mux.HandleFunc("POST /api/files/mkdir", s.requireAdmin(s.auditMiddleware(s.handleFSMkdir)))
        s.mux.HandleFunc("DELETE /api/files", s.requireAdmin(s.auditMiddleware(s.handleFSDelete)))
        s.mux.HandleFunc("POST /api/files/rename", s.requireAdmin(s.auditMiddleware(s.handleFSRename)))
        s.mux.HandleFunc("POST /api/files/chmod", s.requireAdmin(s.auditMiddleware(s.handleFSChmod)))
        s.mux.HandleFunc("POST /api/files/chown", s.requireAdmin(s.auditMiddleware(s.handleFSChown)))
        s.mux.HandleFunc("GET /api/files/search", s.requireAuth(s.handleFSSearch))
        s.mux.HandleFunc("POST /api/files/compress", s.requireAdmin(s.auditMiddleware(s.handleFSCompress)))
        s.mux.HandleFunc("POST /api/files/extract", s.requireAdmin(s.auditMiddleware(s.handleFSExtract)))

        // ─── Web Terminal ───
        s.mux.HandleFunc("GET /ws/terminal", s.requireAdmin(s.handleTerminalWS))

        // ─── Database (managed DB instances) ───
        s.mux.HandleFunc("GET /api/databases", s.requireAuth(s.handleDatabaseList))
        s.mux.HandleFunc("POST /api/databases", s.requireAdmin(s.handleDatabaseCreate))
        s.mux.HandleFunc("PUT /api/databases/{id}", s.requireAdmin(s.handleDatabaseUpdate))
        s.mux.HandleFunc("DELETE /api/databases/{id}", s.requireAdmin(s.handleDatabaseDelete))
        s.mux.HandleFunc("POST /api/databases/{id}/query", s.requireAdmin(s.handleDatabaseQuery))
        s.mux.HandleFunc("GET /api/databases/{id}/tables", s.requireAuth(s.handleDatabaseTables))
        s.mux.HandleFunc("GET /api/databases/{id}/backups", s.requireAuth(s.handleDatabaseBackups))
        s.mux.HandleFunc("POST /api/databases/{id}/backup", s.requireAdmin(s.handleDatabaseBackup))

        // ─── FTP ───
        s.mux.HandleFunc("GET /api/ftp/accounts", s.requireAuth(s.handleFTPList))
        s.mux.HandleFunc("POST /api/ftp/accounts", s.requireAdmin(s.auditMiddleware(s.handleFTPCreate)))
        s.mux.HandleFunc("PUT /api/ftp/accounts/{id}", s.requireAdmin(s.auditMiddleware(s.handleFTPUpdate)))
        s.mux.HandleFunc("DELETE /api/ftp/accounts/{id}", s.requireAdmin(s.auditMiddleware(s.handleFTPDelete)))
        s.mux.HandleFunc("POST /api/ftp/accounts/{id}/toggle", s.requireAdmin(s.auditMiddleware(s.handleFTPToggle)))

        // ─── Notifications ───
        s.mux.HandleFunc("GET /api/notifications", s.requireAuth(s.handleNotificationList))
        s.mux.HandleFunc("POST /api/notifications/{id}/read", s.requireAuth(s.handleNotificationRead))
        s.mux.HandleFunc("POST /api/notifications/read-all", s.requireAuth(s.handleNotificationReadAll))
        s.mux.HandleFunc("DELETE /api/notifications/{id}", s.requireAuth(s.handleNotificationDelete))
        s.mux.HandleFunc("GET /ws/notifications", s.requireAuth(s.handleNotificationsWS))

        // ─── Plugins ───
        s.mux.HandleFunc("GET /api/plugins", s.requireAuth(s.handlePluginList))
        s.mux.HandleFunc("POST /api/plugins/{id}/install", s.requireAdmin(s.auditMiddleware(s.handlePluginInstall)))
        s.mux.HandleFunc("POST /api/plugins/{id}/uninstall", s.requireAdmin(s.auditMiddleware(s.handlePluginUninstall)))
        s.mux.HandleFunc("POST /api/plugins/{id}/toggle", s.requireAuth(s.auditMiddleware(s.handlePluginToggle)))

        // ─── Applications ───
        s.mux.HandleFunc("GET /api/apps", s.requireAuth(s.handleAppList))
        s.mux.HandleFunc("GET /api/apps/{id}", s.requireAuth(s.handleAppGet))
        s.mux.HandleFunc("POST /api/apps", s.requireAdmin(s.handleAppCreate))
        s.mux.HandleFunc("PUT /api/apps/{id}", s.requireAdmin(s.handleAppUpdate))
        s.mux.HandleFunc("DELETE /api/apps/{id}", s.requireAdmin(s.handleAppDelete))
        s.mux.HandleFunc("POST /api/apps/{id}/deploy", s.requireAdmin(s.handleAppDeploy))
        s.mux.HandleFunc("GET /api/apps/{id}/logs", s.requireAuth(s.handleAppLogs))
        s.mux.HandleFunc("POST /api/apps/{id}/start", s.requireAdmin(s.handleAppStart))
        s.mux.HandleFunc("POST /api/apps/{id}/stop", s.requireAdmin(s.handleAppStop))
        s.mux.HandleFunc("POST /api/apps/{id}/restart", s.requireAdmin(s.handleAppRestart))

        // ─── GitHub Actions / CI pipelines ───
        s.mux.HandleFunc("GET /api/pipelines", s.requireAuth(s.handlePipelineList))
        s.mux.HandleFunc("POST /api/pipelines", s.requireAdmin(s.handlePipelineCreate))
        s.mux.HandleFunc("PUT /api/pipelines/{id}", s.requireAdmin(s.handlePipelineUpdate))
        s.mux.HandleFunc("DELETE /api/pipelines/{id}", s.requireAdmin(s.handlePipelineDelete))
        s.mux.HandleFunc("POST /api/pipelines/{id}/trigger", s.requireAdmin(s.handlePipelineTrigger))
        s.mux.HandleFunc("GET /api/pipelines/{id}/runs", s.requireAuth(s.handlePipelineRuns))
        s.mux.HandleFunc("GET /api/github/repos", s.requireAuth(s.handleGitHubRepos))
        s.mux.HandleFunc("GET /api/github/workflows", s.requireAuth(s.handleGitHubWorkflows))

        // ─── CrowdSec ───
        s.mux.HandleFunc("GET /api/crowdsec/status", s.requireAuth(s.handleCrowdSecStatus))
        s.mux.HandleFunc("GET /api/crowdsec/decisions", s.requireAuth(s.handleCrowdSecDecisions))
        s.mux.HandleFunc("POST /api/crowdsec/decisions", s.requireAdmin(s.auditMiddleware(s.handleCrowdSecAddDecision)))
        s.mux.HandleFunc("DELETE /api/crowdsec/decisions/{id}", s.requireAdmin(s.auditMiddleware(s.handleCrowdSecDeleteDecision)))
        s.mux.HandleFunc("GET /api/crowdsec/alerts", s.requireAuth(s.handleCrowdSecAlerts))
        s.mux.HandleFunc("GET /api/crowdsec/machines", s.requireAuth(s.handleCrowdSecMachines))
        s.mux.HandleFunc("GET /api/crowdsec/bouncers", s.requireAuth(s.handleCrowdSecBouncers))
        s.mux.HandleFunc("GET /api/crowdsec/metrics", s.requireAuth(s.handleCrowdSecMetrics))

        // ─── Suricata ───
        s.mux.HandleFunc("GET /api/suricata/status", s.requireAuth(s.handleSuricataStatus))
        s.mux.HandleFunc("GET /api/suricata/alerts", s.requireAuth(s.handleSuricataAlerts))
        s.mux.HandleFunc("GET /api/suricata/stats", s.requireAuth(s.handleSuricataStats))
        s.mux.HandleFunc("GET /api/suricata/rules", s.requireAuth(s.handleSuricataRules))
        s.mux.HandleFunc("POST /api/suricata/reload", s.requireAdmin(s.auditMiddleware(s.handleSuricataReload)))

        // ─── Wazuh ───
        s.mux.HandleFunc("GET /api/wazuh/status", s.requireAuth(s.handleWazuhStatus))
        s.mux.HandleFunc("GET /api/wazuh/agents", s.requireAuth(s.handleWazuhAgents))
        s.mux.HandleFunc("GET /api/wazuh/alerts", s.requireAuth(s.handleWazuhAlerts))
        s.mux.HandleFunc("GET /api/wazuh/stats", s.requireAuth(s.handleWazuhStats))

        // ─── Ports ───
        s.mux.HandleFunc("GET /api/ports", s.requireAuth(s.handlePortList))

        // ─── MCP ───
        s.mux.HandleFunc("GET /api/mcp/tokens", s.requireAdmin(s.handleMCPTokenList))
        s.mux.HandleFunc("POST /api/mcp/tokens", s.requireAdmin(s.handleMCPTokenCreate))
        s.mux.HandleFunc("DELETE /api/mcp/tokens/{id}", s.requireAdmin(s.handleMCPTokenRevoke))
        s.mux.HandleFunc("GET /api/mcp/audit", s.requireAuth(s.handleMCPAuditLog))
        s.mux.HandleFunc("GET /api/mcp/stats", s.requireAuth(s.handleMCPStats))

        // ─── OpenAPI ───
        s.mux.HandleFunc("GET /api/openapi.json", s.requireAuth(s.handleOpenAPI))

        // ─── SPA catch-all ───
        s.mux.Handle("/", spaHandler{http.FS(staticFiles)})
}

// runLogRetention periodically purges expired sessions and old audit logs.
func (s *Server) runLogRetention(ctx context.Context) {
	ticker := time.NewTicker(24 * time.Hour)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			// Purge expired sessions
			s.db.SQL.ExecContext(ctx, `DELETE FROM sessions WHERE expires_at < ?`, time.Now().Unix())
			// Purge audit logs older than 90 days
			s.db.SQL.ExecContext(ctx, `DELETE FROM audit_log WHERE ts < ?`, time.Now().Add(-90*24*time.Hour).Unix())
			// Purge old deploy logs (keep 30 days)
			s.db.SQL.ExecContext(ctx, `DELETE FROM deploy_log WHERE started_at < ?`, time.Now().Add(-30*24*time.Hour).Unix())
		}
	}
}
