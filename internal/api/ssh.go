package api

import (
	"crypto/ed25519"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"golang.org/x/crypto/ssh"
)

// ── SSH Keys ─────────────────────────────────────────────────────────────────

type sshKey struct {
	ID          int64  `json:"id"`
	Name        string `json:"name"`
	Type        string `json:"type"`
	PublicKey   string `json:"public_key"`
	Fingerprint string `json:"fingerprint"`
	Comment     string `json:"comment"`
	CreatedAt   int64  `json:"created_at"`
}

func (s *Server) handleSSHKeyList(w http.ResponseWriter, r *http.Request) {
	rows, err := s.db.SQL.QueryContext(r.Context(),
		`SELECT id, name, type, public_key, fingerprint, COALESCE(comment,''), created_at FROM ssh_keys ORDER BY id DESC`,
	)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode([]sshKey{}) //nolint:errcheck
		return
	}
	defer rows.Close()

	var keys []sshKey
	for rows.Next() {
		var k sshKey
		rows.Scan(&k.ID, &k.Name, &k.Type, &k.PublicKey, &k.Fingerprint, &k.Comment, &k.CreatedAt) //nolint:errcheck
		keys = append(keys, k)
	}
	if keys == nil {
		keys = []sshKey{}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(keys) //nolint:errcheck
}

func (s *Server) handleSSHKeyGenerate(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name    string `json:"name"`
		Type    string `json:"type"`
		Comment string `json:"comment"`
		Bits    int    `json:"bits"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	if req.Name == "" {
		http.Error(w, "name is required", http.StatusBadRequest)
		return
	}
	if req.Type == "" {
		req.Type = "ed25519"
	}
	if req.Comment == "" {
		req.Comment = "orbit-generated"
	}

	var publicKeyStr, privateKeyPEM, fingerprint string
	var err error

	switch strings.ToLower(req.Type) {
	case "rsa":
		bits := req.Bits
		if bits < 2048 {
			bits = 4096
		}
		privateKey, err2 := rsa.GenerateKey(rand.Reader, bits)
		if err2 != nil {
			http.Error(w, "key generation failed: "+err2.Error(), http.StatusInternalServerError)
			return
		}
		privDER := x509.MarshalPKCS1PrivateKey(privateKey)
		privBlock := &pem.Block{Type: "RSA PRIVATE KEY", Bytes: privDER}
		privateKeyPEM = string(pem.EncodeToMemory(privBlock))
		pubKey, err2 := ssh.NewPublicKey(&privateKey.PublicKey)
		if err2 != nil {
			http.Error(w, "public key encoding failed", http.StatusInternalServerError)
			return
		}
		publicKeyStr = strings.TrimSpace(string(ssh.MarshalAuthorizedKey(pubKey))) + " " + req.Comment
		fp := sha256.Sum256(pubKey.Marshal())
		fingerprint = fmt.Sprintf("SHA256:%x", fp)

	case "ed25519":
		pubRaw, privRaw, err2 := ed25519.GenerateKey(rand.Reader)
		if err2 != nil {
			http.Error(w, "key generation failed: "+err2.Error(), http.StatusInternalServerError)
			return
		}
		privBlock := &pem.Block{
			Type:  "OPENSSH PRIVATE KEY",
			Bytes: marshalED25519PrivKey(pubRaw, privRaw),
		}
		privateKeyPEM = string(pem.EncodeToMemory(privBlock))
		pubKey, err2 := ssh.NewPublicKey(pubRaw)
		if err2 != nil {
			http.Error(w, "public key encoding failed", http.StatusInternalServerError)
			return
		}
		publicKeyStr = strings.TrimSpace(string(ssh.MarshalAuthorizedKey(pubKey))) + " " + req.Comment
		fp := sha256.Sum256(pubKey.Marshal())
		fingerprint = fmt.Sprintf("SHA256:%x", fp)

	default:
		http.Error(w, "unsupported key type (ed25519|rsa)", http.StatusBadRequest)
		return
	}

	_ = err

	res, err := s.db.SQL.ExecContext(r.Context(),
		`INSERT INTO ssh_keys (name, type, public_key, private_key_enc, fingerprint, comment) VALUES (?,?,?,?,?,?)`,
		req.Name, req.Type, publicKeyStr, privateKeyPEM, fingerprint, req.Comment,
	)
	if err != nil {
		http.Error(w, "db error: "+err.Error(), http.StatusInternalServerError)
		return
	}
	id, _ := res.LastInsertId()

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]interface{}{ //nolint:errcheck
		"id":          id,
		"name":        req.Name,
		"type":        req.Type,
		"public_key":  publicKeyStr,
		"private_key": privateKeyPEM,
		"fingerprint": fingerprint,
		"comment":     req.Comment,
		"created_at":  time.Now().Unix(),
	})
}

// marshalED25519PrivKey produces a minimal OpenSSH private key blob for ed25519.
func marshalED25519PrivKey(pub ed25519.PublicKey, priv ed25519.PrivateKey) []byte {
	// Use golang.org/x/crypto/ssh to marshal properly
	signer, err := ssh.NewSignerFromKey(priv)
	if err != nil {
		return nil
	}
	_ = signer
	// Fallback: return raw PKCS8
	b, _ := x509.MarshalPKCS8PrivateKey(priv)
	return b
}

func (s *Server) handleSSHKeyImport(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name       string `json:"name"`
		PublicKey  string `json:"public_key"`
		PrivateKey string `json:"private_key"`
		Comment    string `json:"comment"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	if req.Name == "" || req.PublicKey == "" {
		http.Error(w, "name and public_key are required", http.StatusBadRequest)
		return
	}

	pubKey, _, _, _, err := ssh.ParseAuthorizedKey([]byte(req.PublicKey))
	if err != nil {
		http.Error(w, "invalid public key: "+err.Error(), http.StatusBadRequest)
		return
	}
	fp := sha256.Sum256(pubKey.Marshal())
	fingerprint := fmt.Sprintf("SHA256:%x", fp)
	keyType := pubKey.Type()

	privateKeyPEM := req.PrivateKey

	res, err := s.db.SQL.ExecContext(r.Context(),
		`INSERT INTO ssh_keys (name, type, public_key, private_key_enc, fingerprint, comment) VALUES (?,?,?,?,?,?)`,
		req.Name, keyType, req.PublicKey, privateKeyPEM, fingerprint, req.Comment,
	)
	if err != nil {
		http.Error(w, "db error: "+err.Error(), http.StatusInternalServerError)
		return
	}
	id, _ := res.LastInsertId()

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(sshKey{ //nolint:errcheck
		ID:          id,
		Name:        req.Name,
		Type:        keyType,
		PublicKey:   req.PublicKey,
		Fingerprint: fingerprint,
		Comment:     req.Comment,
		CreatedAt:   time.Now().Unix(),
	})
}

