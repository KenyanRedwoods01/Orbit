package api

import (
	"bufio"
	"encoding/json"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// ── Types ─────────────────────────────────────────────────────────────────────

type f2bStatus struct {
	Installed    bool     `json:"installed"`
	Running      bool     `json:"running"`
	Version      string   `json:"version"`
	ActiveJails  []string `json:"active_jails"`
	TotalBanned  int      `json:"total_banned"`
	TotalFailed  int      `json:"total_failed"`
	JailCount    int      `json:"jail_count"`
	SocketPath   string   `json:"socket_path"`
	DBPath       string   `json:"db_path"`
	ConfigFile   string   `json:"config_file"`
}

type f2bJail struct {
	Name            string   `json:"name"`
	Enabled         bool     `json:"enabled"`
	Filter          string   `json:"filter"`
	LogPath         string   `json:"log_path"`
	MaxRetry        int      `json:"max_retry"`
	FindTime        int64    `json:"find_time"`
	BanTime         int64    `json:"ban_time"`
	BannedIPs       []string `json:"banned_ips"`
	TotalBanned     int      `json:"total_banned"`
	CurrentlyFailed int      `json:"currently_failed"`
	TotalFailed     int      `json:"total_failed"`
	Actions         []string `json:"actions"`
}

type f2bBan struct {
	IP        string `json:"ip"`
	Jail      string `json:"jail"`
	Timestamp int64  `json:"timestamp"`
	Expires   int64  `json:"expires"`
	Failures  int    `json:"failures"`
	Country   string `json:"country"`
}

type f2bLogEntry struct {
	ID        string `json:"id"`
	Timestamp string `json:"timestamp"`
	Level     string `json:"level"`
	Jail      string `json:"jail"`
	IP        string `json:"ip"`
	Message   string `json:"message"`
	Action    string `json:"action"`
}

type f2bConfig struct {
	BanTime       string `json:"ban_time"`
	FindTime      string `json:"find_time"`
	MaxRetry      string `json:"max_retry"`
	Backend       string `json:"backend"`
	IgnoreSelf    bool   `json:"ignore_self"`
	IgnoreIP      string `json:"ignore_ip"`
	Action        string `json:"action"`
	UseDNS        string `json:"use_dns"`
	LogLevel      string `json:"log_level"`
	LogFile       string `json:"log_file"`
	DBFile        string `json:"db_file"`
	DBMaxMatches  string `json:"db_max_matches"`
	DBPurgeAge    string `json:"db_purge_age"`
	Raw           string `json:"raw"`
}

var jailNameRe = regexp.MustCompile(`^[A-Za-z0-9_-]+$`)

// ── Helpers ───────────────────────────────────────────────────────────────────

func f2bInstalled() bool {
	_, err := exec.LookPath("fail2ban-client")
	return err == nil
}

func f2bRunning() bool {
	out, err := exec.Command("fail2ban-client", "ping").Output()
	return err == nil && strings.Contains(string(out), "pong")
}

func f2bVersion() string {
	out, err := exec.Command("fail2ban-client", "version").Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(out))
}

func f2bJailList() []string {
	out, err := exec.Command("fail2ban-client", "status").Output()
	if err != nil {
		return nil
	}
	re := regexp.MustCompile(`Jail list:\s+(.+)`)
	m := re.FindSubmatch(out)
	if m == nil {
		return nil
	}
	raw := strings.TrimSpace(string(m[1]))
	if raw == "" {
		return nil
	}
	var jails []string
	for _, j := range strings.Split(raw, ",") {
		j = strings.TrimSpace(j)
		if j != "" {
			jails = append(jails, j)
		}
	}
	return jails
}

