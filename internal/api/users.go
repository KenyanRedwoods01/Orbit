package api

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/orbit-sh/orbit/internal/auth"
)

type userRecord struct {
	ID        int64  `json:"id"`
	Username  string `json:"username"`
	Email     string `json:"email"`
	Role      string `json:"role"`
	CreatedAt int64  `json:"created_at"`
}

func (s *Server) handleUserList(w http.ResponseWriter, r *http.Request) {
	rows, err := s.db.SQL.QueryContext(r.Context(),
		`SELECT id, username, COALESCE(email,''), role, created_at FROM users ORDER BY id`,
	)
	if err != nil {
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var users []userRecord
	for rows.Next() {
		var u userRecord
		rows.Scan(&u.ID, &u.Username, &u.Email, &u.Role, &u.CreatedAt) //nolint:errcheck
		users = append(users, u)
	}
	if users == nil {
		users = []userRecord{}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(users) //nolint:errcheck
}

func (s *Server) handleUserCreate(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Username string `json:"username"`
		Email    string `json:"email"`
		Password string `json:"password"`
		Role     string `json:"role"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	if req.Username == "" || req.Password == "" {
		http.Error(w, "username and password required", http.StatusBadRequest)
		return
	}
	if len(req.Password) < 8 {
		http.Error(w, "password must be at least 8 characters", http.StatusBadRequest)
		return
	}
	if req.Role == "" {
		req.Role = "admin"
	}

	hash, err := auth.HashPassword(req.Password)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	res, err := s.db.SQL.ExecContext(r.Context(),
		`INSERT INTO users (username, email, pw_hash, role) VALUES (?, ?, ?, ?)`,
		req.Username, req.Email, hash, req.Role,
	)
	if err != nil {
		http.Error(w, "user already exists or db error: "+err.Error(), http.StatusConflict)
		return
	}
	id, _ := res.LastInsertId()
	u := userRecord{
		ID:        id,
		Username:  req.Username,
		Email:     req.Email,
		Role:      req.Role,
		CreatedAt: time.Now().Unix(),
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(u) //nolint:errcheck
}

func (s *Server) handleUserUpdate(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		http.Error(w, "bad id", http.StatusBadRequest)
		return
	}

	var req struct {
		Email string `json:"email"`
		Role  string `json:"role"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}

	_, err = s.db.SQL.ExecContext(r.Context(),
		`UPDATE users SET email=?, role=? WHERE id=?`,
		req.Email, req.Role, id,
	)
	if err != nil {
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleUserDelete(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		http.Error(w, "bad id", http.StatusBadRequest)
		return
	}

	// Prevent deleting the last admin
	var adminCount int
	s.db.SQL.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM users WHERE role='admin'`).Scan(&adminCount) //nolint:errcheck
	if adminCount <= 1 {
		// Check if this user is an admin
		var role string
		err := s.db.SQL.QueryRowContext(r.Context(), `SELECT role FROM users WHERE id=?`, id).Scan(&role)
		if err == nil && role == "admin" {
			http.Error(w, "cannot delete the last admin", http.StatusConflict)
			return
		}
	}

	_, err = s.db.SQL.ExecContext(r.Context(), `DELETE FROM users WHERE id=?`, id)
	if err != nil {
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleUserChangePassword(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		http.Error(w, "bad id", http.StatusBadRequest)
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
	if req.NewPassword == "" || len(req.NewPassword) < 8 {
		http.Error(w, "new password must be at least 8 characters", http.StatusBadRequest)
		return
	}

	// Verify current password if provided
	if req.CurrentPassword != "" {
		var pwHash string
		err := s.db.SQL.QueryRowContext(r.Context(), `SELECT pw_hash FROM users WHERE id=?`, id).Scan(&pwHash)
		if err == sql.ErrNoRows {
			http.Error(w, "user not found", http.StatusNotFound)
			return
		}
		if err != nil {
			http.Error(w, "db error", http.StatusInternalServerError)
			return
		}
		if checkErr := auth.CheckPassword(pwHash, req.CurrentPassword); checkErr != nil {
			http.Error(w, "current password incorrect", http.StatusUnauthorized)
			return
		}
	}

	newHash, err := auth.HashPassword(req.NewPassword)
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	_, err = s.db.SQL.ExecContext(r.Context(), `UPDATE users SET pw_hash=? WHERE id=?`, newHash, id)
	if err != nil {
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleUserMe(w http.ResponseWriter, r *http.Request) {
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

	var u userRecord
	err = s.db.SQL.QueryRowContext(r.Context(),
		`SELECT id, username, COALESCE(email,''), role, created_at FROM users WHERE id=?`, claims.UserID,
	).Scan(&u.ID, &u.Username, &u.Email, &u.Role, &u.CreatedAt)
	if err == sql.ErrNoRows {
		http.Error(w, "user not found", http.StatusNotFound)
		return
	}
	if err != nil {
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(u) //nolint:errcheck
}
