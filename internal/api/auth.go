package api

import (
        "database/sql"
        "encoding/json"
        "net/http"
        "time"

        "github.com/KenyanRedwoods01/Orbit/internal/auth"
)

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
        var req struct {
                Username string `json:"username"`
                Password string `json:"password"`
        }
        if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
                http.Error(w, "bad request", http.StatusBadRequest)
                return
        }

        var userID int64
        var pwHash, role string
        err := s.db.SQL.QueryRowContext(r.Context(),
                `SELECT id, pw_hash, COALESCE(role,'admin') FROM users WHERE username = ?`, req.Username,
        ).Scan(&userID, &pwHash, &role)
        if err == sql.ErrNoRows {
                http.Error(w, "invalid credentials", http.StatusUnauthorized)
                return
        } else if err != nil {
                http.Error(w, "internal error", http.StatusInternalServerError)
                return
        }

        if err := auth.CheckPassword(pwHash, req.Password); err != nil {
                http.Error(w, "invalid credentials", http.StatusUnauthorized)
                return
        }
        if role == "" {
                role = "admin"
        }

        token, err := auth.IssueToken([]byte(s.cfg.SecretKey), userID, req.Username, role, 24*time.Hour)
        if err != nil {
                http.Error(w, "internal error", http.StatusInternalServerError)
                return
        }

        http.SetCookie(w, &http.Cookie{
                Name:     "orbit_session",
                Value:    token,
                Path:     "/",
                HttpOnly: true,
                Secure:   s.cfg.TLSCertFile != "",
                SameSite: http.SameSiteLaxMode,
                MaxAge:   int((24 * time.Hour).Seconds()),
        })

        // Return {username, scope} to match the LoginResponse type in api.ts
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]string{ //nolint:errcheck
                "username": req.Username,
                "scope":    role,
        })
}

func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request) {
        http.SetCookie(w, &http.Cookie{
                Name:     "orbit_session",
                Value:    "",
                Path:     "/",
                HttpOnly: true,
                Secure:   s.cfg.TLSCertFile != "",
                MaxAge:   -1,
        })
        w.WriteHeader(http.StatusNoContent)
}