func f2bJailDetail(name string) f2bJail {
	jail := f2bJail{Name: name, Enabled: true}
	out, err := exec.Command("fail2ban-client", "status", name).Output()
	if err != nil {
		return jail
	}
	text := string(out)

	matchInt := func(pat string) int {
		re := regexp.MustCompile(pat)
		m := re.FindStringSubmatch(text)
		if m == nil {
			return 0
		}
		n, _ := strconv.Atoi(m[1])
		return n
	}
	matchStr := func(pat string) string {
		re := regexp.MustCompile(pat)
		m := re.FindStringSubmatch(text)
		if m == nil {
			return ""
		}
		return strings.TrimSpace(m[1])
	}

	jail.CurrentlyFailed = matchInt(`Currently failed:\s+(\d+)`)
	jail.TotalFailed     = matchInt(`Total failed:\s+(\d+)`)
	jail.TotalBanned     = matchInt(`Total banned:\s+(\d+)`)
	bannedNow            := matchInt(`Currently banned:\s+(\d+)`)
	jail.Filter          = matchStr(`Filter\s*\|\s*(.+?)\s*\n`)
	jail.LogPath         = matchStr(`File list:\s+(.+)`)

	// Banned IP list
	bRe := regexp.MustCompile(`Banned IP list:\s+(.+)`)
	bm  := bRe.FindStringSubmatch(text)
	if bm != nil && strings.TrimSpace(bm[1]) != "" {
		for _, ip := range strings.Fields(bm[1]) {
			if ip != "" {
				jail.BannedIPs = append(jail.BannedIPs, ip)
			}
		}
	}
	if len(jail.BannedIPs) == 0 && bannedNow > 0 {
		jail.BannedIPs = []string{}
	}
	if jail.BannedIPs == nil {
		jail.BannedIPs = []string{}
	}

	// Get ban/find time and maxretry from get commands
	if bt, err := exec.Command("fail2ban-client", "get", name, "bantime").Output(); err == nil {
		jail.BanTime, _ = strconv.ParseInt(strings.TrimSpace(string(bt)), 10, 64)
	}
	if ft, err := exec.Command("fail2ban-client", "get", name, "findtime").Output(); err == nil {
		jail.FindTime, _ = strconv.ParseInt(strings.TrimSpace(string(ft)), 10, 64)
	}
	if mr, err := exec.Command("fail2ban-client", "get", name, "maxretry").Output(); err == nil {
		jail.MaxRetry, _ = strconv.Atoi(strings.TrimSpace(string(mr)))
	}
	if acts, err := exec.Command("fail2ban-client", "get", name, "actions").Output(); err == nil {
		jail.Actions = strings.Fields(strings.TrimSpace(string(acts)))
	}

	return jail
}

// ── Handlers ──────────────────────────────────────────────────────────────────

