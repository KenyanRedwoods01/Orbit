package api

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"strconv"
	"time"
)

type mcpToken struct {
	ID        int64  `json:"id"`
	Label     string `json:"label"`
	Scope     string `json:"scope"`
	CreatedAt int64  `json:"created_at"`
	LastUsed  *int64 `json:"last_used,omitempty"`
	Token     string `json:"token,omitempty"`
}

type mcpAuditEntry struct {
	ID      int64  `json:"id"`
	TokenID *int64 `json:"token_id,omitempty"`
	Tool    string `json:"tool"`
	Args    string `json:"args,omitempty"`
	Result  string `json:"result"`
	TS      int64  `json:"ts"`
}

func (s *Server) handleMCPTokenList(w http.ResponseWriter, r *http.Request) {
	rows, err := s.db.SQL.QueryContext(r.Context(),
		`SELECT id, label, scope, created_at, last_used FROM mcp_tokens ORDER BY id DESC`,
	)
	if err != nil {
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var tokens []mcpToken
	for rows.Next() {
		var t mcpToken
		rows.Scan(&t.ID, &t.Label, &t.Scope, &t.CreatedAt, &t.LastUsed) //nolint:errcheck
		tokens = append(tokens, t)
	}
	if tokens == nil {
		tokens = []mcpToken{}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(tokens) //nolint:errcheck
}

func (s *Server) handleMCPTokenCreate(w http.ResponseWriter, r *http.Request) {
	var req mcpToken
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}

	rawToken, err := generateMCPToken()
	if err != nil {
		http.Error(w, "failed to generate token", http.StatusInternalServerError)
		return
	}
	tokenHash := hashMCPToken(rawToken)

	res, err := s.db.SQL.ExecContext(r.Context(),
		`INSERT INTO mcp_tokens (label, token_hash, scope) VALUES (?, ?, ?)`,
		req.Label, tokenHash, req.Scope,
	)
	if err != nil {
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}
	req.ID, _ = res.LastInsertId()
	req.CreatedAt = time.Now().Unix()
	req.Token = rawToken

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(req) //nolint:errcheck
}

func (s *Server) handleMCPTokenRevoke(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		http.Error(w, "bad id", http.StatusBadRequest)
		return
	}
	_, err = s.db.SQL.ExecContext(r.Context(), `DELETE FROM mcp_tokens WHERE id = ?`, id)
	if err != nil {
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleMCPAuditLog(w http.ResponseWriter, r *http.Request) {
	rows, err := s.db.SQL.QueryContext(r.Context(),
		`SELECT id, token_id, tool, args_json, result, ts FROM mcp_audit ORDER BY id DESC LIMIT 200`,
	)
	if err != nil {
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var entries []mcpAuditEntry
	for rows.Next() {
		var e mcpAuditEntry
		rows.Scan(&e.ID, &e.TokenID, &e.Tool, &e.Args, &e.Result, &e.TS) //nolint:errcheck
		entries = append(entries, e)
	}
	if entries == nil {
		entries = []mcpAuditEntry{}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(entries) //nolint:errcheck
}

func generateMCPToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return "mcp_" + hex.EncodeToString(b), nil
}

func hashMCPToken(token string) string {
	h := sha256.Sum256([]byte(token))
	return hex.EncodeToString(h[:])
}
