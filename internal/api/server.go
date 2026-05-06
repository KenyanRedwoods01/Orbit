// Package api wires together all HTTP/2 routes and WebSocket endpoints.
package api

import (
        "context"
        "net/http"

        "github.com/orbit-sh/orbit/internal/config"
        "github.com/orbit-sh/orbit/internal/db"
)

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
        s.startFirewallAgents(ctx)

        srv := &http.Server{
                Addr:    s.cfg.ListenAddr,
                Handler: corsMiddleware(s.mux),
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

// corsMiddleware adds CORS headers to allow cross-origin requests in dev.
func corsMiddleware(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
                w.Header().Set("Access-Control-Allow-Origin", "*")
                w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
                w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, Cookie")
                w.Header().Set("Access-Control-Allow-Credentials", "true")
                if r.Method == http.MethodOptions {
                        w.WriteHeader(http.StatusNoContent)
                        return
                }
                next.ServeHTTP(w, r)
        })
}

func (s *Server) registerRoutes() {
        // ─── Setup (public, only active before first user is created) ───
        s.mux.HandleFunc("GET /api/setup/status", s.handleSetupStatus)
        s.mux.HandleFunc("POST /api/setup/complete", s.handleSetupComplete)

        // ─── Auth ───
        s.mux.HandleFunc("POST /api/auth/login", s.handleLogin)
        s.mux.HandleFunc("POST /api/auth/logout", s.handleLogout)

        // ─── TOTP / 2FA ───
        s.mux.HandleFunc("GET /api/auth/totp/status", s.requireAuth(s.handleTOTPStatus))
        s.mux.HandleFunc("POST /api/auth/totp/setup", s.requireAuth(s.handleTOTPSetup))
        s.mux.HandleFunc("POST /api/auth/totp/verify", s.requireAuth(s.handleTOTPVerify))
        s.mux.HandleFunc("POST /api/auth/totp/disable", s.requireAuth(s.handleTOTPDisable))
        s.mux.HandleFunc("POST /api/auth/totp/backup-codes", s.requireAuth(s.handleTOTPBackupCodes))
        s.mux.HandleFunc("POST /api/auth/totp/login", s.handleTOTPLogin)

        // ─── Current User ───
        s.mux.HandleFunc("GET /api/users/me", s.requireAuth(s.handleUserMe))

        // ─── User Management ───
        s.mux.HandleFunc("GET /api/users", s.requireAuth(s.handleUserList))
        s.mux.HandleFunc("POST /api/users", s.requireAuth(s.handleUserCreate))
        s.mux.HandleFunc("PUT /api/users/{id}", s.requireAuth(s.handleUserUpdate))
        s.mux.HandleFunc("DELETE /api/users/{id}", s.requireAuth(s.handleUserDelete))
        s.mux.HandleFunc("POST /api/users/{id}/password", s.requireAuth(s.handleUserChangePassword))

        // ─── Settings (key-value) ───
        s.mux.HandleFunc("GET /api/settings", s.requireAuth(s.handleSettingsGet))
        s.mux.HandleFunc("PUT /api/settings", s.requireAuth(s.handleSettingsPut))
        s.mux.HandleFunc("GET /api/settings/{key}", s.requireAuth(s.handleSettingGet))

        // ─── Settings (structured sections) ───
        s.mux.HandleFunc("GET /api/settings/appearance",          s.requireAuth(s.handleSettingsAppearanceGet))
        s.mux.HandleFunc("PUT /api/settings/appearance",          s.requireAuth(s.handleSettingsAppearancePut))
        s.mux.HandleFunc("GET /api/settings/auth-policy",         s.requireAuth(s.handleSettingsAuthPolicyGet))
        s.mux.HandleFunc("PUT /api/settings/auth-policy",         s.requireAuth(s.handleSettingsAuthPolicyPut))
        s.mux.HandleFunc("GET /api/settings/auth-methods",        s.requireAuth(s.handleSettingsAuthMethodsGet))
        s.mux.HandleFunc("PUT /api/settings/auth-methods",        s.requireAuth(s.handleSettingsAuthMethodsPut))
        s.mux.HandleFunc("GET /api/settings/notif-config",        s.requireAuth(s.handleSettingsNotifConfigGet))
        s.mux.HandleFunc("PUT /api/settings/notif-config",        s.requireAuth(s.handleSettingsNotifConfigPut))
        s.mux.HandleFunc("GET /api/settings/notif-matrix",        s.requireAuth(s.handleSettingsNotifMatrixGet))
        s.mux.HandleFunc("PUT /api/settings/notif-matrix",        s.requireAuth(s.handleSettingsNotifMatrixPut))
        s.mux.HandleFunc("GET /api/settings/backup-config",       s.requireAuth(s.handleSettingsBackupConfigGet))
        s.mux.HandleFunc("PUT /api/settings/backup-config",       s.requireAuth(s.handleSettingsBackupConfigPut))
        s.mux.HandleFunc("GET /api/settings/backup-files",        s.requireAuth(s.handleSettingsBackupFiles))
        s.mux.HandleFunc("POST /api/settings/backup-now",                    s.requireAuth(s.handleSettingsBackupNow))
        s.mux.HandleFunc("GET /api/settings/system-info",                   s.requireAuth(s.handleSettingsSystemInfo))
        s.mux.HandleFunc("GET /api/settings/export",                        s.requireAuth(s.handleSettingsExport))
        s.mux.HandleFunc("POST /api/settings/import",                       s.requireAuth(s.handleSettingsImport))
        s.mux.HandleFunc("POST /api/settings/restore-defaults",             s.requireAuth(s.handleSettingsRestoreDefaults))
        s.mux.HandleFunc("POST /api/settings/notif-test",                   s.requireAuth(s.handleSettingsNotifTest))
        s.mux.HandleFunc("GET /api/settings/check-updates",                 s.requireAuth(s.handleSettingsCheckUpdates))
        s.mux.HandleFunc("DELETE /api/settings/backup-files/{id}",          s.requireAuth(s.handleSettingsBackupFileDelete))
        s.mux.HandleFunc("POST /api/settings/backup-files/{id}/restore",    s.requireAuth(s.handleSettingsBackupFileRestore))
        s.mux.HandleFunc("GET /api/settings/backup-files/{id}/download",    s.requireAuth(s.handleSettingsBackupFileDownload))

        // ─── API Tokens (scoped, separate from MCP) ───
        s.mux.HandleFunc("GET /api/tokens", s.requireAuth(s.handleAPITokenList))
        s.mux.HandleFunc("POST /api/tokens", s.requireAuth(s.handleAPITokenCreate))
        s.mux.HandleFunc("DELETE /api/tokens/{id}", s.requireAuth(s.handleAPITokenRevoke))

        // ─── Audit Log ───
        s.mux.HandleFunc("GET /api/audit/logs", s.requireAuth(s.handleAuditList))
        s.mux.HandleFunc("GET /api/audit/export", s.requireAuth(s.handleAuditExport))
        s.mux.HandleFunc("DELETE /api/audit/logs", s.requireAuth(s.handleAuditClear))

        // ─── Server Info ───
        s.mux.HandleFunc("GET /api/server/info", s.requireAuth(s.handleServerInfo))

        // ─── Prometheus metrics export (public /metrics + authed /api/metrics/prometheus) ───
        s.mux.HandleFunc("GET /metrics", s.handlePrometheusMetrics)
        s.mux.HandleFunc("GET /api/metrics/prometheus", s.requireAuth(s.handlePrometheusMetrics))

        // ─── Metrics ───
        s.mux.HandleFunc("GET /api/metrics/snapshot", s.requireAuth(s.handleMetricsSnapshot))
        s.mux.HandleFunc("GET /api/metrics/history", s.requireAuth(s.handleMetricsHistory))
        s.mux.HandleFunc("GET /api/metrics/summary", s.requireAuth(s.handleMetricsSummary))
        s.mux.HandleFunc("GET /ws/metrics", s.requireAuth(s.handleMetricsWS))

        // ─── Processes ───
        s.mux.HandleFunc("GET /api/processes", s.requireAuth(s.handleProcessList))
        s.mux.HandleFunc("GET /api/processes/{pid}", s.requireAuth(s.handleProcessGet))
        s.mux.HandleFunc("POST /api/processes/{pid}/signal", s.requireAuth(s.auditMiddleware(s.handleProcessSignal)))
        s.mux.HandleFunc("POST /api/processes/{pid}/nice", s.requireAuth(s.auditMiddleware(s.handleProcessRenice)))
        s.mux.HandleFunc("GET /api/processes/{pid}/files", s.requireAuth(s.handleProcessOpenFiles))
        s.mux.HandleFunc("POST /api/processes/batch-signal", s.requireAuth(s.auditMiddleware(s.handleProcessBatchSignal)))

        // ─── Services (systemd) ───
        s.mux.HandleFunc("GET /api/services", s.requireAuth(s.handleServiceList))
        s.mux.HandleFunc("GET /api/services/{name}", s.requireAuth(s.handleServiceDetail))
        s.mux.HandleFunc("POST /api/services/{name}/start", s.requireAuth(s.auditMiddleware(s.handleServiceStart)))
        s.mux.HandleFunc("POST /api/services/{name}/stop", s.requireAuth(s.auditMiddleware(s.handleServiceStop)))
        s.mux.HandleFunc("POST /api/services/{name}/restart", s.requireAuth(s.auditMiddleware(s.handleServiceRestart)))
        s.mux.HandleFunc("POST /api/services/{name}/enable", s.requireAuth(s.auditMiddleware(s.handleServiceEnable)))
        s.mux.HandleFunc("POST /api/services/{name}/disable", s.requireAuth(s.auditMiddleware(s.handleServiceDisable)))
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
        s.mux.HandleFunc("POST /api/firewall/enable", s.requireAuth(s.auditMiddleware(s.handleFirewallEnable)))
        s.mux.HandleFunc("POST /api/firewall/disable", s.requireAuth(s.auditMiddleware(s.handleFirewallDisable)))
        s.mux.HandleFunc("POST /api/firewall/reset", s.requireAuth(s.auditMiddleware(s.handleFirewallReset)))
        s.mux.HandleFunc("POST /api/firewall/default", s.requireAuth(s.auditMiddleware(s.handleFirewallSetDefault)))

        // ─── Firewall — Rules CRUD ───
        s.mux.HandleFunc("GET /api/firewall/rules", s.requireAuth(s.handleFirewallRules))
        s.mux.HandleFunc("GET /api/firewall/rules/export", s.requireAuth(s.handleFirewallExportRules))
        s.mux.HandleFunc("POST /api/firewall/rules/import", s.requireAuth(s.auditMiddleware(s.handleFirewallImportRules)))
        s.mux.HandleFunc("POST /api/firewall/rules/reorder", s.requireAuth(s.auditMiddleware(s.handleFirewallReorderRules)))
        s.mux.HandleFunc("GET /api/firewall/rules/{id}", s.requireAuth(s.handleFirewallGetRule))
        s.mux.HandleFunc("POST /api/firewall/rules", s.requireAuth(s.auditMiddleware(s.handleFirewallAddRule)))
        s.mux.HandleFunc("PUT /api/firewall/rules/{id}", s.requireAuth(s.auditMiddleware(s.handleFirewallUpdateRule)))
        s.mux.HandleFunc("DELETE /api/firewall/rules/{id}", s.requireAuth(s.auditMiddleware(s.handleFirewallDeleteRule)))
        s.mux.HandleFunc("GET /api/firewall/rules/{id}/hits", s.requireAuth(s.handleFirewallRuleHits))

        // ─── Firewall — App Profiles ───
        s.mux.HandleFunc("GET /api/firewall/profiles", s.requireAuth(s.handleFirewallProfiles))
        s.mux.HandleFunc("POST /api/firewall/profiles", s.requireAuth(s.auditMiddleware(s.handleFirewallCreateProfile)))
        s.mux.HandleFunc("PUT /api/firewall/profiles/{id}", s.requireAuth(s.auditMiddleware(s.handleFirewallUpdateProfile)))
        s.mux.HandleFunc("DELETE /api/firewall/profiles/{id}", s.requireAuth(s.auditMiddleware(s.handleFirewallDeleteProfile)))
        s.mux.HandleFunc("POST /api/firewall/profiles/{id}/toggle", s.requireAuth(s.auditMiddleware(s.handleFirewallToggleProfile)))

        // ─── Firewall — NAT / Port Forwarding ───
        s.mux.HandleFunc("GET /api/firewall/nat", s.requireAuth(s.handleFirewallNATList))
        s.mux.HandleFunc("POST /api/firewall/nat", s.requireAuth(s.auditMiddleware(s.handleFirewallNATCreate)))
        s.mux.HandleFunc("PUT /api/firewall/nat/{id}", s.requireAuth(s.auditMiddleware(s.handleFirewallNATUpdate)))
        s.mux.HandleFunc("DELETE /api/firewall/nat/{id}", s.requireAuth(s.auditMiddleware(s.handleFirewallNATDelete)))
        s.mux.HandleFunc("POST /api/firewall/nat/{id}/toggle", s.requireAuth(s.auditMiddleware(s.handleFirewallNATToggle)))

        // ─── Firewall — Fail2ban ───
        s.mux.HandleFunc("GET /api/firewall/f2b/jails", s.requireAuth(s.handleFirewallF2BJails))
        s.mux.HandleFunc("POST /api/firewall/f2b/jails/{name}/toggle", s.requireAuth(s.auditMiddleware(s.handleFirewallF2BToggleJail)))
        s.mux.HandleFunc("GET /api/firewall/f2b/banned", s.requireAuth(s.handleFirewallF2BBanned))
        s.mux.HandleFunc("POST /api/firewall/f2b/banned", s.requireAuth(s.auditMiddleware(s.handleFirewallF2BBan)))
        s.mux.HandleFunc("DELETE /api/firewall/f2b/banned/{ip}", s.requireAuth(s.auditMiddleware(s.handleFirewallF2BUnban)))

        // ─── Firewall — Logs & Stats ───
        s.mux.HandleFunc("GET /api/firewall/logs", s.requireAuth(s.handleFirewallLogs))
        s.mux.HandleFunc("DELETE /api/firewall/logs", s.requireAuth(s.auditMiddleware(s.handleFirewallClearLogs)))
        s.mux.HandleFunc("GET /api/firewall/stats", s.requireAuth(s.handleFirewallStats))
        s.mux.HandleFunc("POST /api/firewall/command", s.requireAuth(s.handleFirewallBuildCommand))

        // ─── Firewall — Live log WebSocket ───
        s.mux.HandleFunc("GET /ws/firewall/logs", s.requireAuth(s.handleFirewallLogsWS))

        // ─── Web Server (nginx) ───
        s.mux.HandleFunc("GET /api/webserver/sites", s.requireAuth(s.handleWebServerSites))
        s.mux.HandleFunc("POST /api/webserver/sites", s.requireAuth(s.auditMiddleware(s.handleWebServerCreateSite)))
        s.mux.HandleFunc("PUT /api/webserver/sites/{name}", s.requireAuth(s.auditMiddleware(s.handleWebServerUpdateSite)))
        s.mux.HandleFunc("DELETE /api/webserver/sites/{name}", s.requireAuth(s.auditMiddleware(s.handleWebServerDeleteSite)))
        s.mux.HandleFunc("POST /api/webserver/sites/{name}/toggle", s.requireAuth(s.auditMiddleware(s.handleWebServerToggleSite)))
        s.mux.HandleFunc("GET /api/webserver/status", s.requireAuth(s.handleWebServerStatus))
        s.mux.HandleFunc("GET /api/webserver/performance", s.requireAuth(s.handleWebServerPerformance))
        s.mux.HandleFunc("GET /api/webserver/global", s.requireAuth(s.handleWebServerGlobalGet))
        s.mux.HandleFunc("PUT /api/webserver/global", s.requireAuth(s.auditMiddleware(s.handleWebServerGlobalPut)))
        s.mux.HandleFunc("POST /api/webserver/reload", s.requireAuth(s.auditMiddleware(s.handleWebServerReload)))
        s.mux.HandleFunc("POST /api/webserver/test", s.requireAuth(s.handleWebServerTest))
        s.mux.HandleFunc("POST /api/webserver/start", s.requireAuth(s.auditMiddleware(s.handleWebServerStart)))
        s.mux.HandleFunc("POST /api/webserver/stop", s.requireAuth(s.auditMiddleware(s.handleWebServerStop)))
        s.mux.HandleFunc("POST /api/webserver/restart", s.requireAuth(s.auditMiddleware(s.handleWebServerRestart)))
        s.mux.HandleFunc("GET /api/webserver/logs", s.requireAuth(s.handleWebServerLogs))

        // ─── Deploy Hooks ───
        s.mux.HandleFunc("GET /api/deploy/stats", s.requireAuth(s.handleDeployStats))
        s.mux.HandleFunc("GET /api/deploy/hooks", s.requireAuth(s.handleDeployList))
        s.mux.HandleFunc("POST /api/deploy/hooks", s.requireAuth(s.handleDeployCreate))
        s.mux.HandleFunc("PUT /api/deploy/hooks/{id}", s.requireAuth(s.handleDeployUpdate))
        s.mux.HandleFunc("DELETE /api/deploy/hooks/{id}", s.requireAuth(s.handleDeployDelete))
        s.mux.HandleFunc("POST /api/deploy/hooks/{id}/trigger", s.requireAuth(s.handleDeployTrigger))
        s.mux.HandleFunc("GET /api/deploy/hooks/{id}/runs", s.requireAuth(s.handleDeployHookRuns))
        s.mux.HandleFunc("GET /api/deploy/runs", s.requireAuth(s.handleDeployAllRuns))
        s.mux.HandleFunc("GET /api/deploy/runs/{run_id}", s.requireAuth(s.handleDeployRunGet))
        s.mux.HandleFunc("POST /webhook/{secret}", s.handleDeployWebhook)

        // ─── Containers (Docker) ───
        s.mux.HandleFunc("GET /api/containers", s.requireAuth(s.handleContainerList))
        s.mux.HandleFunc("POST /api/containers", s.requireAuth(s.handleContainerCreate))
        s.mux.HandleFunc("POST /api/containers/{id}/start", s.requireAuth(s.handleContainerStart))
        s.mux.HandleFunc("POST /api/containers/{id}/stop", s.requireAuth(s.handleContainerStop))
        s.mux.HandleFunc("POST /api/containers/{id}/restart", s.requireAuth(s.handleContainerRestart))
        s.mux.HandleFunc("DELETE /api/containers/{id}", s.requireAuth(s.handleContainerRemove))
        s.mux.HandleFunc("GET /api/containers/{id}/inspect", s.requireAuth(s.handleContainerInspect))
        s.mux.HandleFunc("GET /api/containers/images", s.requireAuth(s.handleImageList))
        s.mux.HandleFunc("POST /api/containers/images/pull", s.requireAuth(s.handleImagePull))
        s.mux.HandleFunc("DELETE /api/containers/images/{id}", s.requireAuth(s.handleImageRemove))
        s.mux.HandleFunc("GET /api/containers/volumes", s.requireAuth(s.handleVolumeList))
        s.mux.HandleFunc("GET /api/containers/networks", s.requireAuth(s.handleNetworkList))
        s.mux.HandleFunc("POST /api/containers/prune", s.requireAuth(s.handleSystemPrune))
        s.mux.HandleFunc("GET /api/docker/info", s.requireAuth(s.handleDockerSystemInfo))
        s.mux.HandleFunc("GET /ws/containers/{id}/logs", s.requireAuth(s.handleContainerLogsWS))
        s.mux.HandleFunc("GET /ws/containers/{id}/stats", s.requireAuth(s.handleContainerStatsWS))

        // ─── Uptime Monitors ───
        s.mux.HandleFunc("GET /api/uptime", s.requireAuth(s.handleUptimeList))
        s.mux.HandleFunc("POST /api/uptime", s.requireAuth(s.handleUptimeCreate))
        s.mux.HandleFunc("PUT /api/uptime/{id}", s.requireAuth(s.handleUptimeUpdate))
        s.mux.HandleFunc("DELETE /api/uptime/{id}", s.requireAuth(s.handleUptimeDelete))
        s.mux.HandleFunc("GET /api/uptime/{id}/summary", s.requireAuth(s.handleUptimeSummary))
        s.mux.HandleFunc("POST /api/uptime/{id}/ping", s.requireAuth(s.handleUptimePing))
        s.mux.HandleFunc("GET /api/uptime-stats", s.requireAuth(s.handleUptimeStats))
        // ─── Uptime Incidents ───
        s.mux.HandleFunc("GET /api/uptime-incidents", s.requireAuth(s.handleUptimeIncidentList))
        s.mux.HandleFunc("POST /api/uptime-incidents", s.requireAuth(s.handleUptimeIncidentCreate))
        s.mux.HandleFunc("GET /api/uptime-incidents/{incident_id}", s.requireAuth(s.handleUptimeIncidentGet))
        s.mux.HandleFunc("PUT /api/uptime-incidents/{incident_id}", s.requireAuth(s.handleUptimeIncidentUpdate))
        s.mux.HandleFunc("DELETE /api/uptime-incidents/{incident_id}", s.requireAuth(s.handleUptimeIncidentDelete))
        s.mux.HandleFunc("POST /api/uptime-incidents/{incident_id}/resolve", s.requireAuth(s.handleUptimeIncidentResolve))

        // ─── Security Audit ───
        s.mux.HandleFunc("GET /api/security/audit", s.requireAuth(s.handleSecurityAudit))
        s.mux.HandleFunc("GET /api/security/stats", s.requireAuth(s.handleSecurityStats))

        // ─── Alert Rules ───
        s.mux.HandleFunc("GET /api/alerts/rules", s.requireAuth(s.handleAlertRuleList))
        s.mux.HandleFunc("POST /api/alerts/rules", s.requireAuth(s.handleAlertRuleCreate))
        s.mux.HandleFunc("PUT /api/alerts/rules/{id}", s.requireAuth(s.handleAlertRuleUpdate))
        s.mux.HandleFunc("DELETE /api/alerts/rules/{id}", s.requireAuth(s.handleAlertRuleDelete))
        s.mux.HandleFunc("POST /api/alerts/rules/{id}/toggle", s.requireAuth(s.handleAlertRuleToggle))
        s.mux.HandleFunc("GET /api/alerts/events", s.requireAuth(s.handleAlertEventList))

        // ─── Cron Jobs ───
        s.mux.HandleFunc("GET /api/cron/jobs", s.requireAuth(s.handleCronList))
        s.mux.HandleFunc("POST /api/cron/jobs", s.requireAuth(s.handleCronCreate))
        s.mux.HandleFunc("PUT /api/cron/jobs/{id}", s.requireAuth(s.handleCronUpdate))
        s.mux.HandleFunc("DELETE /api/cron/jobs/{id}", s.requireAuth(s.handleCronDelete))
        s.mux.HandleFunc("POST /api/cron/jobs/{id}/run", s.requireAuth(s.handleCronRun))
        s.mux.HandleFunc("GET /api/cron/jobs/{id}/history", s.requireAuth(s.handleCronHistory))
        s.mux.HandleFunc("GET /api/cron/system", s.requireAuth(s.handleCronSystemList))

        // ─── Backups ───
        s.mux.HandleFunc("GET /api/backups", s.requireAuth(s.handleBackupList))
        s.mux.HandleFunc("POST /api/backups", s.requireAuth(s.handleBackupCreate))
        s.mux.HandleFunc("PUT /api/backups/{id}", s.requireAuth(s.handleBackupUpdate))
        s.mux.HandleFunc("DELETE /api/backups/{id}", s.requireAuth(s.handleBackupDelete))
        s.mux.HandleFunc("POST /api/backups/{id}/run", s.requireAuth(s.handleBackupRun))
        s.mux.HandleFunc("GET /api/backups/{id}/runs", s.requireAuth(s.handleBackupRuns))
        s.mux.HandleFunc("GET /api/backup-runs/{run_id}", s.requireAuth(s.handleBackupRunGet))

        // ─── Multi-server Fleet ───
        s.mux.HandleFunc("GET /api/servers", s.requireAuth(s.handleManagedServerList))
        s.mux.HandleFunc("POST /api/servers", s.requireAuth(s.handleManagedServerCreate))
        s.mux.HandleFunc("POST /api/servers/bulk/exec", s.requireAuth(s.handleManagedServerBulkExec))
        s.mux.HandleFunc("POST /api/servers/reorder", s.requireAuth(s.handleManagedServerReorder))
        s.mux.HandleFunc("POST /api/servers/test-connection", s.requireAuth(s.handleServerTestConnection))
        s.mux.HandleFunc("GET /api/servers/{id}", s.requireAuth(s.handleManagedServerGet))
        s.mux.HandleFunc("PUT /api/servers/{id}", s.requireAuth(s.handleManagedServerUpdate))
        s.mux.HandleFunc("DELETE /api/servers/{id}", s.requireAuth(s.handleManagedServerDelete))
        s.mux.HandleFunc("POST /api/servers/{id}/ping", s.requireAuth(s.handleManagedServerPing))
        s.mux.HandleFunc("POST /api/servers/{id}/exec", s.requireAuth(s.handleManagedServerExec))
        s.mux.HandleFunc("GET /api/servers/{id}/alerts", s.requireAuth(s.handleServerAlertList))
        s.mux.HandleFunc("POST /api/servers/{id}/alerts", s.requireAuth(s.handleServerAlertCreate))
        // ─── Server Groups ───
        s.mux.HandleFunc("GET /api/server-groups", s.requireAuth(s.handleServerGroupList))
        s.mux.HandleFunc("POST /api/server-groups", s.requireAuth(s.handleServerGroupCreate))
        s.mux.HandleFunc("PUT /api/server-groups/{id}", s.requireAuth(s.handleServerGroupUpdate))
        s.mux.HandleFunc("DELETE /api/server-groups/{id}", s.requireAuth(s.handleServerGroupDelete))
        s.mux.HandleFunc("POST /api/server-groups/{id}/members", s.requireAuth(s.handleServerGroupAddMember))
        s.mux.HandleFunc("DELETE /api/server-groups/{id}/members/{server_id}", s.requireAuth(s.handleServerGroupRemoveMember))
        // ─── Server Alerts ───
        s.mux.HandleFunc("GET /api/server-alerts", s.requireAuth(s.handleServerAlertListAll))
        s.mux.HandleFunc("POST /api/server-alerts/{alert_id}/resolve", s.requireAuth(s.handleServerAlertResolve))
        // ─── Command Library ───
        s.mux.HandleFunc("GET /api/server-commands", s.requireAuth(s.handleServerCommandList))
        s.mux.HandleFunc("POST /api/server-commands", s.requireAuth(s.handleServerCommandCreate))
        s.mux.HandleFunc("PUT /api/server-commands/{id}", s.requireAuth(s.handleServerCommandUpdate))
        s.mux.HandleFunc("DELETE /api/server-commands/{id}", s.requireAuth(s.handleServerCommandDelete))

        // ─── MCP Tokens ───
        s.mux.HandleFunc("GET /api/mcp/tokens", s.requireAuth(s.handleMCPTokenList))
        s.mux.HandleFunc("POST /api/mcp/tokens", s.requireAuth(s.handleMCPTokenCreate))
        s.mux.HandleFunc("DELETE /api/mcp/tokens/{id}", s.requireAuth(s.handleMCPTokenRevoke))
        s.mux.HandleFunc("GET /api/mcp/audit", s.requireAuth(s.handleMCPAuditLog))

        // ─── Notification Channels ───
        s.mux.HandleFunc("GET /api/notifications/channels", s.requireAuth(s.handleNotificationChannelList))
        s.mux.HandleFunc("POST /api/notifications/channels", s.requireAuth(s.handleNotificationChannelCreate))
        s.mux.HandleFunc("PUT /api/notifications/channels/{id}", s.requireAuth(s.handleNotificationChannelUpdate))
        s.mux.HandleFunc("DELETE /api/notifications/channels/{id}", s.requireAuth(s.handleNotificationChannelDelete))
        s.mux.HandleFunc("POST /api/notifications/channels/{id}/toggle", s.requireAuth(s.handleNotificationChannelToggle))
        s.mux.HandleFunc("POST /api/notifications/channels/{id}/test", s.requireAuth(s.handleNotificationTest))
        s.mux.HandleFunc("GET /api/notifications/events", s.requireAuth(s.handleNotificationEventList))

        // ─── Ports Management ───
        s.mux.HandleFunc("GET /api/ports/summary",         s.requireAuth(s.handlePortsSummary))
        s.mux.HandleFunc("GET /api/ports/listening",       s.requireAuth(s.handlePortsListening))
        s.mux.HandleFunc("GET /api/ports/connections",     s.requireAuth(s.handlePortsConnections))
        s.mux.HandleFunc("GET /api/ports/processes",       s.requireAuth(s.handlePortsProcesses))
        s.mux.HandleFunc("GET /api/ports/rules",           s.requireAuth(s.handlePortsRuleList))
        s.mux.HandleFunc("POST /api/ports/rules",          s.requireAuth(s.auditMiddleware(s.handlePortsRuleCreate)))
        s.mux.HandleFunc("DELETE /api/ports/rules/{id}",   s.requireAuth(s.auditMiddleware(s.handlePortsRuleDelete)))
        s.mux.HandleFunc("POST /api/ports/rules/{id}/toggle", s.requireAuth(s.auditMiddleware(s.handlePortsRuleToggle)))
        s.mux.HandleFunc("POST /api/ports/scan",           s.requireAuth(s.handlePortsScan))

        // ─── Plugins ───
        s.mux.HandleFunc("GET /api/plugins", s.requireAuth(s.handlePluginList))
        s.mux.HandleFunc("GET /api/plugins/{id}", s.requireAuth(s.handlePluginGet))
        s.mux.HandleFunc("POST /api/plugins/{id}/toggle", s.requireAuth(s.handlePluginToggle))
        s.mux.HandleFunc("POST /api/plugins/{id}/enable", s.requireAuth(s.handlePluginEnable))
        s.mux.HandleFunc("POST /api/plugins/{id}/disable", s.requireAuth(s.handlePluginDisable))
        s.mux.HandleFunc("PUT /api/plugins/{id}/config", s.requireAuth(s.handlePluginUpdateConfig))
        s.mux.HandleFunc("PUT /api/plugins/{id}/port-config", s.requireAuth(s.handlePluginUpdatePortConfig))
        s.mux.HandleFunc("POST /api/plugins/{id}/restart", s.requireAuth(s.handlePluginRestart))
        s.mux.HandleFunc("POST /api/plugins/{id}/install", s.requireAuth(s.handlePluginInstall))
        s.mux.HandleFunc("DELETE /api/plugins/{id}", s.requireAuth(s.handlePluginUninstall))
        s.mux.HandleFunc("GET /api/plugins/{id}/logs", s.requireAuth(s.handlePluginLogs))

        // ─── Server Apps (Marketplace) ───
        s.mux.HandleFunc("GET /api/apps", s.requireAuth(s.handleAppList))
        s.mux.HandleFunc("GET /api/apps/{id}", s.requireAuth(s.handleAppGet))
        s.mux.HandleFunc("GET /api/apps/{id}/status", s.requireAuth(s.handleAppStatus))
        s.mux.HandleFunc("GET /api/apps/{id}/logs", s.requireAuth(s.handleAppLogs))
        s.mux.HandleFunc("GET /api/apps/{id}/preflight", s.requireAuth(s.handleAppPreflightCheck))
        s.mux.HandleFunc("POST /api/apps/{id}/install", s.requireAuth(s.handleAppInstall))
        s.mux.HandleFunc("DELETE /api/apps/{id}", s.requireAuth(s.handleAppUninstall))
        s.mux.HandleFunc("POST /api/apps/{id}/{action}", s.requireAuth(s.handleAppControl))
        s.mux.HandleFunc("PUT /api/apps/{id}/config", s.requireAuth(s.handleAppUpdateConfig))

        // ─── SSH Key Vault ───
        s.mux.HandleFunc("GET /api/ssh/keys", s.requireAuth(s.handleSSHKeyList))
        s.mux.HandleFunc("POST /api/ssh/keys/generate", s.requireAuth(s.handleSSHKeyGenerate))
        s.mux.HandleFunc("POST /api/ssh/keys/import", s.requireAuth(s.handleSSHKeyImport))
        s.mux.HandleFunc("DELETE /api/ssh/keys/{id}", s.requireAuth(s.handleSSHKeyDelete))
        s.mux.HandleFunc("GET /api/ssh/keys/{id}/download", s.requireAuth(s.handleSSHKeyDownload))

        // ─── SSH Saved Connections ───
        s.mux.HandleFunc("GET /api/ssh/saved", s.requireAuth(s.handleSSHSavedList))
        s.mux.HandleFunc("POST /api/ssh/saved", s.requireAuth(s.handleSSHSavedCreate))
        s.mux.HandleFunc("PUT /api/ssh/saved/{id}", s.requireAuth(s.handleSSHSavedUpdate))
        s.mux.HandleFunc("DELETE /api/ssh/saved/{id}", s.requireAuth(s.handleSSHSavedDelete))

        // ─── SSH Sessions ───
        s.mux.HandleFunc("GET /api/ssh/sessions", s.requireAuth(s.handleSSHSessionList))
        s.mux.HandleFunc("POST /api/ssh/sessions", s.requireAuth(s.handleSSHSessionCreate))
        s.mux.HandleFunc("DELETE /api/ssh/sessions/{id}", s.requireAuth(s.handleSSHSessionTerminate))

        // ─── SSH Snippets ───
        s.mux.HandleFunc("GET /api/ssh/snippets", s.requireAuth(s.handleSSHSnippetList))
        s.mux.HandleFunc("POST /api/ssh/snippets", s.requireAuth(s.handleSSHSnippetCreate))
        s.mux.HandleFunc("PUT /api/ssh/snippets/{id}", s.requireAuth(s.handleSSHSnippetUpdate))
        s.mux.HandleFunc("DELETE /api/ssh/snippets/{id}", s.requireAuth(s.handleSSHSnippetDelete))
        s.mux.HandleFunc("POST /api/ssh/snippets/{id}/use", s.requireAuth(s.handleSSHSnippetUse))

        // ─── SSH Port Forwards ───
        s.mux.HandleFunc("GET /api/ssh/port-forwards", s.requireAuth(s.handleSSHPortForwardList))
        s.mux.HandleFunc("POST /api/ssh/port-forwards", s.requireAuth(s.handleSSHPortForwardCreate))
        s.mux.HandleFunc("DELETE /api/ssh/port-forwards/{id}", s.requireAuth(s.handleSSHPortForwardDelete))

        // ─── SSH Recordings ───
        s.mux.HandleFunc("GET /api/ssh/recordings", s.requireAuth(s.handleSSHRecordingList))

        // ─── SSH Collaborative Sessions ───
        s.mux.HandleFunc("GET /api/ssh/collab", s.requireAuth(s.handleCollabSessionList))
        s.mux.HandleFunc("POST /api/ssh/collab", s.requireAuth(s.handleCollabSessionCreate))
        s.mux.HandleFunc("DELETE /api/ssh/collab/{id}", s.requireAuth(s.handleCollabSessionDelete))
        s.mux.HandleFunc("GET /api/ssh/collab/{id}/participants", s.requireAuth(s.handleCollabParticipantList))
        s.mux.HandleFunc("POST /api/ssh/collab/{id}/participants", s.requireAuth(s.handleCollabParticipantAdd))
        s.mux.HandleFunc("PUT /api/ssh/collab/{id}/participants/{pid}", s.requireAuth(s.handleCollabParticipantUpdate))
        s.mux.HandleFunc("DELETE /api/ssh/collab/{id}/participants/{pid}", s.requireAuth(s.handleCollabParticipantRemove))

        // ─── File System ───
        s.mux.HandleFunc("GET /api/files/list", s.requireAuth(s.handleFSList))
        s.mux.HandleFunc("GET /api/files/stat", s.requireAuth(s.handleFSStat))
        s.mux.HandleFunc("GET /api/files/read", s.requireAuth(s.handleFSRead))
        s.mux.HandleFunc("POST /api/files/write", s.requireAuth(s.handleFSWrite))
        s.mux.HandleFunc("POST /api/files/upload", s.requireAuth(s.handleFSUpload))
        s.mux.HandleFunc("GET /api/files/download", s.requireAuth(s.handleFSDownload))
        s.mux.HandleFunc("POST /api/files/mkdir", s.requireAuth(s.handleFSMkdir))
        s.mux.HandleFunc("DELETE /api/files", s.requireAuth(s.handleFSDelete))
        s.mux.HandleFunc("POST /api/files/rename", s.requireAuth(s.handleFSRename))
        s.mux.HandleFunc("POST /api/files/chmod", s.requireAuth(s.handleFSChmod))
        s.mux.HandleFunc("POST /api/files/chown", s.requireAuth(s.handleFSChown))
        s.mux.HandleFunc("GET /api/files/search", s.requireAuth(s.handleFSSearch))
        s.mux.HandleFunc("POST /api/files/compress", s.requireAuth(s.handleFSCompress))
        s.mux.HandleFunc("POST /api/files/extract", s.requireAuth(s.handleFSExtract))
        s.mux.HandleFunc("GET /api/files/hex", s.requireAuth(s.handleFSHex))
        s.mux.HandleFunc("GET /api/files/archive-list", s.requireAuth(s.handleFSArchiveList))

        // ─── FTP Server ───
        s.mux.HandleFunc("GET /api/ftp/config", s.requireAuth(s.handleFTPConfigGet))
        s.mux.HandleFunc("PUT /api/ftp/config", s.requireAuth(s.handleFTPConfigPut))
        s.mux.HandleFunc("POST /api/ftp/service/{action}", s.requireAuth(s.handleFTPServiceAction))
        s.mux.HandleFunc("POST /api/ftp/test", s.requireAuth(s.handleFTPTestConfig))
        s.mux.HandleFunc("GET /api/ftp/users", s.requireAuth(s.handleFTPUserList))
        s.mux.HandleFunc("POST /api/ftp/users", s.requireAuth(s.handleFTPUserCreate))
        s.mux.HandleFunc("PUT /api/ftp/users/{id}", s.requireAuth(s.handleFTPUserUpdate))
        s.mux.HandleFunc("DELETE /api/ftp/users/{id}", s.requireAuth(s.handleFTPUserDelete))
        s.mux.HandleFunc("POST /api/ftp/users/{id}/toggle", s.requireAuth(s.handleFTPUserToggle))
        s.mux.HandleFunc("GET /api/ftp/quotas", s.requireAuth(s.handleFTPQuotaList))
        s.mux.HandleFunc("POST /api/ftp/quotas", s.requireAuth(s.handleFTPQuotaSet))
        s.mux.HandleFunc("DELETE /api/ftp/quotas/{username}", s.requireAuth(s.handleFTPQuotaDelete))
        s.mux.HandleFunc("GET /api/ftp/mounts", s.requireAuth(s.handleFTPMountList))
        s.mux.HandleFunc("POST /api/ftp/mounts", s.requireAuth(s.handleFTPMountAction))

        // ─── Certificates ───
        s.mux.HandleFunc("GET /api/certs", s.requireAuth(s.handleCertList))
        s.mux.HandleFunc("POST /api/certs", s.requireAuth(s.handleCertAdd))
        s.mux.HandleFunc("POST /api/certs/issue", s.requireAuth(s.handleCertIssue))
        s.mux.HandleFunc("POST /api/certs/self-signed", s.requireAuth(s.handleCertSelfSigned))
        s.mux.HandleFunc("POST /api/certs/{domain}/renew", s.requireAuth(s.handleCertRenew))
        s.mux.HandleFunc("DELETE /api/certs/{domain}", s.requireAuth(s.handleCertRevoke))
        s.mux.HandleFunc("GET /api/certs/{domain}/status", s.requireAuth(s.handleCertStatus))
        s.mux.HandleFunc("DELETE /api/certs/{domain}/untrack", s.requireAuth(s.handleCertDelete))

        // ─── CI/CD Pipelines ───
        s.mux.HandleFunc("GET /api/pipelines", s.requireAuth(s.handlePipelineList))
        s.mux.HandleFunc("POST /api/pipelines", s.requireAuth(s.handlePipelineCreate))
        s.mux.HandleFunc("GET /api/pipelines/{id}", s.requireAuth(s.handlePipelineGet))
        s.mux.HandleFunc("PUT /api/pipelines/{id}", s.requireAuth(s.handlePipelineUpdate))
        s.mux.HandleFunc("DELETE /api/pipelines/{id}", s.requireAuth(s.handlePipelineDelete))
        s.mux.HandleFunc("GET /api/pipelines/{id}/stages", s.requireAuth(s.handlePipelineStageList))
        s.mux.HandleFunc("POST /api/pipelines/{id}/stages", s.requireAuth(s.handlePipelineStageCreate))
        s.mux.HandleFunc("PUT /api/pipelines/{id}/stages/{stage_id}", s.requireAuth(s.handlePipelineStageUpdate))
        s.mux.HandleFunc("DELETE /api/pipelines/{id}/stages/{stage_id}", s.requireAuth(s.handlePipelineStageDelete))
        s.mux.HandleFunc("GET /api/pipelines/{id}/envs", s.requireAuth(s.handlePipelineEnvList))
        s.mux.HandleFunc("POST /api/pipelines/{id}/envs", s.requireAuth(s.handlePipelineEnvSet))
        s.mux.HandleFunc("DELETE /api/pipelines/{id}/envs/{key}", s.requireAuth(s.handlePipelineEnvDelete))
        s.mux.HandleFunc("GET /api/pipelines/{id}/runs", s.requireAuth(s.handlePipelineRunList))
        s.mux.HandleFunc("POST /api/pipelines/{id}/trigger", s.requireAuth(s.handlePipelineTrigger))
        s.mux.HandleFunc("GET /api/pipeline-runs/{run_id}", s.requireAuth(s.handlePipelineRunGet))
        s.mux.HandleFunc("POST /api/pipeline-runs/{run_id}/approve", s.requireAuth(s.handlePipelineRunApprove))
        s.mux.HandleFunc("POST /api/pipeline-runs/{run_id}/cancel", s.requireAuth(s.handlePipelineCancel))

        // ─── Remote Agents ───
        s.mux.HandleFunc("GET /api/agents", s.requireAuth(s.handleAgentList))
        s.mux.HandleFunc("GET /api/agents/{id}", s.requireAuth(s.handleAgentGet))
        s.mux.HandleFunc("DELETE /api/agents/{id}", s.requireAuth(s.handleAgentDelete))
        s.mux.HandleFunc("GET /api/agents/{id}/metrics", s.requireAuth(s.handleAgentMetricsGet))
        // Public agent endpoints (authenticated with agent bearer token, not user JWT)
        s.mux.HandleFunc("POST /api/agent/register", s.handleAgentRegister)
        s.mux.HandleFunc("POST /api/agent/heartbeat", s.handleAgentHeartbeat)
        s.mux.HandleFunc("POST /api/agent/metrics", s.handleAgentMetricsPush)

        // ─── Fail2Ban ───
        s.mux.HandleFunc("GET /api/fail2ban/status",              s.requireAuth(s.handleFail2banStatus))
        s.mux.HandleFunc("GET /api/fail2ban/jails",               s.requireAuth(s.handleFail2banJails))
        s.mux.HandleFunc("GET /api/fail2ban/jails/{name}",        s.requireAuth(s.handleFail2banJailGet))
        s.mux.HandleFunc("GET /api/fail2ban/jails/{name}/config", s.requireAuth(s.handleFail2banJailConfig))
        s.mux.HandleFunc("PUT /api/fail2ban/jails/{name}/config", s.requireAuth(s.handleFail2banJailConfigSave))
        s.mux.HandleFunc("POST /api/fail2ban/jails/{name}/ban",   s.requireAuth(s.handleFail2banBanIP))
        s.mux.HandleFunc("POST /api/fail2ban/jails/{name}/unban", s.requireAuth(s.handleFail2banUnbanIP))
        s.mux.HandleFunc("GET /api/fail2ban/bans",                s.requireAuth(s.handleFail2banBans))
        s.mux.HandleFunc("DELETE /api/fail2ban/bans",             s.requireAuth(s.handleFail2banUnbanGlobal))
        s.mux.HandleFunc("GET /api/fail2ban/logs",                s.requireAuth(s.handleFail2banLogs))
        s.mux.HandleFunc("GET /api/fail2ban/config",              s.requireAuth(s.handleFail2banConfig))
        s.mux.HandleFunc("PUT /api/fail2ban/config",              s.requireAuth(s.handleFail2banConfigSave))
        s.mux.HandleFunc("POST /api/fail2ban/service/{action}",   s.requireAuth(s.handleFail2banService))
        s.mux.HandleFunc("GET /api/fail2ban/whitelist",           s.requireAuth(s.handleFail2banWhitelist))
        s.mux.HandleFunc("POST /api/fail2ban/whitelist",          s.requireAuth(s.handleFail2banWhitelistAdd))
        s.mux.HandleFunc("DELETE /api/fail2ban/whitelist/{ip}",   s.requireAuth(s.handleFail2banWhitelistRemove))
        s.mux.HandleFunc("GET /api/fail2ban/filters",             s.requireAuth(s.handleFail2banFilters))
        s.mux.HandleFunc("GET /api/fail2ban/stats",               s.requireAuth(s.handleFail2banStats))
        s.mux.HandleFunc("POST /api/fail2ban/install",            s.requireAuth(s.handleFail2banInstall))

        // ─── CrowdSec ───
        s.mux.HandleFunc("GET /api/crowdsec/status",                        s.requireAuth(s.handleCrowdSecStatus))
        s.mux.HandleFunc("GET /api/crowdsec/alerts",                        s.requireAuth(s.handleCrowdSecAlerts))
        s.mux.HandleFunc("GET /api/crowdsec/decisions",                     s.requireAuth(s.handleCrowdSecDecisions))
        s.mux.HandleFunc("POST /api/crowdsec/decisions",                    s.requireAuth(s.handleCrowdSecAddDecision))
        s.mux.HandleFunc("DELETE /api/crowdsec/decisions",                  s.requireAuth(s.handleCrowdSecDeleteDecisionByIP))
        s.mux.HandleFunc("DELETE /api/crowdsec/decisions/{id}",             s.requireAuth(s.handleCrowdSecDeleteDecision))
        s.mux.HandleFunc("GET /api/crowdsec/bouncers",                      s.requireAuth(s.handleCrowdSecBouncers))
        s.mux.HandleFunc("GET /api/crowdsec/hub",                           s.requireAuth(s.handleCrowdSecHub))
        s.mux.HandleFunc("POST /api/crowdsec/hub/update",                   s.requireAuth(s.handleCrowdSecHubUpdate))
        s.mux.HandleFunc("POST /api/crowdsec/hub/upgrade",                  s.requireAuth(s.handleCrowdSecHubUpgrade))
        s.mux.HandleFunc("POST /api/crowdsec/collections/install",          s.requireAuth(s.handleCrowdSecCollectionInstall))
        s.mux.HandleFunc("DELETE /api/crowdsec/collections/{name}",         s.requireAuth(s.handleCrowdSecCollectionRemove))
        s.mux.HandleFunc("POST /api/crowdsec/service/{action}",             s.requireAuth(s.handleCrowdSecService))
        s.mux.HandleFunc("GET /api/crowdsec/logs",                          s.requireAuth(s.handleCrowdSecLogs))
        s.mux.HandleFunc("GET /api/crowdsec/metrics",                       s.requireAuth(s.handleCrowdSecMetrics))
        s.mux.HandleFunc("POST /api/crowdsec/install",                      s.requireAuth(s.handleCrowdSecInstall))
        s.mux.HandleFunc("GET /api/crowdsec/config",                        s.requireAuth(s.handleCrowdSecConfig))
        s.mux.HandleFunc("PUT /api/crowdsec/config",                        s.requireAuth(s.handleCrowdSecConfigSave))
        s.mux.HandleFunc("GET /api/crowdsec/acquis",                        s.requireAuth(s.handleCrowdSecAcquis))
        s.mux.HandleFunc("PUT /api/crowdsec/acquis",                        s.requireAuth(s.handleCrowdSecAcquisSave))
        s.mux.HandleFunc("POST /api/crowdsec/allowlist",                    s.requireAuth(s.handleCrowdSecAllowlistAdd))

        // ─── Suricata ───
        s.mux.HandleFunc("GET /api/suricata/status",                s.requireAuth(s.handleSuricataStatus))
        s.mux.HandleFunc("GET /api/suricata/alerts",                s.requireAuth(s.handleSuricataAlerts))
        s.mux.HandleFunc("GET /api/suricata/rules",                 s.requireAuth(s.handleSuricataRules))
        s.mux.HandleFunc("POST /api/suricata/rules",                s.requireAuth(s.handleSuricataRuleCreate))
        s.mux.HandleFunc("PUT /api/suricata/rules/toggle",          s.requireAuth(s.handleSuricataRuleToggle))
        s.mux.HandleFunc("GET /api/suricata/http",                  s.requireAuth(s.handleSuricataHTTP))
        s.mux.HandleFunc("GET /api/suricata/dns",                   s.requireAuth(s.handleSuricataDNS))
        s.mux.HandleFunc("GET /api/suricata/tls",                   s.requireAuth(s.handleSuricataTLS))
        s.mux.HandleFunc("GET /api/suricata/logs",                  s.requireAuth(s.handleSuricataLogs))
        s.mux.HandleFunc("GET /api/suricata/stats",                 s.requireAuth(s.handleSuricataStats))
        s.mux.HandleFunc("GET /api/suricata/config",                s.requireAuth(s.handleSuricataConfig))
        s.mux.HandleFunc("PUT /api/suricata/config",                s.requireAuth(s.handleSuricataConfigSave))
        s.mux.HandleFunc("POST /api/suricata/service/{action}",     s.requireAuth(s.handleSuricataService))
        s.mux.HandleFunc("POST /api/suricata/reload-rules",         s.requireAuth(s.handleSuricataReloadRules))
        s.mux.HandleFunc("POST /api/suricata/update-rules",         s.requireAuth(s.handleSuricataUpdateRules))
        s.mux.HandleFunc("GET /api/suricata/hostbits",              s.requireAuth(s.handleSuricataHostbits))
        s.mux.HandleFunc("POST /api/suricata/hostbits",             s.requireAuth(s.handleSuricataHostbitAdd))
        s.mux.HandleFunc("DELETE /api/suricata/hostbits",           s.requireAuth(s.handleSuricataHostbitRemove))
        s.mux.HandleFunc("POST /api/suricata/drop-ip",              s.requireAuth(s.handleSuricataDropIP))
        s.mux.HandleFunc("GET /api/suricata/interfaces",            s.requireAuth(s.handleSuricataInterfaces))
        s.mux.HandleFunc("POST /api/suricata/install",              s.requireAuth(s.handleSuricataInstall))
        s.mux.HandleFunc("POST /api/suricata/socket",               s.requireAuth(s.handleSuricataSocket))

        // ─── Wazuh ───
        s.mux.HandleFunc("GET /api/wazuh/status",                          s.requireAuth(s.handleWazuhStatus))
        s.mux.HandleFunc("GET /api/wazuh/agents",                          s.requireAuth(s.handleWazuhAgents))
        s.mux.HandleFunc("GET /api/wazuh/agents/{id}",                     s.requireAuth(s.handleWazuhAgentGet))
        s.mux.HandleFunc("POST /api/wazuh/agents",                         s.requireAuth(s.handleWazuhAgentAdd))
        s.mux.HandleFunc("DELETE /api/wazuh/agents/{id}",                  s.requireAuth(s.handleWazuhAgentDelete))
        s.mux.HandleFunc("POST /api/wazuh/agents/{id}/restart",            s.requireAuth(s.handleWazuhAgentRestart))
        s.mux.HandleFunc("GET /api/wazuh/alerts",                          s.requireAuth(s.handleWazuhAlerts))
        s.mux.HandleFunc("GET /api/wazuh/rules",                           s.requireAuth(s.handleWazuhRules))
        s.mux.HandleFunc("POST /api/wazuh/rules",                          s.requireAuth(s.handleWazuhRuleCreate))
        s.mux.HandleFunc("GET /api/wazuh/fim",                             s.requireAuth(s.handleWazuhFIM))
        s.mux.HandleFunc("GET /api/wazuh/vulnerabilities",                 s.requireAuth(s.handleWazuhVulnerabilities))
        s.mux.HandleFunc("GET /api/wazuh/groups",                          s.requireAuth(s.handleWazuhGroups))
        s.mux.HandleFunc("POST /api/wazuh/groups",                         s.requireAuth(s.handleWazuhGroupCreate))
        s.mux.HandleFunc("GET /api/wazuh/logs",                            s.requireAuth(s.handleWazuhLogs))
        s.mux.HandleFunc("GET /api/wazuh/config",                          s.requireAuth(s.handleWazuhConfig))
        s.mux.HandleFunc("PUT /api/wazuh/config",                          s.requireAuth(s.handleWazuhConfigSave))
        s.mux.HandleFunc("POST /api/wazuh/service/{action}",               s.requireAuth(s.handleWazuhService))
        s.mux.HandleFunc("PUT /api/wazuh/active-response/{agentId}",       s.requireAuth(s.handleWazuhActiveResponse))
        s.mux.HandleFunc("GET /api/wazuh/stats",                           s.requireAuth(s.handleWazuhStats))
        s.mux.HandleFunc("POST /api/wazuh/install",                        s.requireAuth(s.handleWazuhInstall))
        s.mux.HandleFunc("GET /api/wazuh/agent-install-script",            s.requireAuth(s.handleWazuhAgentInstallScript))
        s.mux.HandleFunc("POST /api/wazuh/api-test",                       s.requireAuth(s.handleWazuhAPITest))

        // ─── Git Actions ───
        s.mux.HandleFunc("GET /api/git-actions/status",                    s.requireAuth(s.handleGitActionsStatus))
        s.mux.HandleFunc("GET /api/git-actions/workflows",                 s.requireAuth(s.handleGitWorkflowList))
        s.mux.HandleFunc("POST /api/git-actions/workflows",                s.requireAuth(s.handleGitWorkflowCreate))
        s.mux.HandleFunc("PUT /api/git-actions/workflows/{id}",            s.requireAuth(s.handleGitWorkflowUpdate))
        s.mux.HandleFunc("DELETE /api/git-actions/workflows/{id}",         s.requireAuth(s.handleGitWorkflowDelete))
        s.mux.HandleFunc("POST /api/git-actions/trigger/{id}",             s.requireAuth(s.handleGitTrigger))
        s.mux.HandleFunc("GET /api/git-actions/runs",                      s.requireAuth(s.handleGitRunList))
        s.mux.HandleFunc("GET /api/git-actions/runs/{id}",                 s.requireAuth(s.handleGitRunGet))
        s.mux.HandleFunc("GET /api/git-actions/runs/{id}/logs",            s.requireAuth(s.handleGitRunLogs))
        s.mux.HandleFunc("POST /api/git-actions/runs/{id}/cancel",         s.requireAuth(s.handleGitRunCancel))
        s.mux.HandleFunc("POST /api/git-actions/runs/{id}/retry",          s.requireAuth(s.handleGitRunRetry))
        s.mux.HandleFunc("GET /api/git-actions/webhooks",                  s.requireAuth(s.handleGitWebhookInfo))
        s.mux.HandleFunc("PUT /api/git-actions/webhooks/secret",           s.requireAuth(s.handleGitWebhookSecretUpdate))
        s.mux.HandleFunc("GET /api/git-actions/settings",                  s.requireAuth(s.handleGitSettingsGet))
        s.mux.HandleFunc("PUT /api/git-actions/settings",                  s.requireAuth(s.handleGitSettingsPut))
        s.mux.HandleFunc("POST /api/git-actions/webhook/{provider}",       s.handleGitWebhook) // public

        // ─── Settings (extended sections) ───
        s.mux.HandleFunc("GET /api/settings/security-config",     s.requireAuth(s.handleSettingsSecurityConfigGet))
        s.mux.HandleFunc("PUT /api/settings/security-config",     s.requireAuth(s.handleSettingsSecurityConfigPut))
        s.mux.HandleFunc("GET /api/settings/api-config",          s.requireAuth(s.handleSettingsAPIConfigGet))
        s.mux.HandleFunc("PUT /api/settings/api-config",          s.requireAuth(s.handleSettingsAPIConfigPut))
        s.mux.HandleFunc("GET /api/settings/audit-config",        s.requireAuth(s.handleSettingsAuditConfigGet))
        s.mux.HandleFunc("PUT /api/settings/audit-config",        s.requireAuth(s.handleSettingsAuditConfigPut))

        // ─── Database Management ───
        s.mux.HandleFunc("GET /api/database/connections",                              s.requireAuth(s.handleDBConnectionList))
        s.mux.HandleFunc("POST /api/database/connections",                             s.requireAuth(s.handleDBConnectionCreate))
        s.mux.HandleFunc("PUT /api/database/connections/{id}",                         s.requireAuth(s.handleDBConnectionUpdate))
        s.mux.HandleFunc("DELETE /api/database/connections/{id}",                      s.requireAuth(s.handleDBConnectionDelete))
        s.mux.HandleFunc("POST /api/database/connections/{id}/test",                   s.requireAuth(s.handleDBConnectionTest))
        s.mux.HandleFunc("POST /api/database/connections/{id}/refresh",                s.requireAuth(s.handleDBConnectionRefresh))
        s.mux.HandleFunc("GET /api/database/connections/{id}/databases",               s.requireAuth(s.handleDBListDatabases))
        s.mux.HandleFunc("GET /api/database/connections/{id}/databases/{db}/tables",   s.requireAuth(s.handleDBListTables))
        s.mux.HandleFunc("GET /api/database/connections/{id}/databases/{db}/tables/{table}/columns", s.requireAuth(s.handleDBListColumns))
        s.mux.HandleFunc("GET /api/database/connections/{id}/databases/{db}/tables/{table}/data",    s.requireAuth(s.handleDBTableData))
        s.mux.HandleFunc("GET /api/database/connections/{id}/databases/{db}/tables/{table}/indexes", s.requireAuth(s.handleDBTableIndexes))
        s.mux.HandleFunc("POST /api/database/query",                                   s.requireAuth(s.handleDBExecuteQuery))
        s.mux.HandleFunc("GET /api/database/query/history",                            s.requireAuth(s.handleDBQueryHistory))
        s.mux.HandleFunc("DELETE /api/database/query/history/{id}",                    s.requireAuth(s.handleDBQueryHistoryDelete))
        s.mux.HandleFunc("GET /api/database/stats",                                    s.requireAuth(s.handleDBStats))
        s.mux.HandleFunc("GET /api/database/saved-queries",                            s.requireAuth(s.handleDBSavedQueryList))
        s.mux.HandleFunc("POST /api/database/saved-queries",                           s.requireAuth(s.handleDBSavedQueryCreate))
        s.mux.HandleFunc("PUT /api/database/saved-queries/{id}",                       s.requireAuth(s.handleDBSavedQueryUpdate))
        s.mux.HandleFunc("DELETE /api/database/saved-queries/{id}",                    s.requireAuth(s.handleDBSavedQueryDelete))

        // ─── OpenAPI / Swagger Docs ───
        s.mux.HandleFunc("GET /api/docs/openapi.json", s.handleOpenAPIDocs)
        s.mux.HandleFunc("GET /api/docs", s.handleSwaggerUI)
        s.mux.HandleFunc("GET /api/docs/", s.handleSwaggerUI)

        // ─── Terminal WebSocket ───
        s.mux.HandleFunc("GET /ws/terminal", s.requireAuth(s.handleTerminalWS))

        // ─── Serve embedded React SPA (catch-all) ───
        s.mux.Handle("/", spaHandler{fs: http.FS(staticFiles)})
}
