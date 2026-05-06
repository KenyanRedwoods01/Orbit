package api

import (
	"bufio"
	"encoding/json"
	"net/http"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
)

// ── FTP Server Control ────────────────────────────────────────────────────────

const vsftpdConf = "/etc/vsftpd.conf"

func (s *Server) handleFTPConfigGet(w http.ResponseWriter, r *http.Request) {
	data, err := os.ReadFile(vsftpdConf)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{ //nolint:errcheck
			"raw":    "",
			"exists": false,
		})
		return
	}
	cfg := parseFTPConf(string(data))
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{ //nolint:errcheck
		"raw":    string(data),
		"parsed": cfg,
		"exists": true,
	})
}

func (s *Server) handleFTPConfigPut(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Raw    string            `json:"raw"`
		Parsed map[string]string `json:"parsed"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	var content string
	if req.Raw != "" {
		content = req.Raw
	} else if len(req.Parsed) > 0 {
		var sb strings.Builder
		for k, v := range req.Parsed {
			sb.WriteString(k + "=" + v + "\n")
		}
		content = sb.String()
	} else {
		http.Error(w, "raw or parsed config required", http.StatusBadRequest)
		return
	}
	if err := os.WriteFile(vsftpdConf, []byte(content), 0o644); err != nil {
		http.Error(w, "write error: "+err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"ok": true}) //nolint:errcheck
}

func (s *Server) handleFTPServiceAction(w http.ResponseWriter, r *http.Request) {
	action := r.PathValue("action")
	if action == "status" {
		out, _ := exec.Command("systemctl", "is-active", "vsftpd").Output()
		active := strings.TrimSpace(string(out)) == "active"
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{ //nolint:errcheck
			"active":  active,
			"status":  strings.TrimSpace(string(out)),
			"service": "vsftpd",
		})
		return
	}
	validActions := map[string]bool{"start": true, "stop": true, "restart": true}
	if !validActions[action] {
		http.Error(w, "invalid action", http.StatusBadRequest)
		return
	}
	out, err := exec.Command("systemctl", action, "vsftpd").CombinedOutput()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{ //nolint:errcheck
		"ok":     err == nil,
		"action": action,
		"output": string(out),
	})
}

func (s *Server) handleFTPTestConfig(w http.ResponseWriter, r *http.Request) {
	out, err := exec.Command("vsftpd", "-ocheck_shell=NO", "/dev/null").CombinedOutput()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"ok": err == nil, "output": string(out)}) //nolint:errcheck
}

// ── FTP Users ─────────────────────────────────────────────────────────────────

type ftpUser struct {
	ID            int64  `json:"id"`
	Username      string `json:"username"`
	HomeDir       string `json:"home_dir"`
	UploadLimit   int64  `json:"upload_limit"`
	DownloadLimit int64  `json:"download_limit"`
	Chroot        bool   `json:"chroot"`
	Enabled       bool   `json:"enabled"`
	CreatedAt     int64  `json:"created_at"`
	LastLogin     *int64 `json:"last_login,omitempty"`
}

func (s *Server) handleFTPUserList(w http.ResponseWriter, r *http.Request) {
	rows, err := s.db.SQL.QueryContext(r.Context(),
		`SELECT id, username, home_dir, upload_limit, download_limit, chroot, enabled, created_at, last_login
		 FROM ftp_users ORDER BY username ASC`,
	)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode([]ftpUser{}) //nolint:errcheck
		return
	}
	defer rows.Close()
	var users []ftpUser
	for rows.Next() {
		var u ftpUser
		var chroot, enabled int
		rows.Scan(&u.ID, &u.Username, &u.HomeDir, &u.UploadLimit, &u.DownloadLimit, //nolint:errcheck
			&chroot, &enabled, &u.CreatedAt, &u.LastLogin)
		u.Chroot = chroot == 1
		u.Enabled = enabled == 1
		users = append(users, u)
	}
	if users == nil {
		users = []ftpUser{}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(users) //nolint:errcheck
}

func (s *Server) handleFTPUserCreate(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Username      string `json:"username"`
		Password      string `json:"password"`
		HomeDir       string `json:"home_dir"`
		UploadLimit   int64  `json:"upload_limit"`
		DownloadLimit int64  `json:"download_limit"`
		Chroot        bool   `json:"chroot"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	if req.Username == "" || req.Password == "" {
		http.Error(w, "username and password are required", http.StatusBadRequest)
		return
	}
	if req.HomeDir == "" {
		req.HomeDir = "/home/ftp/" + req.Username
	}
	os.MkdirAll(req.HomeDir, 0o755) //nolint:errcheck

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		http.Error(w, "hash error", http.StatusInternalServerError)
		return
	}
	chroot := 0
	if req.Chroot {
		chroot = 1
	}
	res, err := s.db.SQL.ExecContext(r.Context(),
		`INSERT INTO ftp_users (username, pw_hash, home_dir, upload_limit, download_limit, chroot, enabled) VALUES (?,?,?,?,?,?,1)`,
		req.Username, string(hash), req.HomeDir, req.UploadLimit, req.DownloadLimit, chroot,
	)
	if err != nil {
		http.Error(w, "db error: "+err.Error(), http.StatusInternalServerError)
		return
	}
	id, _ := res.LastInsertId()
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(ftpUser{ //nolint:errcheck
		ID:            id,
		Username:      req.Username,
		HomeDir:       req.HomeDir,
		UploadLimit:   req.UploadLimit,
		DownloadLimit: req.DownloadLimit,
		Chroot:        req.Chroot,
		Enabled:       true,
		CreatedAt:     time.Now().Unix(),
	})
}