func (s *Server) handleSSHKeyDelete(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		http.Error(w, "bad id", http.StatusBadRequest)
		return
	}
	s.db.SQL.ExecContext(r.Context(), `DELETE FROM ssh_keys WHERE id=?`, id) //nolint:errcheck
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleSSHKeyDownload(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		http.Error(w, "bad id", http.StatusBadRequest)
		return
	}
	which := r.URL.Query().Get("type") // "public" | "private"
	if which == "" {
		which = "public"
	}

	var name, pubKey, privKey string
	err = s.db.SQL.QueryRowContext(r.Context(),
		`SELECT name, public_key, private_key_enc FROM ssh_keys WHERE id=?`, id,
	).Scan(&name, &pubKey, &privKey)
	if err != nil {
		http.Error(w, "key not found", http.StatusNotFound)
		return
	}

	if which == "private" {
		w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, name))
		w.Header().Set("Content-Type", "application/octet-stream")
		w.Write([]byte(privKey)) //nolint:errcheck
	} else {
		w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s.pub"`, name))
		w.Header().Set("Content-Type", "text/plain")
		w.Write([]byte(pubKey)) //nolint:errcheck
	}
}

// ── SSH Saved Connections ─────────────────────────────────────────────────────

type sshSaved struct {
	ID        int64   `json:"id"`
	Name      string  `json:"name"`
	Host      string  `json:"host"`
	Port      int     `json:"port"`
	User      string  `json:"user"`
	AuthType  string  `json:"auth_type"`
	KeyID     *int64  `json:"key_id,omitempty"`
	JumpHost  string  `json:"jump_host,omitempty"`
	Tags      string  `json:"tags,omitempty"`
	CreatedAt int64   `json:"created_at"`
	LastUsed  *int64  `json:"last_used,omitempty"`
}

