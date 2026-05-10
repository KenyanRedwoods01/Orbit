package api

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"net/http"
	"strings"
	"time"
)

// ── Server Agent Protocol ─────────────────────────────────────────────────────

type agentEntry struct {
	ID           int64   `json:"id"`
	Name         string  `json:"name"`
	Host         string  `json:"host"`
	Version      string  `json:"version,omitempty"`
	Status       string  `json:"status"`
	LastSeen     *int64  `json:"last_seen,omitempty"`
	RegisteredAt int64   `json:"registered_at"`
	Online       bool    `json:"online"`
}

// handleAgentRegister is called by an agent binary on first boot to register itself.
// POST /api/agent/register  — public endpoint, uses a shared secret for auth.
func (s *Server) handleAgentRegister(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name    string `json:"name"`
		Host    string `json:"host"`
		Version string `json:"version"`
		Secret  string `json:"secret"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	if req.Host == "" || req.Name == "" {
		http.Error(w, "name and host are required", http.StatusBadRequest)
		return
	}

	// Verify agent secret matches server config (required)
	expectedSecret, err := s.getSettingValue("agent_secret")
	if err != nil || expectedSecret == "" {
		http.Error(w, "agent registration is not configured; set agent_secret in settings first", http.StatusForbidden)
		return
	}
	if subtle.ConstantTimeCompare([]byte(req.Secret), []byte(expectedSecret)) != 1 {
		http.Error(w, "invalid agent secret", http.StatusUnauthorized)
		return
	}

	now := time.Now().Unix()

	// Check if agent already exists — if so, re-register but suppress token
	var existingID int64
	s.db.SQL.QueryRowContext(r.Context(), `SELECT id FROM agents WHERE host=?`, req.Host).Scan(&existingID)

	t, err := generateRandomHex(32)
	if err != nil {
		http.Error(w, "token generation failed", http.StatusInternalServerError)
		return
	}
	rawToken := t
	tokenHash := hashSHA256Hex(rawToken)

	_ = existingID // used below to decide token visibility

	_, err := s.db.SQL.ExecContext(r.Context(),
		`INSERT INTO agents (name, host, token_hash, version, status, last_seen)
		 VALUES (?,?,?,?,?,?)
		 ON CONFLICT(host) DO UPDATE SET name=excluded.name, token_hash=excluded.token_hash,
		 version=excluded.version, status='online', last_seen=excluded.last_seen`,
		req.Name, req.Host, tokenHash, req.Version, "online", now,
	)
	if err != nil {
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}

	resp := map[string]interface{}{
		"host":    req.Host,
		"name":    req.Name,
		"message": "registered",
	}
	if rawToken != "" {
		resp["token"] = rawToken
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(resp) //nolint:errcheck
}

// handleAgentHeartbeat is called by an agent every N seconds to report liveness.
// POST /api/agent/heartbeat
func (s *Server) handleAgentHeartbeat(w http.ResponseWriter, r *http.Request) {
	agent, ok := s.validateAgentToken(r)
	if !ok {
		http.Error(w, "invalid agent token", http.StatusUnauthorized)
		return
	}

	now := time.Now().Unix()
	s.db.SQL.ExecContext(r.Context(), //nolint:errcheck
		`UPDATE agents SET status='online', last_seen=? WHERE id=?`, now, agent.ID,
	)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"ok": true, "ts": now}) //nolint:errcheck
}

// handleAgentMetricsPush receives a metrics snapshot from an agent.
// POST /api/agent/metrics
func (s *Server) handleAgentMetricsPush(w http.ResponseWriter, r *http.Request) {
	agent, ok := s.validateAgentToken(r)
	if !ok {
		http.Error(w, "invalid agent token", http.StatusUnauthorized)
		return
	}

	// Read body (metrics JSON blob)
	var snapshot json.RawMessage
	if err := json.NewDecoder(r.Body).Decode(&snapshot); err != nil {
		http.Error(w, "bad metrics payload", http.StatusBadRequest)
		return
	}

	s.db.SQL.ExecContext(r.Context(), //nolint:errcheck
		`INSERT INTO agent_metrics (agent_id, snapshot) VALUES (?,?)`,
		agent.ID, string(snapshot),
	)

	// Keep only last 1440 snapshots per agent (24h at 1/min)
	s.db.SQL.ExecContext(r.Context(), //nolint:errcheck
		`DELETE FROM agent_metrics WHERE agent_id=? AND id NOT IN
		 (SELECT id FROM agent_metrics WHERE agent_id=? ORDER BY id DESC LIMIT 1440)`,
		agent.ID, agent.ID,
	)

	w.WriteHeader(http.StatusNoContent)
}

// handleAgentList returns all registered agents (admin view).
func (s *Server) handleAgentList(w http.ResponseWriter, r *http.Request) {
	rows, err := s.db.SQL.QueryContext(r.Context(),
		`SELECT id, name, host, COALESCE(version,''), status, last_seen, registered_at FROM agents ORDER BY name ASC`,
	)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode([]agentEntry{}) //nolint:errcheck
		return
	}
	defer rows.Close()

	staleThreshold := time.Now().Unix() - 120 // >2 min = offline
	var agents []agentEntry
	for rows.Next() {
		var a agentEntry
		rows.Scan(&a.ID, &a.Name, &a.Host, &a.Version, &a.Status, &a.LastSeen, &a.RegisteredAt) //nolint:errcheck
		a.Online = a.LastSeen != nil && *a.LastSeen > staleThreshold
		if !a.Online && a.Status == "online" {
			a.Status = "offline"
		}
		agents = append(agents, a)
	}
	if agents == nil {
		agents = []agentEntry{}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(agents) //nolint:errcheck
}

func (s *Server) handleAgentGet(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := parseInt64(idStr)
	if err != nil {
		http.Error(w, "bad id", http.StatusBadRequest)
		return
	}
	var a agentEntry
	err = s.db.SQL.QueryRowContext(r.Context(),
		`SELECT id, name, host, COALESCE(version,''), status, last_seen, registered_at FROM agents WHERE id=?`, id,
	).Scan(&a.ID, &a.Name, &a.Host, &a.Version, &a.Status, &a.LastSeen, &a.RegisteredAt)
	if err != nil {
		http.Error(w, "agent not found", http.StatusNotFound)
		return
	}
	staleThreshold := time.Now().Unix() - 120
	a.Online = a.LastSeen != nil && *a.LastSeen > staleThreshold
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(a) //nolint:errcheck
}

func (s *Server) handleAgentDelete(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := parseInt64(idStr)
	if err != nil {
		http.Error(w, "bad id", http.StatusBadRequest)
		return
	}
	s.db.SQL.ExecContext(r.Context(), `DELETE FROM agents WHERE id=?`, id) //nolint:errcheck
	w.WriteHeader(http.StatusNoContent)
}

// handleAgentMetricsGet returns the latest snapshot for an agent.
func (s *Server) handleAgentMetricsGet(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := parseInt64(idStr)
	if err != nil {
		http.Error(w, "bad id", http.StatusBadRequest)
		return
	}

	limitStr := r.URL.Query().Get("limit")
	limit := 60
	if v, err2 := parseInt64(limitStr); err2 == nil && v > 0 && v <= 1440 {
		limit = int(v)
	}

	rows, err := s.db.SQL.QueryContext(r.Context(),
		`SELECT snapshot, ts FROM agent_metrics WHERE agent_id=? ORDER BY id DESC LIMIT ?`,
		id, limit,
	)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode([]map[string]interface{}{}) //nolint:errcheck
		return
	}
	defer rows.Close()

	type snap struct {
		Snapshot json.RawMessage `json:"snapshot"`
		Ts       int64           `json:"ts"`
	}
	var snaps []snap
	for rows.Next() {
		var sn snap
		var raw string
		rows.Scan(&raw, &sn.Ts) //nolint:errcheck
		sn.Snapshot = json.RawMessage(raw)
		snaps = append(snaps, sn)
	}
	if snaps == nil {
		snaps = []snap{}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(snaps) //nolint:errcheck
}

// handleAgentExec sends a remote command to an agent (polling model).
func (s *Server) handleAgentExec(w http.ResponseWriter, r *http.Request) {
	http.Error(w, "remote exec requires agent polling — use websocket terminal", http.StatusNotImplemented)
}

// runAgentStalenessChecker periodically marks agents that haven't sent heartbeats as offline.
func (s *Server) runAgentStalenessChecker(ctx context.Context) {
	ticker := time.NewTicker(60 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			staleThreshold := time.Now().Unix() - 120
			s.db.SQL.ExecContext(ctx, //nolint:errcheck
				`UPDATE agents SET status='offline' WHERE status='online' AND (last_seen IS NULL OR last_seen < ?)`,
				staleThreshold,
			)
		}
	}
}

// validateAgentToken checks the Bearer token in the Authorization header against stored agents.
func (s *Server) validateAgentToken(r *http.Request) (agentEntry, bool) {
	auth := r.Header.Get("Authorization")
	if !strings.HasPrefix(auth, "Bearer ") {
		return agentEntry{}, false
	}
	rawToken := strings.TrimPrefix(auth, "Bearer ")
	tokenHash := hashSHA256Hex(rawToken)

	var a agentEntry
	err := s.db.SQL.QueryRowContext(r.Context(),
		`SELECT id, name, host, COALESCE(version,''), status, last_seen, registered_at
		 FROM agents WHERE token_hash=?`, tokenHash,
	).Scan(&a.ID, &a.Name, &a.Host, &a.Version, &a.Status, &a.LastSeen, &a.RegisteredAt)
	if err != nil {
		return agentEntry{}, false
	}
	return a, true
}

// getSettingValue fetches a single setting value from the DB.
func (s *Server) getSettingValue(key string) (string, error) {
	var v string
	err := s.db.SQL.QueryRow(`SELECT value FROM settings WHERE key=?`, key).Scan(&v)
	return v, err
}