func (s *Server) handleFTPUserUpdate(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		http.Error(w, "bad id", http.StatusBadRequest)
		return
	}
	var req struct {
		Password      string `json:"password"`
		HomeDir       string `json:"home_dir"`
		UploadLimit   int64  `json:"upload_limit"`
		DownloadLimit int64  `json:"download_limit"`
		Chroot        bool   `json:"chroot"`
		Enabled       bool   `json:"enabled"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	chroot, enabled := 0, 0
	if req.Chroot {
		chroot = 1
	}
	if req.Enabled {
		enabled = 1
	}
	if req.Password != "" {
		hash, err2 := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
		if err2 != nil {
			http.Error(w, "hash error", http.StatusInternalServerError)
			return
		}
		_, err = s.db.SQL.ExecContext(r.Context(),
			`UPDATE ftp_users SET pw_hash=?, home_dir=?, upload_limit=?, download_limit=?, chroot=?, enabled=? WHERE id=?`,
			string(hash), req.HomeDir, req.UploadLimit, req.DownloadLimit, chroot, enabled, id,
		)
	} else {
		_, err = s.db.SQL.ExecContext(r.Context(),
			`UPDATE ftp_users SET home_dir=?, upload_limit=?, download_limit=?, chroot=?, enabled=? WHERE id=?`,
			req.HomeDir, req.UploadLimit, req.DownloadLimit, chroot, enabled, id,
		)
	}
	if err != nil {
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleFTPUserDelete(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		http.Error(w, "bad id", http.StatusBadRequest)
		return
	}
	s.db.SQL.ExecContext(r.Context(), `DELETE FROM ftp_users WHERE id=?`, id) //nolint:errcheck
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleFTPUserToggle(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		http.Error(w, "bad id", http.StatusBadRequest)
		return
	}
	s.db.SQL.ExecContext(r.Context(), //nolint:errcheck
		`UPDATE ftp_users SET enabled = CASE WHEN enabled=1 THEN 0 ELSE 1 END WHERE id=?`, id,
	)
	w.WriteHeader(http.StatusNoContent)
}

// ── FTP Quotas ────────────────────────────────────────────────────────────────

type ftpQuota struct {
	ID        int64  `json:"id"`
	Username  string `json:"username"`
	SoftBytes int64  `json:"soft_bytes"`
	HardBytes int64  `json:"hard_bytes"`
	GraceDays int    `json:"grace_days"`
}

func (s *Server) handleFTPQuotaList(w http.ResponseWriter, r *http.Request) {
	rows, err := s.db.SQL.QueryContext(r.Context(),
		`SELECT id, username, soft_bytes, hard_bytes, grace_days FROM ftp_quotas ORDER BY username ASC`,
	)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode([]ftpQuota{}) //nolint:errcheck
		return
	}
	defer rows.Close()
	var quotas []ftpQuota
	for rows.Next() {
		var q ftpQuota
		rows.Scan(&q.ID, &q.Username, &q.SoftBytes, &q.HardBytes, &q.GraceDays) //nolint:errcheck
		quotas = append(quotas, q)
	}
	if quotas == nil {
		quotas = []ftpQuota{}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(quotas) //nolint:errcheck
}

func (s *Server) handleFTPQuotaSet(w http.ResponseWriter, r *http.Request) {
	var req ftpQuota
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	if req.Username == "" {
		http.Error(w, "username is required", http.StatusBadRequest)
		return
	}
	if req.GraceDays == 0 {
		req.GraceDays = 7
	}
	res, err := s.db.SQL.ExecContext(r.Context(),
		`INSERT INTO ftp_quotas (username, soft_bytes, hard_bytes, grace_days) VALUES (?,?,?,?)
		 ON CONFLICT(username) DO UPDATE SET soft_bytes=excluded.soft_bytes, hard_bytes=excluded.hard_bytes, grace_days=excluded.grace_days`,
		req.Username, req.SoftBytes, req.HardBytes, req.GraceDays,
	)
	if err != nil {
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}
	req.ID, _ = res.LastInsertId()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(req) //nolint:errcheck
}

func (s *Server) handleFTPQuotaDelete(w http.ResponseWriter, r *http.Request) {
	username := r.PathValue("username")
	s.db.SQL.ExecContext(r.Context(), `DELETE FROM ftp_quotas WHERE username=?`, username) //nolint:errcheck
	w.WriteHeader(http.StatusNoContent)
}

// ── Cloud Mounts (rclone) ─────────────────────────────────────────────────────

func (s *Server) handleFTPMountList(w http.ResponseWriter, r *http.Request) {
	out, err := exec.Command("rclone", "listremotes").Output()
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{ //nolint:errcheck
			"remotes": []string{},
			"error":   "rclone not available",
		})
		return
	}
	var remotes []string
	scanner := bufio.NewScanner(strings.NewReader(string(out)))
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line != "" {
			remotes = append(remotes, strings.TrimSuffix(line, ":"))
		}
	}
	if remotes == nil {
		remotes = []string{}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"remotes": remotes}) //nolint:errcheck
}

func (s *Server) handleFTPMountAction(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Remote    string `json:"remote"`
		MountPath string `json:"mount_path"`
		Action    string `json:"action"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	if req.Remote == "" || req.MountPath == "" || req.Action == "" {
		http.Error(w, "remote, mount_path, and action are required", http.StatusBadRequest)
		return
	}
	var out []byte
	var err error
	switch req.Action {
	case "mount":
		os.MkdirAll(req.MountPath, 0o755) //nolint:errcheck
		out, err = exec.Command("rclone", "mount", req.Remote+":", req.MountPath, "--daemon").CombinedOutput()
	case "unmount":
		out, err = exec.Command("fusermount", "-u", req.MountPath).CombinedOutput()
	default:
		http.Error(w, "action must be mount or unmount", http.StatusBadRequest)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{ //nolint:errcheck
		"ok": err == nil, "action": req.Action, "output": string(out),
	})
}

// ── helpers ───────────────────────────────────────────────────────────────────

func parseFTPConf(raw string) map[string]string {
	cfg := map[string]string{}
	scanner := bufio.NewScanner(strings.NewReader(raw))
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		parts := strings.SplitN(line, "=", 2)
		if len(parts) == 2 {
			cfg[strings.TrimSpace(parts[0])] = strings.TrimSpace(parts[1])
		}
	}
	return cfg
}
