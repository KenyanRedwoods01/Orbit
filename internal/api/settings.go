package api

import (
	"encoding/json"
	"net/http"
	"strings"
)

func isAllowedSettingKey(key string) bool {
	blocked := []string{"agent_secret", "db_", "ssh_", "api_", "security_", "auth_"}
	for _, b := range blocked {
		if strings.HasPrefix(key, b) {
			return false
		}
	}
	allowed := []string{"ui.", "theme.", "locale.", "notif.", "cron."}
	for _, a := range allowed {
		if strings.HasPrefix(key, a) {
			return true
		}
	}
	return false
}

func (s *Server) handleSettingsGet(w http.ResponseWriter, r *http.Request) {
	rows, err := s.db.SQL.QueryContext(r.Context(), `SELECT key, value FROM settings ORDER BY key`)
	if err != nil {
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	result := map[string]string{}
	for rows.Next() {
		var k, v string
		rows.Scan(&k, &v) //nolint:errcheck
		if isAllowedSettingKey(k) {
			result[k] = v
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result) //nolint:errcheck
}

func (s *Server) handleSettingsPut(w http.ResponseWriter, r *http.Request) {
	var req map[string]string
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}

	tx, err := s.db.SQL.BeginTx(r.Context(), nil)
	if err != nil {
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback() //nolint:errcheck

	for k, v := range req {
		if !isAllowedSettingKey(k) {
			http.Error(w, "forbidden: setting key not allowed", http.StatusForbidden)
			return
		}
		if _, err := tx.ExecContext(r.Context(),
			`INSERT INTO settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
			k, v,
		); err != nil {
			http.Error(w, "db error", http.StatusInternalServerError)
			return
		}
	}

	if err := tx.Commit(); err != nil {
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleSettingGet(w http.ResponseWriter, r *http.Request) {
	key := r.PathValue("key")
	if !isAllowedSettingKey(key) {
		http.Error(w, "forbidden: setting key not allowed", http.StatusForbidden)
		return
	}
	var value string
	err := s.db.SQL.QueryRowContext(r.Context(), `SELECT value FROM settings WHERE key=?`, key).Scan(&value)
	if err != nil {
		http.Error(w, "setting not found", http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"key": key, "value": value}) //nolint:errcheck
}
