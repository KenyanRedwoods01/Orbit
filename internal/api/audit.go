package api

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// ── Audit Log Middleware ───────────────────────────────────────────────────────

// auditMiddleware wraps a handler and writes one row to audit_log for every
// state-changing request (POST / PUT / PATCH / DELETE).
func (s *Server) auditMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet || r.Method == http.MethodHead || r.Method == http.MethodOptions {
			next(w, r)
			return
		}

		// Capture username from JWT (best-effort, don't block on failure)
		username := "anonymous"
		if cookie, err := r.Cookie("orbit_session"); err == nil {
			if c, err2 := verifyTokenClaims([]byte(s.cfg.SecretKey), cookie.Value); err2 == nil {
				username = c.Username
			}
		}

		// Hash request body for tamper-evidence (don't consume it)
		var bodyHash string
		if r.Body != nil && r.ContentLength > 0 && r.ContentLength < 1<<20 {
			bodyBytes, err := io.ReadAll(r.Body)
			if err == nil {
				r.Body = io.NopCloser(bytes.NewReader(bodyBytes))
				sum := sha256.Sum256(bodyBytes)
				bodyHash = fmt.Sprintf("%x", sum[:8]) // 8-byte prefix is enough
			}
		}

		ip := r.RemoteAddr
		if fwd := r.Header.Get("X-Forwarded-For"); fwd != "" {
			ip = strings.Split(fwd, ",")[0]
		}

		// Wrap the ResponseWriter to capture the status code
		rw := &statusCapture{ResponseWriter: w, status: http.StatusOK}
		next(rw, r)

		// Write audit entry in background so it doesn't delay the response
		go func() {
			ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
			defer cancel()
			s.db.SQL.ExecContext(ctx, //nolint:errcheck
				`INSERT INTO audit_log (user, method, path, status, ip, body_hash, ts)
				 VALUES (?,?,?,?,?,?,unixepoch())`,
				username, r.Method, r.URL.Path, rw.status, ip, bodyHash,
			)
		}()
	}
}

// statusCapture wraps ResponseWriter to record the HTTP status code.
type statusCapture struct {
	http.ResponseWriter
	status int
}

func (sc *statusCapture) WriteHeader(code int) {
	sc.status = code
	sc.ResponseWriter.WriteHeader(code)
}

// ── Audit Log API ─────────────────────────────────────────────────────────────