func (s *Server) handleFail2banStatus(w http.ResponseWriter, r *http.Request) {
	status := f2bStatus{
		SocketPath: "/var/run/fail2ban/fail2ban.sock",
		DBPath:     "/var/lib/fail2ban/fail2ban.sqlite3",
		ConfigFile: "/etc/fail2ban/jail.conf",
	}
	status.Installed = f2bInstalled()
	if !status.Installed {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(status) //nolint:errcheck
		return
	}
	status.Running = f2bRunning()
	if !status.Running {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(status) //nolint:errcheck
		return
	}
	status.Version     = f2bVersion()
	status.ActiveJails = f2bJailList()
	status.JailCount   = len(status.ActiveJails)
	for _, j := range status.ActiveJails {
		d := f2bJailDetail(j)
		status.TotalBanned += len(d.BannedIPs)
		status.TotalFailed += d.TotalFailed
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(status) //nolint:errcheck
}

func (s *Server) handleFail2banJails(w http.ResponseWriter, r *http.Request) {
	if !f2bInstalled() || !f2bRunning() {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode([]f2bJail{}) //nolint:errcheck
		return
	}
	names := f2bJailList()
	jails := make([]f2bJail, 0, len(names))
	for _, name := range names {
		jails = append(jails, f2bJailDetail(name))
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(jails) //nolint:errcheck
}

func (s *Server) handleFail2banJailGet(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	if !f2bInstalled() || !f2bRunning() {
		http.Error(w, "fail2ban not running", http.StatusServiceUnavailable)
		return
	}
	jail := f2bJailDetail(name)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(jail) //nolint:errcheck
}

func (s *Server) handleFail2banBans(w http.ResponseWriter, r *http.Request) {
	if !f2bInstalled() || !f2bRunning() {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode([]f2bBan{}) //nolint:errcheck
		return
	}
	jails := f2bJailList()
	var bans []f2bBan
	now := time.Now().Unix()
	for _, jail := range jails {
		d := f2bJailDetail(jail)
		for _, ip := range d.BannedIPs {
			bans = append(bans, f2bBan{
				IP:        ip,
				Jail:      jail,
				Timestamp: now - 3600, // approximate — fail2ban-client doesn't expose exact time easily
				Expires:   now - 3600 + d.BanTime,
				Failures:  d.MaxRetry,
			})
		}
	}
	if bans == nil {
		bans = []f2bBan{}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(bans) //nolint:errcheck
}

func (s *Server) handleFail2banBanIP(w http.ResponseWriter, r *http.Request) {
	jailName := r.PathValue("name")
	if !jailNameRe.MatchString(jailName) {
		http.Error(w, "invalid jail name", http.StatusBadRequest)
		return
	}
	var req struct {
		IP string `json:"ip"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.IP == "" {
		http.Error(w, "ip is required", http.StatusBadRequest)
		return
	}
	out, err := exec.Command("fail2ban-client", "set", jailName, "banip", req.IP).CombinedOutput()
	if err != nil {
		http.Error(w, "ban failed", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"ok": "true", "output": string(out)}) //nolint:errcheck
}

func (s *Server) handleFail2banUnbanIP(w http.ResponseWriter, r *http.Request) {
	jailName := r.PathValue("name")
	if !jailNameRe.MatchString(jailName) {
		http.Error(w, "invalid jail name", http.StatusBadRequest)
		return
	}
	var req struct {
		IP string `json:"ip"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.IP == "" {
		http.Error(w, "ip is required", http.StatusBadRequest)
		return
	}
	out, err := exec.Command("fail2ban-client", "set", jailName, "unbanip", req.IP).CombinedOutput()
	if err != nil {
		http.Error(w, "unban failed", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"ok": "true", "output": string(out)}) //nolint:errcheck
}

func (s *Server) handleFail2banUnbanGlobal(w http.ResponseWriter, r *http.Request) {
	var req struct {
		IP   string `json:"ip"`
		Jail string `json:"jail"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.IP == "" {
		http.Error(w, "ip is required", http.StatusBadRequest)
		return
	}
	jails := []string{req.Jail}
	if req.Jail == "" {
		jails = f2bJailList()
	} else if !jailNameRe.MatchString(req.Jail) {
		http.Error(w, "invalid jail name", http.StatusBadRequest)
		return
	}
	var results []string
	for _, jail := range jails {
		out, err := exec.Command("fail2ban-client", "set", jail, "unbanip", req.IP).CombinedOutput()
		if err == nil {
			results = append(results, jail+": "+strings.TrimSpace(string(out)))
		}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"ok": true, "results": results}) //nolint:errcheck
}

func (s *Server) handleFail2banLogs(w http.ResponseWriter, r *http.Request) {
	limitStr := r.URL.Query().Get("limit")
	limit := 200
	if n, err := strconv.Atoi(limitStr); err == nil && n > 0 && n <= 1000 {
		limit = n
	}

	logPath := "/var/log/fail2ban.log"
	if _, err := os.Stat(logPath); os.IsNotExist(err) {
		logPath = "/var/log/fail2ban/fail2ban.log"
	}

	f, err := os.Open(logPath)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode([]f2bLogEntry{}) //nolint:errcheck
		return
	}
	defer f.Close()

	// Read last N lines
	var lines []string
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		lines = append(lines, scanner.Text())
	}
	if len(lines) > limit {
		lines = lines[len(lines)-limit:]
	}

	// Parse lines
	// Format: 2024-01-15 10:38:12,891 fail2ban.filter         [1234]: INFO    [sshd] Found 1.2.3.4
	re := regexp.MustCompile(`^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}),\d+\s+fail2ban\.\w+\s+\[\d+\]:\s+(\w+)\s+(.+)$`)
	jailRe := regexp.MustCompile(`\[(\w[\w-]*)\]`)
	ipRe   := regexp.MustCompile(`\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\b`)

	var entries []f2bLogEntry
	for i, line := range lines {
		m := re.FindStringSubmatch(line)
		if m == nil {
			continue
		}
		ts, level, msg := m[1], strings.ToLower(m[2]), m[3]
		entry := f2bLogEntry{
			ID:        strconv.Itoa(i),
			Timestamp: ts,
			Level:     level,
			Message:   msg,
		}
		if jm := jailRe.FindStringSubmatch(msg); jm != nil {
			entry.Jail = jm[1]
		}
		if im := ipRe.FindStringSubmatch(msg); im != nil {
			entry.IP = im[1]
		}
		switch {
		case strings.Contains(msg, "Ban "):
			entry.Action = "ban"
		case strings.Contains(msg, "Unban "):
			entry.Action = "unban"
		case strings.Contains(msg, "Found "):
			entry.Action = "found"
		case strings.Contains(msg, "WARNING") || strings.Contains(msg, "ERROR"):
			entry.Level = "warn"
		}
		entries = append(entries, entry)
	}
	// reverse for newest-first
	for i, j := 0, len(entries)-1; i < j; i, j = i+1, j-1 {
		entries[i], entries[j] = entries[j], entries[i]
	}
	if entries == nil {
		entries = []f2bLogEntry{}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(entries) //nolint:errcheck
}

func (s *Server) handleFail2banConfig(w http.ResponseWriter, r *http.Request) {
	cfg := f2bConfig{}
	paths := []string{"/etc/fail2ban/jail.local", "/etc/fail2ban/jail.conf"}
	for _, p := range paths {
		raw, err := os.ReadFile(p)
		if err == nil {
			cfg.Raw = string(raw)
			parseF2bConfig(string(raw), &cfg)
			break
		}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(cfg) //nolint:errcheck
}

func parseF2bConfig(raw string, cfg *f2bConfig) {
	get := func(key string) string {
		re := regexp.MustCompile(`(?m)^\s*` + key + `\s*=\s*(.+)$`)
		m := re.FindStringSubmatch(raw)
		if m == nil {
			return ""
		}
		return strings.TrimSpace(m[1])
	}
	cfg.BanTime      = get("bantime")
	cfg.FindTime     = get("findtime")
	cfg.MaxRetry     = get("maxretry")
	cfg.Backend      = get("backend")
	cfg.IgnoreIP     = get("ignoreip")
	cfg.Action       = get("action")
	cfg.UseDNS       = get("usedns")
	cfg.LogLevel     = get("loglevel")
	cfg.LogFile      = get("logtarget")
	cfg.DBFile       = get("dbfile")
	cfg.DBMaxMatches = get("dbmaxmatches")
	cfg.DBPurgeAge   = get("dbpurgeage")
	cfg.IgnoreSelf   = get("ignoreself") == "true"
}

func (s *Server) handleFail2banConfigSave(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Raw string `json:"raw"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	targetPath := "/etc/fail2ban/jail.local"
	// WARNING: privileged file write with user-supplied content - ensure input validation
	if err := os.WriteFile(targetPath, []byte(req.Raw), 0o644); err != nil {
		http.Error(w, "write failed", http.StatusInternalServerError)
		return
	}
	// Test config
	out, _ := exec.Command("fail2ban-client", "-t").CombinedOutput()
	ok := !strings.Contains(strings.ToLower(string(out)), "error")
	if ok {
		exec.Command("fail2ban-client", "reload").Run() //nolint:errcheck
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"ok": ok, "output": string(out)}) //nolint:errcheck
}

func (s *Server) handleFail2banService(w http.ResponseWriter, r *http.Request) {
	action := r.PathValue("action")
	var cmd *exec.Cmd
	switch action {
	case "start":
		cmd = exec.Command("systemctl", "start", "fail2ban")
	case "stop":
		cmd = exec.Command("systemctl", "stop", "fail2ban")
	case "restart":
		cmd = exec.Command("systemctl", "restart", "fail2ban")
	case "reload":
		cmd = exec.Command("fail2ban-client", "reload")
	case "enable":
		cmd = exec.Command("systemctl", "enable", "fail2ban")
	case "disable":
		cmd = exec.Command("systemctl", "disable", "fail2ban")
	default:
		http.Error(w, "unknown action", http.StatusBadRequest)
		return
	}
	out, err := cmd.CombinedOutput()
	ok := err == nil
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"ok": ok, "output": string(out), "action": action}) //nolint:errcheck
}

