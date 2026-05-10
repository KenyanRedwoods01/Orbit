package api

import (
        "database/sql"
        "encoding/json"
        "net/http"
        "strings"

        "github.com/KenyanRedwoods01/Orbit/internal/auth"
)

// ── Profile types ─────────────────────────────────────────────────────────────

type profileRecord struct {
        ID             int64  `json:"id"`
        Username       string `json:"username"`
        Email          string `json:"email"`
        DisplayName    string `json:"display_name"`
        Bio            string `json:"bio"`
        AvatarColor    string `json:"avatar_color"`
        Role           string `json:"role"`
        CreatedAt      int64  `json:"created_at"`
        TOTPEnabled    bool   `json:"totp_enabled"`
        BackupCodesLeft int   `json:"backup_codes_left"`
}

type sessionRecord struct {
        ID        int64  `json:"id"`
        Scope     string `json:"scope"`
        CreatedAt int64  `json:"created_at"`
        ExpiresAt int64  `json:"expires_at"`
        Current   bool   `json:"current"`
}

type profileActivity struct {
        ID      int64  `json:"id"`
        TS      int64  `json:"ts"`
        Action  string `json:"action"`
        Details string `json:"details"`
        IP      string `json:"ip"`
}

// ── Handlers ──────────────────────────────────────────────────────────────────

func (s *Server) handleProfileGet(w http.ResponseWriter, r *http.Request) {
        claims := claimsFromCtx(r)
        if claims == nil {
                http.Error(w, "unauthorized", http.StatusUnauthorized)
                return
        }

        var p profileRecord
        var totpSecret string
        err := s.db.SQL.QueryRowContext(r.Context(),
                `SELECT id, username, COALESCE(email,''), COALESCE(display_name,''), COALESCE(bio,''),
                        COALESCE(avatar_color,'#3b82f6'), role, created_at, COALESCE(totp_secret,'')
                 FROM users WHERE id=?`, claims.UserID,
        ).Scan(&p.ID, &p.Username, &p.Email, &p.DisplayName, &p.Bio, &p.AvatarColor,
                &p.Role, &p.CreatedAt, &totpSecret)
        if err == sql.ErrNoRows {
                http.Error(w, "user not found", http.StatusNotFound)
                return
        }
        if err != nil {
                http.Error(w, "db error", http.StatusInternalServerError)
                return
        }

        p.TOTPEnabled = totpSecret != "" && !strings.HasPrefix(totpSecret, "pending:")
        s.db.SQL.QueryRowContext(r.Context(), //nolint:errcheck
                `SELECT COUNT(*) FROM totp_backup_codes WHERE user_id=? AND used=0`, claims.UserID,
        ).Scan(&p.BackupCodesLeft)

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(p) //nolint:errcheck
}