func (s *Server) handleAuditList(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	user := q.Get("user")
	method := q.Get("method")
	limitStr := q.Get("limit")
	limit := 200
	if limitStr != "" {
		if v, err := parseInt64(limitStr); err == nil && v > 0 && v <= 1000 {
			limit = int(v)
		}
	}

	var args []interface{}
	var filters []string
	if user != "" {
		filters = append(filters, "user LIKE ?")
		args = append(args, "%"+user+"%")
	}
	if method != "" {
		filters = append(filters, "method=?")
		args = append(args, strings.ToUpper(method))
	}

	where := ""
	if len(filters) > 0 {
		where = "WHERE " + strings.Join(filters, " AND ")
	}

	args = append(args, limit)
	rows, err := s.db.SQL.QueryContext(r.Context(),
		`SELECT id, user, method, path, status, COALESCE(ip,''), COALESCE(body_hash,''), ts
		 FROM audit_log `+where+` ORDER BY id DESC LIMIT ?`,
		args...,
	)
	if err != nil {
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	type auditEntry struct {
		ID       int64  `json:"id"`
		User     string `json:"user"`
		Method   string `json:"method"`
		Path     string `json:"path"`
		Status   int    `json:"status"`
		IP       string `json:"ip"`
		BodyHash string `json:"body_hash,omitempty"`
		Ts       int64  `json:"ts"`
	}

	var entries []auditEntry
	for rows.Next() {
		var e auditEntry
		rows.Scan(&e.ID, &e.User, &e.Method, &e.Path, &e.Status, &e.IP, &e.BodyHash, &e.Ts) //nolint:errcheck
		entries = append(entries, e)
	}
	if entries == nil {
		entries = []auditEntry{}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{ //nolint:errcheck
		"entries": entries,
		"total":   len(entries),
	})
}

func (s *Server) handleAuditExport(w http.ResponseWriter, r *http.Request) {
	format := r.URL.Query().Get("format")
	if format == "" {
		format = "json"
	}

	rows, err := s.db.SQL.QueryContext(r.Context(),
		`SELECT id, user, method, path, status, COALESCE(ip,''), COALESCE(body_hash,''), ts
		 FROM audit_log ORDER BY id DESC LIMIT 5000`,
	)
	if err != nil {
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	type auditEntry struct {
		ID       int64  `json:"id"`
		User     string `json:"user"`
		Method   string `json:"method"`
		Path     string `json:"path"`
		Status   int    `json:"status"`
		IP       string `json:"ip"`
		BodyHash string `json:"body_hash"`
		Ts       int64  `json:"ts"`
	}

	var entries []auditEntry
	for rows.Next() {
		var e auditEntry
		rows.Scan(&e.ID, &e.User, &e.Method, &e.Path, &e.Status, &e.IP, &e.BodyHash, &e.Ts) //nolint:errcheck
		entries = append(entries, e)
	}
	if entries == nil {
		entries = []auditEntry{}
	}

	if format == "csv" {
		w.Header().Set("Content-Type", "text/csv")
		w.Header().Set("Content-Disposition", `attachment; filename="audit_log.csv"`)
		w.Write([]byte("id,user,method,path,status,ip,body_hash,ts\n")) //nolint:errcheck
		for _, e := range entries {
			w.Write([]byte(fmt.Sprintf("%d,%s,%s,%s,%d,%s,%s,%d\n", //nolint:errcheck
				e.ID, e.User, e.Method, e.Path, e.Status, e.IP, e.BodyHash, e.Ts)))
		}
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Content-Disposition", `attachment; filename="audit_log.json"`)
	json.NewEncoder(w).Encode(entries) //nolint:errcheck
}

func (s *Server) handleAuditClear(w http.ResponseWriter, r *http.Request) {
	var req struct {
		OlderThanDays int `json:"older_than_days"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	if req.OlderThanDays < 1 {
		req.OlderThanDays = 90
	}
	cutoff := time.Now().Unix() - int64(req.OlderThanDays*86400)
	res, err := s.db.SQL.ExecContext(r.Context(),
		`DELETE FROM audit_log WHERE ts < ?`, cutoff,
	)
	if err != nil {
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}
	deleted, _ := res.RowsAffected()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"ok": true, "deleted": deleted}) //nolint:errcheck
}

// ── API Tokens ────────────────────────────────────────────────────────────────

func (s *Server) handleAPITokenList(w http.ResponseWriter, r *http.Request) {
	rows, err := s.db.SQL.QueryContext(r.Context(),
		`SELECT id, name, scopes, COALESCE(ip_restrict,''), expires_at, created_at, last_used
		 FROM api_tokens ORDER BY id DESC`,
	)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode([]map[string]interface{}{}) //nolint:errcheck
		return
	}
	defer rows.Close()

	type tokenRow struct {
		ID         int64  `json:"id"`
		Name       string `json:"name"`
		Scopes     string `json:"scopes"`
		IPRestrict string `json:"ip_restrict,omitempty"`
		ExpiresAt  *int64 `json:"expires_at,omitempty"`
		CreatedAt  int64  `json:"created_at"`
		LastUsed   *int64 `json:"last_used,omitempty"`
	}

	var tokens []tokenRow
	for rows.Next() {
		var t tokenRow
		rows.Scan(&t.ID, &t.Name, &t.Scopes, &t.IPRestrict, &t.ExpiresAt, &t.CreatedAt, &t.LastUsed) //nolint:errcheck
		tokens = append(tokens, t)
	}
	if tokens == nil {
		tokens = []tokenRow{}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(tokens) //nolint:errcheck
}

func (s *Server) handleAPITokenCreate(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name       string `json:"name"`
		Scopes     string `json:"scopes"`
		IPRestrict string `json:"ip_restrict"`
		ExpiryDays int    `json:"expiry_days"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	if req.Name == "" {
		http.Error(w, "name is required", http.StatusBadRequest)
		return
	}
	if req.Scopes == "" {
		req.Scopes = "read:servers"
	}

	// Generate a random token
	rawToken, err := generateRandomHex(32)
	if err != nil {
		http.Error(w, "token generation failed", http.StatusInternalServerError)
		return
	}
	sum := sha256.Sum256([]byte(rawToken))
	tokenHash := fmt.Sprintf("%x", sum[:])

	var expiresAt *int64
	if req.ExpiryDays > 0 {
		t := time.Now().Add(time.Duration(req.ExpiryDays) * 24 * time.Hour).Unix()
		expiresAt = &t
	}

	res, err := s.db.SQL.ExecContext(r.Context(),
		`INSERT INTO api_tokens (name, token_hash, scopes, ip_restrict, expires_at) VALUES (?,?,?,?,?)`,
		req.Name, tokenHash, req.Scopes, req.IPRestrict, expiresAt,
	)
	if err != nil {
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}
	id, _ := res.LastInsertId()

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]interface{}{ //nolint:errcheck
		"id":         id,
		"name":       req.Name,
		"token":      rawToken, // shown only once
		"scopes":     req.Scopes,
		"expires_at": expiresAt,
		"created_at": time.Now().Unix(),
	})
}

func (s *Server) handleAPITokenRevoke(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := parseInt64(idStr)
	if err != nil {
		http.Error(w, "bad id", http.StatusBadRequest)
		return
	}
	s.db.SQL.ExecContext(r.Context(), `DELETE FROM api_tokens WHERE id=?`, id) //nolint:errcheck
	w.WriteHeader(http.StatusNoContent)
}

// ── helpers shared across files ───────────────────────────────────────────────

func parseInt64(s string) (int64, error) {
	var v int64
	_, err := fmt.Sscanf(s, "%d", &v)
	return v, err
}