func (s *Server) handleFail2banInstall(w http.ResponseWriter, r *http.Request) {
	if f2bInstalled() {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{"ok": true, "output": "already installed"}) //nolint:errcheck
		return
	}
	// Attempt installation via apt
	out, err := exec.Command("bash", "-c",
		"DEBIAN_FRONTEND=noninteractive apt-get install -y fail2ban 2>&1",
	).CombinedOutput()
	ok := err == nil
	if ok {
		// Write a basic jail.local to enable sshd jail
		basicConfig := `[DEFAULT]
bantime  = 1h
findtime = 10m
maxretry = 5
ignoreself = true

[sshd]
enabled = true
port    = ssh
logpath = %(sshd_log)s
backend = %(sshd_backend)s
maxretry = 3
`
		os.WriteFile("/etc/fail2ban/jail.local", []byte(basicConfig), 0o644) //nolint:errcheck
		exec.Command("systemctl", "enable", "--now", "fail2ban").Run()       //nolint:errcheck
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"ok": ok, "output": string(out)}) //nolint:errcheck
}

func (s *Server) handleFail2banJailConfig(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	// Read jail.local and jail.conf for the specific jail section
	readJailSection := func(path string) string {
		raw, err := os.ReadFile(path)
		if err != nil {
			return ""
		}
		text := string(raw)
		// Find [name] section
		sectionRe := regexp.MustCompile(`(?s)\[` + regexp.QuoteMeta(name) + `\](.*?)(?:\n\[|\z)`)
		m := sectionRe.FindStringSubmatch(text)
		if m == nil {
			return ""
		}
		return "[" + name + "]" + m[1]
	}
	section := readJailSection("/etc/fail2ban/jail.local")
	if section == "" {
		section = readJailSection("/etc/fail2ban/jail.conf")
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"name": name, "config": section}) //nolint:errcheck
}

