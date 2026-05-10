package api

import (
	"context"
	"net/http"
	"time"

	"github.com/KenyanRedwoods01/Orbit/internal/auth"
)

// requireAuth wraps a handler and validates the session JWT from the cookie
// or a Bearer token (API token or MCP token). It injects JWT claims into
// the request context for downstream handlers.
func (s *Server) requireAuth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Check Bearer token first (API tokens / MCP tokens)
		if claims := s.validateBearerToken(r); claims != nil {
			// Verify scope for state-changing operations
			if r.Method == http.MethodPost || r.Method == http.MethodPut ||
				r.Method == http.MethodDelete || r.Method == http.MethodPatch {
				if !scopeAllowsWrite(claims.Role) {
					http.Error(w, "forbidden: token scope does not allow write operations", http.StatusForbidden)
					return
				}
			}
			// Per-user rate limit for mutations
			if r.Method == http.MethodPost || r.Method == http.MethodPut ||
				r.Method == http.MethodDelete || r.Method == http.MethodPatch {
				key := "user:" + claims.UserID
				if !userRateLimiter.allow(key) {
					http.Error(w, "rate limit exceeded", http.StatusTooManyRequests)
					return
				}
			}
			ctx := context.WithValue(r.Context(), ctxKeyClaims, claims)
			next(w, r.WithContext(ctx))
			return
		}

		// Fall back to cookie-based JWT session
		cookie, err := r.Cookie("orbit_session")
		if err != nil {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		claims, err := auth.VerifyToken([]byte(s.cfg.SecretKey), cookie.Value)
		if err != nil {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		// Server-side session revocation check: verify session exists in DB
		tokenHash := hashSHA256Hex(cookie.Value)
		var expiresAt int64
		err = s.db.SQL.QueryRowContext(r.Context(),
			`SELECT expires_at FROM sessions WHERE token_hash=?`, tokenHash,
		).Scan(&expiresAt)
		if err != nil || expiresAt < time.Now().Unix() {
			http.Error(w, "session revoked or expired", http.StatusUnauthorized)
			return
		}

		// Verify scope for state-changing operations
		if r.Method == http.MethodPost || r.Method == http.MethodPut ||
			r.Method == http.MethodDelete || r.Method == http.MethodPatch {
			if !scopeAllowsWrite(claims.Scope) {
				http.Error(w, "forbidden: session scope does not allow write operations", http.StatusForbidden)
				return
			}
		}

		// Per-user rate limit for mutations
		if r.Method == http.MethodPost || r.Method == http.MethodPut ||
			r.Method == http.MethodDelete || r.Method == http.MethodPatch {
			key := "user:" + claims.UserID
			if !userRateLimiter.allow(key) {
				http.Error(w, "rate limit exceeded", http.StatusTooManyRequests)
				return
			}
		}

		// Inject claims into context so handlers can read them
		ctx := context.WithValue(r.Context(), ctxKeyClaims, &jwtClaims{
			UserID:   claims.UserID,
			Username: claims.Username,
			Role:     claims.Scope,
		})
		next(w, r.WithContext(ctx))
	}
}

// scopeAllowsWrite returns true if the token scope permits write operations.
func scopeAllowsWrite(scope string) bool {
	switch scope {
	case "admin", "write", "ui", "deploy":
		return true
	case "read-only", "read:servers", "mcp_read":
		return false
	default:
		// Unknown scopes default to read-only
		return false
	}
}

// requireAdmin wraps a handler and additionally enforces the "admin" role.
func (s *Server) requireAdmin(next http.HandlerFunc) http.HandlerFunc {
	return s.requireAuth(func(w http.ResponseWriter, r *http.Request) {
		c := claimsFromCtx(r)
		if c == nil || (c.Role != "admin") {
			http.Error(w, "forbidden: admin role required", http.StatusForbidden)
			return
		}
		next(w, r)
	})
}
