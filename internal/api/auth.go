package api

import (
	"bytes"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"io"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/KenyanRedwoods01/Orbit/internal/auth"
	"golang.org/x/crypto/bcrypt"
)

// ── Login Rate Limiter ─────────────────────────────────────────────────────────
// Allows 5 attempts per IP per 15 minutes. Implemented as a sliding window.

type loginBucket struct {
	attempts []time.Time
	mu       sync.Mutex
}

var (
	loginBuckets   = make(map[string]*loginBucket)
	loginBucketsMu sync.Mutex
)

const (
	loginMaxAttempts = 5
	loginWindow      = 15 * time.Minute
)

func loginRateLimiter(next http.HandlerFunc) http.HandlerFunc {
	go func() {
		t := time.NewTicker(5 * time.Minute)
		for range t.C {
			purgeLoginBuckets()
		}
	}()

	return func(w http.ResponseWriter, r *http.Request) {
		ip := extractIP(r.RemoteAddr)

		loginBucketsMu.Lock()
		b, ok := loginBuckets[ip]
		if !ok {
			b = &loginBucket{}
			loginBuckets[ip] = b
		}
		loginBucketsMu.Unlock()

		b.mu.Lock()
		now := time.Now()
		cutoff := now.Add(-loginWindow)
		fresh := b.attempts[:0]
		for _, t := range b.attempts {
			if t.After(cutoff) {
				fresh = append(fresh, t)
			}
		}
		b.attempts = fresh
		if len(b.attempts) >= loginMaxAttempts {
			b.mu.Unlock()
			w.Header().Set("Retry-After", "900")
			http.Error(w, "too many login attempts, try again later", http.StatusTooManyRequests)
			return
		}
		b.attempts = append(b.attempts, now)
		b.mu.Unlock()

		next(w, r)
	}
}

func purgeLoginBuckets() {
	loginBucketsMu.Lock()
	defer loginBucketsMu.Unlock()
	cutoff := time.Now().Add(-loginWindow)
	for ip, b := range loginBuckets {
		b.mu.Lock()
		fresh := b.attempts[:0]
		for _, t := range b.attempts {
			if t.After(cutoff) {
				fresh = append(fresh, t)
			}
		}
		b.attempts = fresh
		if len(b.attempts) == 0 {
			delete(loginBuckets, ip)
		}
		b.mu.Unlock()
	}
}

func extractIP(addr string) string {
	host, _, err := net.SplitHostPort(addr)
	if err != nil {
		return addr
	}
	return host
}

// ── Handlers ───────────────────────────────────────────────────────────────────

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	// Read and cache body so we can decode it twice (login + TOTP)
	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	r.Body = io.NopCloser(bytes.NewReader(body))

	var req struct {
		Username string `json:"username"`
		Password string `json:"password"`
		TOTPCode string `json:"totp_code"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}

	var userID int64
	var pwHash, role string
	err = s.db.SQL.QueryRowContext(r.Context(),
		`SELECT id, pw_hash, COALESCE(role,'admin') FROM users WHERE username = ?`, req.Username,
	).Scan(&userID, &pwHash, &role)
	if err == sql.ErrNoRows {
		auth.CheckPassword("$2a$10$invalid.hash.padding.for.timing.safety.xxxxxxxxxx", req.Password) //nolint:errcheck
		http.Error(w, "invalid credentials", http.StatusUnauthorized)
		return
	} else if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	if pwHash == "" {
		http.Error(w, "invalid credentials", http.StatusUnauthorized)
		return
	}
	if err := auth.CheckPassword(pwHash, req.Password); err != nil {
		http.Error(w, "invalid credentials", http.StatusUnauthorized)
		return
	}
	if role == "" {
		role = "admin"
	}

	// Check if user has TOTP enabled — if so, require TOTP code in same request
	var totpSecret string
	s.db.SQL.QueryRowContext(r.Context(), `SELECT COALESCE(totp_secret,'') FROM users WHERE id=?`, userID).Scan(&totpSecret)
	totpEnabled := totpSecret != "" && !strings.HasPrefix(totpSecret, "pending:")
	if totpEnabled {
		if req.TOTPCode == "" {
			http.Error(w, "totp_code is required when 2FA is enabled", http.StatusUnauthorized)
			return
		}
		if !totpVerify(totpSecret, req.TOTPCode) {
			// Try backup code
			var backupValid bool
			bkRows, _ := s.db.SQL.QueryContext(r.Context(),
				`SELECT id, code_hash FROM totp_backup_codes WHERE user_id=? AND used=0`, userID)
			if bkRows != nil {
				for bkRows.Next() {
					var cid int64
					var hash string
					bkRows.Scan(&cid, &hash)
					if bcrypt.CompareHashAndPassword([]byte(hash), []byte(req.TOTPCode)) == nil {
						s.db.SQL.ExecContext(r.Context(),
							`UPDATE totp_backup_codes SET used=1, used_at=unixepoch() WHERE id=?`, cid)
						backupValid = true
						break
					}
				}
				bkRows.Close()
			}
			if !backupValid {
				http.Error(w, "invalid credentials", http.StatusUnauthorized)
				return
			}
		}
	}

	// Enforce max concurrent sessions (reject oldest if over limit)
	const maxSessions = 10
	var sessionCount int
	s.db.SQL.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM sessions WHERE user_id=? AND expires_at>?`, userID, time.Now().Unix()).Scan(&sessionCount)
	if sessionCount >= maxSessions {
		// Delete oldest session to stay within limit
		s.db.SQL.ExecContext(r.Context(),
			`DELETE FROM sessions WHERE id IN (SELECT id FROM sessions WHERE user_id=? ORDER BY created_at ASC LIMIT ?)`,
			userID, sessionCount-maxSessions+1)
	}

	clientIP := extractAuditIP(r)
	token, err := auth.IssueToken([]byte(s.cfg.SecretKey), userID, req.Username, role, clientIP, 24*time.Hour)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	// Store session hash in DB for server-side revocation support
	tokenHash := sha256.Sum256([]byte(token))
	tokenHashHex := hex.EncodeToString(tokenHash[:])
	expiresAt := time.Now().Add(24 * time.Hour).Unix()
	s.db.SQL.ExecContext(r.Context(), //nolint:errcheck
		`INSERT OR REPLACE INTO sessions (user_id, token_hash, scope, expires_at) VALUES (?,?,?,?)`,
		userID, tokenHashHex, role, expiresAt,
	)

	secureCookie := s.cfg.TLSCertFile != "" || r.TLS != nil
	http.SetCookie(w, &http.Cookie{
		Name:     "orbit_session",
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		Secure:   secureCookie,
		SameSite: http.SameSiteStrictMode,
		MaxAge:   int((24 * time.Hour).Seconds()),
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{ //nolint:errcheck
		"username": req.Username,
		"scope":    role,
	})
}

func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request) {
	// Revoke session in DB
	if cookie, err := r.Cookie("orbit_session"); err == nil {
		tokenHash := sha256.Sum256([]byte(cookie.Value))
		tokenHashHex := hex.EncodeToString(tokenHash[:])
		s.db.SQL.ExecContext(r.Context(), //nolint:errcheck
			`DELETE FROM sessions WHERE token_hash=?`, tokenHashHex,
		)
	}

	secureCookie := s.cfg.TLSCertFile != "" || r.TLS != nil
	http.SetCookie(w, &http.Cookie{
		Name:     "orbit_session",
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		Secure:   secureCookie,
		SameSite: http.SameSiteStrictMode,
		MaxAge:   -1,
	})
	w.WriteHeader(http.StatusNoContent)
}