func (s *Server) handleFail2banJailConfigSave(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	cleanName := filepath.Clean(name)
	if strings.Contains(name, "..") || strings.Contains(name, "/") || cleanName != name {
		http.Error(w, "invalid name", http.StatusBadRequest)
		return
	}
	var req struct {
		Config string `json:"config"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	// Write to /etc/fail2ban/jail.d/<name>.local
	path := "/etc/fail2ban/jail.d/" + cleanName + ".local"
	os.MkdirAll("/etc/fail2ban/jail.d", 0o755) //nolint:errcheck
	if err := os.WriteFile(path, []byte(req.Config), 0o644); err != nil {
		http.Error(w, "write failed", http.StatusInternalServerError)
		return
	}
	out, _ := exec.Command("fail2ban-client", "reload", name).CombinedOutput()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"ok": true, "output": string(out)}) //nolint:errcheck
}

func (s *Server) handleFail2banWhitelist(w http.ResponseWriter, r *http.Request) {
	// Read ignoreip from jail.local or jail.conf
	getIgnoreIP := func(path string) string {
		raw, err := os.ReadFile(path)
		if err != nil {
			return ""
		}
		re := regexp.MustCompile(`(?m)^\s*ignoreip\s*=\s*(.+)$`)
		m := re.FindStringSubmatch(string(raw))
		if m == nil {
			return ""
		}
		return strings.TrimSpace(m[1])
	}
	ignoreip := getIgnoreIP("/etc/fail2ban/jail.local")
	if ignoreip == "" {
		ignoreip = getIgnoreIP("/etc/fail2ban/jail.conf")
	}
	var ips []string
	for _, ip := range strings.Fields(ignoreip) {
		if ip != "" && ip != "127.0.0.1/8" && ip != "::1" {
			ips = append(ips, ip)
		}
	}
	if ips == nil {
		ips = []string{}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"ips": ips, "raw": ignoreip}) //nolint:errcheck
}

func (s *Server) handleFail2banWhitelistAdd(w http.ResponseWriter, r *http.Request) {
	var req struct {
		IP string `json:"ip"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.IP == "" {
		http.Error(w, "ip is required", http.StatusBadRequest)
		return
	}
	out, err := exec.Command("fail2ban-client", "set", "sshd", "addignoreip", req.IP).CombinedOutput()
	ok := err == nil
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"ok": ok, "output": string(out)}) //nolint:errcheck
}