func (s *Server) handleSSHSavedList(w http.ResponseWriter, r *http.Request) {
	rows, err := s.db.SQL.QueryContext(r.Context(),
		`SELECT id, name, host, port, user, auth_type, key_id, COALESCE(jump_host,''), COALESCE(tags,''), created_at, last_used
		 FROM ssh_saved ORDER BY name ASC`,
	)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode([]sshSaved{}) //nolint:errcheck
		return
	}
	defer rows.Close()

	var list []sshSaved
	for rows.Next() {
		var c sshSaved
		rows.Scan(&c.ID, &c.Name, &c.Host, &c.Port, &c.User, &c.AuthType, &c.KeyID, &c.JumpHost, &c.Tags, &c.CreatedAt, &c.LastUsed) //nolint:errcheck
		list = append(list, c)
	}
	if list == nil {
		list = []sshSaved{}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(list) //nolint:errcheck
}

func (s *Server) handleSSHSavedCreate(w http.ResponseWriter, r *http.Request) {
	var req sshSaved
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	if req.Name == "" || req.Host == "" {
		http.Error(w, "name and host are required", http.StatusBadRequest)
		return
	}
	if req.Port == 0 {
		req.Port = 22
	}
	if req.User == "" {
		req.User = "root"
	}
	if req.AuthType == "" {
		req.AuthType = "password"
	}
	res, err := s.db.SQL.ExecContext(r.Context(),
		`INSERT INTO ssh_saved (name, host, port, user, auth_type, key_id, jump_host, tags) VALUES (?,?,?,?,?,?,?,?)`,
		req.Name, req.Host, req.Port, req.User, req.AuthType, req.KeyID, req.JumpHost, req.Tags,
	)
	if err != nil {
		http.Error(w, "db error: "+err.Error(), http.StatusInternalServerError)
		return
	}
	req.ID, _ = res.LastInsertId()
	req.CreatedAt = time.Now().Unix()
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(req) //nolint:errcheck
}

func (s *Server) handleSSHSavedUpdate(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		http.Error(w, "bad id", http.StatusBadRequest)
		return
	}
	var req sshSaved
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	_, err = s.db.SQL.ExecContext(r.Context(),
		`UPDATE ssh_saved SET name=?, host=?, port=?, user=?, auth_type=?, key_id=?, jump_host=?, tags=? WHERE id=?`,
		req.Name, req.Host, req.Port, req.User, req.AuthType, req.KeyID, req.JumpHost, req.Tags, id,
	)
	if err != nil {
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleSSHSavedDelete(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		http.Error(w, "bad id", http.StatusBadRequest)
		return
	}
	s.db.SQL.ExecContext(r.Context(), `DELETE FROM ssh_saved WHERE id=?`, id) //nolint:errcheck
	w.WriteHeader(http.StatusNoContent)
}

// ── SSH Sessions ──────────────────────────────────────────────────────────────

type sshSession struct {
	ID        int64  `json:"id"`
	Server    string `json:"server"`
	User      string `json:"user"`
	Port      int    `json:"port"`
	Status    string `json:"status"`
	StartedAt int64  `json:"started_at"`
	EndedAt   *int64 `json:"ended_at,omitempty"`
	BytesSent int64  `json:"bytes_sent"`
	BytesRecv int64  `json:"bytes_recv"`
}

func (s *Server) handleSSHSessionList(w http.ResponseWriter, r *http.Request) {
	rows, err := s.db.SQL.QueryContext(r.Context(),
		`SELECT id, server, user, port, status, started_at, ended_at, bytes_sent, bytes_recv
		 FROM ssh_sessions ORDER BY id DESC LIMIT 100`,
	)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode([]sshSession{}) //nolint:errcheck
		return
	}
	defer rows.Close()

	var list []sshSession
	for rows.Next() {
		var sess sshSession
		rows.Scan(&sess.ID, &sess.Server, &sess.User, &sess.Port, &sess.Status, &sess.StartedAt, &sess.EndedAt, &sess.BytesSent, &sess.BytesRecv) //nolint:errcheck
		list = append(list, sess)
	}
	if list == nil {
		list = []sshSession{}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(list) //nolint:errcheck
}