func (s *Server) handleProfileUpdate(w http.ResponseWriter, r *http.Request) {
        claims := claimsFromCtx(r)
        if claims == nil {
                http.Error(w, "unauthorized", http.StatusUnauthorized)
                return
        }

        var req struct {
                Email       string `json:"email"`
                DisplayName string `json:"display_name"`
                Bio         string `json:"bio"`
                AvatarColor string `json:"avatar_color"`
        }
        if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
                http.Error(w, "bad request", http.StatusBadRequest)
                return
        }

        _, err := s.db.SQL.ExecContext(r.Context(),
                `UPDATE users SET email=?, display_name=?, bio=?, avatar_color=? WHERE id=?`,
                req.Email, req.DisplayName, req.Bio, req.AvatarColor, claims.UserID,
        )
        if err != nil {
                http.Error(w, "db error", http.StatusInternalServerError)
                return
        }
        w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleProfileChangeUsername(w http.ResponseWriter, r *http.Request) {
        claims := claimsFromCtx(r)
        if claims == nil {
                http.Error(w, "unauthorized", http.StatusUnauthorized)
                return
        }

        var req struct {
                Username        string `json:"username"`
                CurrentPassword string `json:"current_password"`
        }
        if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
                http.Error(w, "bad request", http.StatusBadRequest)
                return
        }
        if req.Username == "" {
                http.Error(w, "username required", http.StatusBadRequest)
                return
        }
        if len(req.Username) < 3 || len(req.Username) > 32 {
                http.Error(w, "username must be 3–32 characters", http.StatusBadRequest)
                return
        }

        var pwHash string
        err := s.db.SQL.QueryRowContext(r.Context(),
                `SELECT pw_hash FROM users WHERE id=?`, claims.UserID,
        ).Scan(&pwHash)
        if err != nil {
                http.Error(w, "user not found", http.StatusNotFound)
                return
        }
        if pwHash == "" || auth.CheckPassword(pwHash, req.CurrentPassword) != nil {
                http.Error(w, "incorrect password", http.StatusUnauthorized)
                return
        }

        _, err = s.db.SQL.ExecContext(r.Context(),
                `UPDATE users SET username=? WHERE id=?`, req.Username, claims.UserID,
        )
        if err != nil {
                http.Error(w, "username already taken", http.StatusConflict)
                return
        }
        w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleProfileChangePassword(w http.ResponseWriter, r *http.Request) {
        claims := claimsFromCtx(r)
        if claims == nil {
                http.Error(w, "unauthorized", http.StatusUnauthorized)
                return
        }

        var req struct {
                CurrentPassword string `json:"current_password"`
                NewPassword     string `json:"new_password"`
        }
        if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
                http.Error(w, "bad request", http.StatusBadRequest)
                return
        }
        if len(req.NewPassword) < 8 {
                http.Error(w, "password must be at least 8 characters", http.StatusBadRequest)
                return
        }

        var pwHash string
        err := s.db.SQL.QueryRowContext(r.Context(),
                `SELECT pw_hash FROM users WHERE id=?`, claims.UserID,
        ).Scan(&pwHash)
        if err != nil {
                http.Error(w, "user not found", http.StatusNotFound)
                return
        }
        if pwHash == "" || auth.CheckPassword(pwHash, req.CurrentPassword) != nil {
                http.Error(w, "incorrect current password", http.StatusUnauthorized)
                return
        }

        newHash, err := auth.HashPassword(req.NewPassword)
        if err != nil {
                http.Error(w, "internal error", http.StatusInternalServerError)
                return
        }
        _, err = s.db.SQL.ExecContext(r.Context(),
                `UPDATE users SET pw_hash=? WHERE id=?`, newHash, claims.UserID,
        )
        if err != nil {
                http.Error(w, "db error", http.StatusInternalServerError)
                return
        }
        w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleProfileSessions(w http.ResponseWriter, r *http.Request) {
        claims := claimsFromCtx(r)
        if claims == nil {
                http.Error(w, "unauthorized", http.StatusUnauthorized)
                return
        }

        rows, err := s.db.SQL.QueryContext(r.Context(),
                `SELECT id, scope, created_at, expires_at FROM sessions
                 WHERE user_id=? AND expires_at > unixepoch() ORDER BY created_at DESC`,
                claims.UserID,
        )
        if err != nil {
                http.Error(w, "db error", http.StatusInternalServerError)
                return
        }
        defer rows.Close()

        var sessions []sessionRecord
        first := true
        for rows.Next() {
                var sess sessionRecord
                rows.Scan(&sess.ID, &sess.Scope, &sess.CreatedAt, &sess.ExpiresAt) //nolint:errcheck
                if first {
                        sess.Current = true
                        first = false
                }
                sessions = append(sessions, sess)
        }
        if sessions == nil {
                sessions = []sessionRecord{}
        }
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(sessions) //nolint:errcheck
}

func (s *Server) handleProfileRevokeSession(w http.ResponseWriter, r *http.Request) {
        claims := claimsFromCtx(r)
        if claims == nil {
                http.Error(w, "unauthorized", http.StatusUnauthorized)
                return
        }
        idStr := r.PathValue("id")
        _, err := s.db.SQL.ExecContext(r.Context(),
                `DELETE FROM sessions WHERE id=? AND user_id=?`, idStr, claims.UserID,
        )
        if err != nil {
                http.Error(w, "db error", http.StatusInternalServerError)
                return
        }
        w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleProfileActivity(w http.ResponseWriter, r *http.Request) {
        claims := claimsFromCtx(r)
        if claims == nil {
                http.Error(w, "unauthorized", http.StatusUnauthorized)
                return
        }

        rows, err := s.db.SQL.QueryContext(r.Context(),
                `SELECT id, ts, method||' '||path, COALESCE(body_hash,''), COALESCE(ip,'')
                 FROM audit_log WHERE user=? ORDER BY ts DESC LIMIT 50`,
                claims.Username,
        )
        if err != nil {
                // audit_log table might have different schema; return empty
                w.Header().Set("Content-Type", "application/json")
                json.NewEncoder(w).Encode([]profileActivity{}) //nolint:errcheck
                return
        }
        defer rows.Close()

        var entries []profileActivity
        for rows.Next() {
                var e profileActivity
                rows.Scan(&e.ID, &e.TS, &e.Action, &e.Details, &e.IP) //nolint:errcheck
                entries = append(entries, e)
        }
        if entries == nil {
                entries = []profileActivity{}
        }
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(entries) //nolint:errcheck
}
