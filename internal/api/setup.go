package api

import (
	"encoding/json"
	"net/http"

	"github.com/orbit-sh/orbit/internal/auth"
)

type setupStatus struct {
	SetupRequired bool `json:"setup_required"`
}

func (s *Server) handleSetupStatus(w http.ResponseWriter, r *http.Request) {
	var count int
	s.db.SQL.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM users`).Scan(&count) //nolint:errcheck
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(setupStatus{SetupRequired: count == 0}) //nolint:errcheck
}

type setupCompleteReq struct {
	Admin struct {
		Username string `json:"username"`
		Email    string `json:"email"`
		Password string `json:"password"`
	} `json:"admin"`
	Server struct {
		Name     string `json:"name"`
		URL      string `json:"url"`
		Hostname string `json:"hostname"`
		Timezone string `json:"timezone"`
	} `json:"server"`
	Security struct {
		PwMinLen       int  `json:"pw_min_len"`
		RequireUpper   bool `json:"require_upper"`
		RequireNumber  bool `json:"require_number"`
		RequireSpecial bool `json:"require_special"`
		SessionTimeout int  `json:"session_timeout_min"`
		TwoFactor      bool `json:"two_factor"`
	} `json:"security"`
	Email *struct {
		Host     string `json:"host"`
		Port     int    `json:"port"`
		User     string `json:"user"`
		Password string `json:"password"`
		From     string `json:"from"`
	} `json:"email"`
	RunInitialScan bool `json:"run_initial_scan"`
}

func (s *Server) handleSetupComplete(w http.ResponseWriter, r *http.Request) {
	var count int
	s.db.SQL.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM users`).Scan(&count) //nolint:errcheck
	if count > 0 {
		http.Error(w, "setup already completed", http.StatusConflict)
		return
	}

	var req setupCompleteReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}

	if req.Admin.Username == "" || req.Admin.Password == "" {
		http.Error(w, "username and password are required", http.StatusBadRequest)
		return
	}
	if len(req.Admin.Password) < 8 {
		http.Error(w, "password must be at least 8 characters", http.StatusBadRequest)
		return
	}

	hash, err := auth.HashPassword(req.Admin.Password)
	if err != nil {
		http.Error(w, "failed to hash password", http.StatusInternalServerError)
		return
	}

	_, err = s.db.SQL.ExecContext(r.Context(),
		`INSERT INTO users (username, email, pw_hash, role) VALUES (?, ?, ?, 'admin')`,
		req.Admin.Username, req.Admin.Email, hash,
	)
	if err != nil {
		http.Error(w, "failed to create admin user: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// Persist server settings
	settings := map[string]string{}
	if req.Server.Name != "" {
		settings["server_name"] = req.Server.Name
	}
	if req.Server.Timezone != "" {
		settings["timezone"] = req.Server.Timezone
	}
	if req.Server.URL != "" {
		settings["server_url"] = req.Server.URL
	}
	if req.Server.Hostname != "" {
		settings["hostname"] = req.Server.Hostname
	}
	if req.Admin.Email != "" {
		settings["admin_email"] = req.Admin.Email
	}
	for k, v := range settings {
		s.db.SQL.ExecContext(r.Context(), //nolint:errcheck
			`INSERT INTO settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
			k, v,
		)
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"}) //nolint:errcheck
}