func (s *Server) handleFail2banWhitelistRemove(w http.ResponseWriter, r *http.Request) {
	ip := r.PathValue("ip")
	if !regexp.MustCompile(`^[0-9a-fA-F.:/]+$`).MatchString(ip) {
		http.Error(w, "invalid ip", http.StatusBadRequest)
		return
	}
	out, err := exec.Command("fail2ban-client", "set", "sshd", "delignoreip", ip).CombinedOutput()
	ok := err == nil
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"ok": ok, "output": string(out)}) //nolint:errcheck
}

func (s *Server) handleFail2banFilters(w http.ResponseWriter, r *http.Request) {
	filterDir := "/etc/fail2ban/filter.d"
	entries, err := os.ReadDir(filterDir)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode([]string{}) //nolint:errcheck
		return
	}
	var filters []string
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".conf") {
			filters = append(filters, strings.TrimSuffix(e.Name(), ".conf"))
		}
	}
	if filters == nil {
		filters = []string{}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(filters) //nolint:errcheck
}

func (s *Server) handleFail2banStats(w http.ResponseWriter, r *http.Request) {
	// Aggregate ban stats from SQLite db if available
	type dailyStat struct {
		Date string `json:"date"`
		Bans int    `json:"bans"`
	}
	stats := make([]dailyStat, 0)
	// Check fail2ban SQLite DB
	dbPath := "/var/lib/fail2ban/fail2ban.sqlite3"
	if _, err := os.Stat(dbPath); err == nil {
		// Use python3 to query (avoiding importing sqlite3 in Go)
		out, err := exec.Command("python3", "-c", `
import sqlite3, json, datetime
try:
    conn = sqlite3.connect('/var/lib/fail2ban/fail2ban.sqlite3')
    c = conn.cursor()
    c.execute("""
        SELECT date(timeofban, 'unixepoch') as day, COUNT(*) as cnt
        FROM bans WHERE timeofban > strftime('%s','now','-7 days')
        GROUP BY day ORDER BY day ASC
    """)
    rows = c.fetchall()
    print(json.dumps([{"date": r[0], "bans": r[1]} for r in rows]))
    conn.close()
except Exception as e:
    print('[]')
`).Output()
		if err == nil {
			json.Unmarshal(out, &stats) //nolint:errcheck
		}
	}
	// If we got no stats, return empty daily stats for last 7 days
	if len(stats) == 0 {
		for i := 6; i >= 0; i-- {
			day := time.Now().AddDate(0, 0, -i)
			stats = append(stats, dailyStat{
				Date: day.Format("2006-01-02"),
				Bans: 0,
			})
		}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(stats) //nolint:errcheck
}
