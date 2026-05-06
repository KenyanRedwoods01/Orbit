package api

import (
	"context"
	"net/http"

	"github.com/KenyanRedwoods01/Orbit/internal/auth"
)

// requireAuth wraps a handler and validates the session JWT from the cookie.
// It injects JWT claims into the request context for downstream handlers.
func (s *Server) requireAuth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
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
		// Inject claims into context so handlers can read them
		ctx := context.WithValue(r.Context(), ctxKeyClaims, &jwtClaims{
			UserID:   claims.UserID,
			Username: claims.Username,
			Role:     claims.Scope,
		})
		next(w, r.WithContext(ctx))
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