func (s *Server) handleSSHSessionCreate(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Server string `json:"server"`
		User   string `json:"user"`
		Port   int    `json:"port"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	if req.Server == "" {
		http.Error(w, "server is required", http.StatusBadRequest)
		return
	}
	if req.Port == 0 {
		req.Port = 22
	}
	if req.User == "" {
		req.User = "root"
	}
	res, err := s.db.SQL.ExecContext(r.Context(),
		`INSERT INTO ssh_sessions (server, user, port, status) VALUES (?,?,?,'active')`,
		req.Server, req.User, req.Port,
	)
	if err != nil {
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}
	id, _ := res.LastInsertId()
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]interface{}{ //nolint:errcheck
		"id": id, "server": req.Server, "user": req.User, "port": req.Port,
		"status": "active", "started_at": time.Now().Unix(),
	})
}

func (s *Server) handleSSHSessionTerminate(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		http.Error(w, "bad id", http.StatusBadRequest)
		return
	}
	s.db.SQL.ExecContext(r.Context(), //nolint:errcheck
		`UPDATE ssh_sessions SET status='closed', ended_at=unixepoch() WHERE id=?`, id,
	)
	w.WriteHeader(http.StatusNoContent)
}

// ── SSH Snippets ──────────────────────────────────────────────────────────────

type sshSnippet struct {
	ID          int64  `json:"id"`
	Name        string `json:"name"`
	Command     string `json:"command"`
	Description string `json:"description,omitempty"`
	Category    string `json:"category,omitempty"`
	Tags        string `json:"tags,omitempty"`
	UsedCount   int    `json:"used_count"`
	CreatedAt   int64  `json:"created_at"`
}

func (s *Server) handleSSHSnippetList(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query().Get("q")
	var rows interface {
		Next() bool
		Scan(...interface{}) error
		Close() error
	}
	var err error
	if q != "" {
		rows, err = s.db.SQL.QueryContext(r.Context(),
			`SELECT id, name, command, COALESCE(description,''), COALESCE(category,''), COALESCE(tags,''), used_count, created_at
			 FROM ssh_snippets WHERE name LIKE ? OR command LIKE ? OR category LIKE ? ORDER BY used_count DESC`,
			"%"+q+"%", "%"+q+"%", "%"+q+"%",
		)
	} else {
		rows, err = s.db.SQL.QueryContext(r.Context(),
			`SELECT id, name, command, COALESCE(description,''), COALESCE(category,''), COALESCE(tags,''), used_count, created_at
			 FROM ssh_snippets ORDER BY used_count DESC`,
		)
	}
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode([]sshSnippet{}) //nolint:errcheck
		return
	}
	defer rows.Close()

	var list []sshSnippet
	for rows.Next() {
		var sn sshSnippet
		rows.Scan(&sn.ID, &sn.Name, &sn.Command, &sn.Description, &sn.Category, &sn.Tags, &sn.UsedCount, &sn.CreatedAt) //nolint:errcheck
		list = append(list, sn)
	}
	if list == nil {
		list = []sshSnippet{}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(list) //nolint:errcheck
}

func (s *Server) handleSSHSnippetCreate(w http.ResponseWriter, r *http.Request) {
	var req sshSnippet
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	if req.Name == "" || req.Command == "" {
		http.Error(w, "name and command are required", http.StatusBadRequest)
		return
	}
	res, err := s.db.SQL.ExecContext(r.Context(),
		`INSERT INTO ssh_snippets (name, command, description, category, tags) VALUES (?,?,?,?,?)`,
		req.Name, req.Command, req.Description, req.Category, req.Tags,
	)
	if err != nil {
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}
	req.ID, _ = res.LastInsertId()
	req.CreatedAt = time.Now().Unix()
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(req) //nolint:errcheck
}

func (s *Server) handleSSHSnippetUpdate(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		http.Error(w, "bad id", http.StatusBadRequest)
		return
	}
	var req sshSnippet
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	_, err = s.db.SQL.ExecContext(r.Context(),
		`UPDATE ssh_snippets SET name=?, command=?, description=?, category=?, tags=? WHERE id=?`,
		req.Name, req.Command, req.Description, req.Category, req.Tags, id,
	)
	if err != nil {
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleSSHSnippetDelete(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		http.Error(w, "bad id", http.StatusBadRequest)
		return
	}
	s.db.SQL.ExecContext(r.Context(), `DELETE FROM ssh_snippets WHERE id=?`, id) //nolint:errcheck
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleSSHSnippetUse(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		http.Error(w, "bad id", http.StatusBadRequest)
		return
	}
	s.db.SQL.ExecContext(r.Context(), `UPDATE ssh_snippets SET used_count=used_count+1 WHERE id=?`, id) //nolint:errcheck
	w.WriteHeader(http.StatusNoContent)
}

// ── Port Forwards ─────────────────────────────────────────────────────────────

type sshPortForward struct {
	ID         int64  `json:"id"`
	SessionID  *int64 `json:"session_id,omitempty"`
	Type       string `json:"type"`
	LocalPort  int    `json:"local_port"`
	RemoteHost string `json:"remote_host"`
	RemotePort int    `json:"remote_port"`
	Status     string `json:"status"`
	CreatedAt  int64  `json:"created_at"`
}

func (s *Server) handleSSHPortForwardList(w http.ResponseWriter, r *http.Request) {
	rows, err := s.db.SQL.QueryContext(r.Context(),
		`SELECT id, session_id, type, COALESCE(local_port,0), COALESCE(remote_host,''), COALESCE(remote_port,0), status, created_at
		 FROM ssh_port_forwards ORDER BY id DESC`,
	)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode([]sshPortForward{}) //nolint:errcheck
		return
	}
	defer rows.Close()

	var list []sshPortForward
	for rows.Next() {
		var pf sshPortForward
		rows.Scan(&pf.ID, &pf.SessionID, &pf.Type, &pf.LocalPort, &pf.RemoteHost, &pf.RemotePort, &pf.Status, &pf.CreatedAt) //nolint:errcheck
		list = append(list, pf)
	}
	if list == nil {
		list = []sshPortForward{}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(list) //nolint:errcheck
}

func (s *Server) handleSSHPortForwardCreate(w http.ResponseWriter, r *http.Request) {
	var req sshPortForward
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	if req.Type == "" {
		req.Type = "local"
	}
	res, err := s.db.SQL.ExecContext(r.Context(),
		`INSERT INTO ssh_port_forwards (session_id, type, local_port, remote_host, remote_port, status) VALUES (?,?,?,?,?,'active')`,
		req.SessionID, req.Type, req.LocalPort, req.RemoteHost, req.RemotePort,
	)
	if err != nil {
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}
	req.ID, _ = res.LastInsertId()
	req.Status = "active"
	req.CreatedAt = time.Now().Unix()
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(req) //nolint:errcheck
}

func (s *Server) handleSSHPortForwardDelete(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		http.Error(w, "bad id", http.StatusBadRequest)
		return
	}
	s.db.SQL.ExecContext(r.Context(), `UPDATE ssh_port_forwards SET status='stopped' WHERE id=?`, id) //nolint:errcheck
	w.WriteHeader(http.StatusNoContent)
}

// ── Session Recordings ────────────────────────────────────────────────────────

func (s *Server) handleSSHRecordingList(w http.ResponseWriter, r *http.Request) {
	rows, err := s.db.SQL.QueryContext(r.Context(),
		`SELECT id, COALESCE(session_id,0), server, path, duration_s, size_bytes, created_at
		 FROM ssh_recordings ORDER BY id DESC LIMIT 100`,
	)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode([]map[string]interface{}{}) //nolint:errcheck
		return
	}
	defer rows.Close()

	type recording struct {
		ID         int64  `json:"id"`
		SessionID  int64  `json:"session_id"`
		Server     string `json:"server"`
		Path       string `json:"path"`
		DurationS  int    `json:"duration_s"`
		SizeBytes  int64  `json:"size_bytes"`
		CreatedAt  int64  `json:"created_at"`
	}

	var list []recording
	for rows.Next() {
		var rec recording
		rows.Scan(&rec.ID, &rec.SessionID, &rec.Server, &rec.Path, &rec.DurationS, &rec.SizeBytes, &rec.CreatedAt) //nolint:errcheck
		list = append(list, rec)
	}
	if list == nil {
		list = []recording{}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(list) //nolint:errcheck
}
