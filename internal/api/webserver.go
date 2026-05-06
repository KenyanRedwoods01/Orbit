package api

import (
        "bufio"
        "encoding/json"
        "fmt"
        "net/http"
        "os"
        "os/exec"
        "path/filepath"
        "regexp"
        "strconv"
        "strings"
        "time"
)

// ── Regexps for nginx config parsing ────────────────────────────────────────

var (
        reRoot       = regexp.MustCompile(`(?m)^\s*root\s+([^;]+);`)
        reServerName = regexp.MustCompile(`(?m)^\s*server_name\s+([^;]+);`)
        reListen     = regexp.MustCompile(`(?m)^\s*listen\s+([^;]+);`)
        reGzip       = regexp.MustCompile(`(?m)^\s*gzip\s+on\s*;`)
        reBrotli     = regexp.MustCompile(`(?m)^\s*brotli\s+on\s*;`)
        reSSL        = regexp.MustCompile(`(?m)^\s*ssl_certificate\s+([^;]+);`)
        reProxy      = regexp.MustCompile(`(?m)^\s*proxy_pass\s+([^;]+);`)
        reAccessLog  = regexp.MustCompile(`(?m)^\s*access_log\s+([^;]+);`)
        reErrorLog   = regexp.MustCompile(`(?m)^\s*error_log\s+([^;]+);`)
        reRateLimit  = regexp.MustCompile(`(?m)^\s*limit_req\s+`)
        reBasicAuth  = regexp.MustCompile(`(?m)^\s*auth_basic\s+`)
        reHSTS       = regexp.MustCompile(`(?m)Strict-Transport-Security`)
        rePHP        = regexp.MustCompile(`(?m)fastcgi_pass`)
)

// ── Types ────────────────────────────────────────────────────────────────────

type nginxSite struct {
        Name        string   `json:"name"`
        Enabled     bool     `json:"enabled"`
        Root        string   `json:"root"`
        ServerName  string   `json:"server_name"`
        Aliases     []string `json:"aliases"`
        Listen      string   `json:"listen"`
        SSL         string   `json:"ssl"`
        SSLCertPath string   `json:"ssl_cert_path"`
        Proxy       string   `json:"proxy"`
        AccessLog   string   `json:"access_log"`
        ErrorLog    string   `json:"error_log"`
        Gzip        bool     `json:"gzip"`
        Brotli      bool     `json:"brotli"`
        PHP         bool     `json:"php"`
        RateLimit   bool     `json:"rate_limit"`
        BasicAuth   bool     `json:"basic_auth"`
        HSTS        bool     `json:"hsts"`
        Config      string   `json:"config"`
        Status      string   `json:"status"`
        ConfigFile  string   `json:"config_file"`
}

type nginxStatus struct {
        Running    bool   `json:"running"`
        Version    string `json:"version"`
        PID        int    `json:"pid"`
        ConfigFile string `json:"config_file"`
        ConfigOK   bool   `json:"config_ok"`
        ConfigTest string `json:"config_test"`
        Workers    int    `json:"workers"`
        Uptime     string `json:"uptime"`
        Binary     string `json:"binary"`
}

type nginxPerformance struct {
        ActiveConns  int `json:"active_conns"`
        Reading      int `json:"reading"`
        Writing      int `json:"writing"`
        Waiting      int `json:"waiting"`
        Accepts      int `json:"accepts"`
        Handled      int `json:"handled"`
        Requests     int `json:"requests"`
}

type nginxGlobalConfig struct {
        WorkerProcesses   string `json:"worker_processes"`
        WorkerConnections string `json:"worker_connections"`
        KeepaliveTimeout  string `json:"keepalive_timeout"`
        ClientMaxBodySize string `json:"client_max_body_size"`
        ServerTokens      bool   `json:"server_tokens_off"`
        TcpNopush         bool   `json:"tcp_nopush"`
        Gzip              bool   `json:"gzip"`
        Raw               string `json:"raw"`
}

type accessLogLine struct {
        ID     string `json:"id"`
        TS     string `json:"ts"`
        IP     string `json:"ip"`
        Method string `json:"method"`
        Path   string `json:"path"`
        Status int    `json:"status"`
        Bytes  int    `json:"bytes"`
        UA     string `json:"ua"`
}

// ── Parsing helpers ───────────────────────────────────────────────────────────

func parseNginxFields(config string) (root, serverName, listen string) {
        if m := reRoot.FindStringSubmatch(config); len(m) > 1 {
                root = strings.TrimSpace(m[1])
        }
        if m := reServerName.FindStringSubmatch(config); len(m) > 1 {
                serverName = strings.TrimSpace(m[1])
        }
        if m := reListen.FindStringSubmatch(config); len(m) > 1 {
                listen = strings.TrimSpace(m[1])
        }
        return
}

func detectSSLType(certPath string) string {
        if certPath == "" {
                return "none"
        }
        if strings.Contains(certPath, "letsencrypt") {
                return "letsencrypt"
        }
        return "custom"
}

func parseNginxSite(name, path string, enabled bool) nginxSite {
        configBytes, err := os.ReadFile(path)
        config := ""
        if err == nil {
                config = string(configBytes)
        }

        root, serverName, listen := parseNginxFields(config)

        // Parse aliases from server_name
        var primaryDomain, aliases string
        parts := strings.Fields(serverName)
        if len(parts) > 0 {
                primaryDomain = parts[0]
                aliases = strings.Join(parts[1:], " ")
        }

        // SSL cert path
        sslCertPath := ""
        if m := reSSL.FindStringSubmatch(config); len(m) > 1 {
                sslCertPath = strings.TrimSpace(m[1])
        }

        // Proxy
        proxy := ""
        if m := reProxy.FindStringSubmatch(config); len(m) > 1 {
                proxy = strings.TrimSpace(m[1])
        }

        // Logs
        accessLog := "/var/log/nginx/" + name + "-access.log"
        errorLog := "/var/log/nginx/" + name + "-error.log"
        if m := reAccessLog.FindStringSubmatch(config); len(m) > 1 {
                accessLog = strings.Fields(strings.TrimSpace(m[1]))[0]
        }
        if m := reErrorLog.FindStringSubmatch(config); len(m) > 1 {
                errorLog = strings.Fields(strings.TrimSpace(m[1]))[0]
        }

        var aliasesList []string
        if aliases != "" {
                for _, a := range strings.Fields(aliases) {
                        if a != "" {
                                aliasesList = append(aliasesList, a)
                        }
                }
        }

        status := "active"
        if !enabled {
                status = "disabled"
        }

        return nginxSite{
                Name:        name,
                Enabled:     enabled,
                Root:        root,
                ServerName:  primaryDomain,
                Aliases:     aliasesList,
                Listen:      listen,
                SSL:         detectSSLType(sslCertPath),
                SSLCertPath: sslCertPath,
                Proxy:       proxy,
                AccessLog:   accessLog,
                ErrorLog:    errorLog,
                Gzip:        reGzip.MatchString(config),
                Brotli:      reBrotli.MatchString(config),
                PHP:         rePHP.MatchString(config),
                RateLimit:   reRateLimit.MatchString(config),
                BasicAuth:   reBasicAuth.MatchString(config),
                HSTS:        reHSTS.MatchString(config),
                Config:      config,
                Status:      status,
                ConfigFile:  path,
        }
}

func listNginxSites() []nginxSite {
        var sites []nginxSite
        dirs := []struct {
                dir     string
                enabled bool
        }{
                {"/etc/nginx/sites-available", false},
                {"/etc/nginx/sites-enabled", true},
        }
        seen := map[string]int{}
        for _, d := range dirs {
                entries, err := os.ReadDir(d.dir)
                if err != nil {
                        continue
                }
                for _, e := range entries {
                        if e.IsDir() {
                                continue
                        }
                        name := e.Name()
                        path := filepath.Join(d.dir, name)

                        if idx, ok := seen[name]; ok {
                                if d.enabled {
                                        sites[idx].Enabled = true
                                        sites[idx].Status = "active"
                                }
                        } else {
                                seen[name] = len(sites)
                                sites = append(sites, parseNginxSite(name, path, d.enabled))
                        }
                }
        }
        return sites
}

// ── Nginx process helpers ────────────────────────────────────────────────────

func getNginxStatus() nginxStatus {
        status := nginxStatus{
                ConfigFile: "/etc/nginx/nginx.conf",
                Binary:     "nginx",
        }

        // Check if nginx is running
        out, err := exec.Command("pgrep", "-x", "nginx").Output()
        status.Running = err == nil && len(strings.TrimSpace(string(out))) > 0

        if status.Running {
                lines := strings.Fields(strings.TrimSpace(string(out)))
                if len(lines) > 0 {
                        if pid, err := strconv.Atoi(lines[0]); err == nil {
                                status.PID = pid
                        }
                }

                // Count workers (all nginx processes minus master)
                allOut, _ := exec.Command("pgrep", "-c", "nginx").Output()
                if count, err := strconv.Atoi(strings.TrimSpace(string(allOut))); err == nil && count > 1 {
                        status.Workers = count - 1
                }

                // Get uptime from /proc/<pid>/stat
                if status.PID > 0 {
                        statPath := fmt.Sprintf("/proc/%d/stat", status.PID)
                        if data, err := os.ReadFile(statPath); err == nil {
                                fields := strings.Fields(string(data))
                                if len(fields) > 21 {
                                        // starttime is field 22 (0-indexed 21)
                                        // this is in clock ticks, 100 per second typically
                                        if ticks, err := strconv.ParseInt(fields[21], 10, 64); err == nil {
                                                bootData, _ := os.ReadFile("/proc/uptime")
                                                bootFields := strings.Fields(string(bootData))
                                                if len(bootFields) > 0 {
                                                        uptime, _ := strconv.ParseFloat(bootFields[0], 64)
                                                        clkTck := int64(100) // sysconf(_SC_CLK_TCK)
                                                        startSecs := ticks / clkTck
                                                        procUptime := int64(uptime) - startSecs
                                                        if procUptime > 0 {
                                                                days := procUptime / 86400
                                                                hours := (procUptime % 86400) / 3600
                                                                mins := (procUptime % 3600) / 60
                                                                if days > 0 {
                                                                        status.Uptime = fmt.Sprintf("%d days %d hours", days, hours)
                                                                } else if hours > 0 {
                                                                        status.Uptime = fmt.Sprintf("%d hours %d minutes", hours, mins)
                                                                } else {
                                                                        status.Uptime = fmt.Sprintf("%d minutes", mins)
                                                                }
                                                        }
                                                }
                                        }
                                }
                        }
                }
        }

        // Get nginx version
        verOut, _ := exec.Command("nginx", "-v").CombinedOutput()
        verStr := strings.TrimSpace(string(verOut))
        if strings.Contains(verStr, "nginx/") {
                parts := strings.SplitN(verStr, "nginx/", 2)
                if len(parts) > 1 {
                        status.Version = "nginx/" + strings.Fields(parts[1])[0]
                }
        } else if verStr != "" {
                status.Version = verStr
        }

        // Test config
        testOut, testErr := exec.Command("nginx", "-t").CombinedOutput()
        status.ConfigTest = strings.TrimSpace(string(testOut))
        status.ConfigOK = testErr == nil

        return status
}

func getNginxPerformance() nginxPerformance {
        perf := nginxPerformance{}

        // Try nginx stub_status module (usually at /nginx_status)
        statusURLs := []string{
                "http://127.0.0.1:80/nginx_status",
                "http://127.0.0.1:8080/nginx_status",
                "http://localhost/nginx_status",
        }

        for _, url := range statusURLs {
                client := &http.Client{Timeout: 2 * time.Second}
                resp, err := client.Get(url)
                if err != nil {
                        continue
                }
                defer resp.Body.Close()

                scanner := bufio.NewScanner(resp.Body)
                for scanner.Scan() {
                        line := scanner.Text()
                        if strings.HasPrefix(line, "Active connections:") {
                                fmt.Sscanf(line, "Active connections: %d", &perf.ActiveConns)
                        } else if strings.Contains(line, "Reading:") {
                                fmt.Sscanf(line, " Reading: %d Writing: %d Waiting: %d",
                                        &perf.Reading, &perf.Writing, &perf.Waiting)
                        } else if perf.Accepts == 0 {
                                var accepts, handled, requests int
                                if n, _ := fmt.Sscanf(line, " %d %d %d", &accepts, &handled, &requests); n == 3 {
                                        perf.Accepts = accepts
                                        perf.Handled = handled
                                        perf.Requests = requests
                                }
                        }
                }
                break
        }

        return perf
}

func getNginxGlobalConfig() nginxGlobalConfig {
        cfg := nginxGlobalConfig{
                WorkerProcesses:   "auto",
                WorkerConnections: "1024",
                KeepaliveTimeout:  "65",
                ClientMaxBodySize: "1m",
        }

        data, err := os.ReadFile("/etc/nginx/nginx.conf")
        if err != nil {
                return cfg
        }

        raw := string(data)
        cfg.Raw = raw

        if m := regexp.MustCompile(`(?m)worker_processes\s+([^;]+);`).FindStringSubmatch(raw); len(m) > 1 {
                cfg.WorkerProcesses = strings.TrimSpace(m[1])
        }
        if m := regexp.MustCompile(`(?m)worker_connections\s+([^;]+);`).FindStringSubmatch(raw); len(m) > 1 {
                cfg.WorkerConnections = strings.TrimSpace(m[1])
        }
        if m := regexp.MustCompile(`(?m)keepalive_timeout\s+([^;]+);`).FindStringSubmatch(raw); len(m) > 1 {
                cfg.KeepaliveTimeout = strings.TrimSpace(m[1])
        }
        if m := regexp.MustCompile(`(?m)client_max_body_size\s+([^;]+);`).FindStringSubmatch(raw); len(m) > 1 {
                cfg.ClientMaxBodySize = strings.TrimSpace(m[1])
        }
        cfg.ServerTokens = strings.Contains(raw, "server_tokens off")
        cfg.TcpNopush = strings.Contains(raw, "tcp_nopush on")
        cfg.Gzip = regexp.MustCompile(`(?m)^\s*gzip\s+on`).MatchString(raw)

        return cfg
}

// parseAccessLog reads up to maxLines from a nginx combined access log.
func parseAccessLog(logPath string, maxLines int) []accessLogLine {
        var lines []accessLogLine
        f, err := os.Open(logPath)
        if err != nil {
                return lines
        }
        defer f.Close()

        // Seek to end and read last maxLines lines
        scanner := bufio.NewScanner(f)
        var rawLines []string
        for scanner.Scan() {
                rawLines = append(rawLines, scanner.Text())
        }

        start := 0
        if len(rawLines) > maxLines {
                start = len(rawLines) - maxLines
        }

        // Nginx combined log format:
        // $remote_addr - $remote_user [$time_local] "$request" $status $bytes "$http_referer" "$http_user_agent"
        reLog := regexp.MustCompile(`^(\S+) \S+ \S+ \[([^\]]+)\] "(\S+) ([^"]+) \S+" (\d+) (\d+) "[^"]*" "([^"]*)"`)

        for i, raw := range rawLines[start:] {
                m := reLog.FindStringSubmatch(raw)
                if m == nil {
                        continue
                }
                status, _ := strconv.Atoi(m[5])
                bytes, _ := strconv.Atoi(m[6])
                lines = append(lines, accessLogLine{
                        ID:     fmt.Sprintf("l%d", i+1),
                        TS:     m[2],
                        IP:     m[1],
                        Method: m[3],
                        Path:   strings.TrimSpace(m[4]),
                        Status: status,
                        Bytes:  bytes,
                        UA:     m[7],
                })
        }
        return lines
}

// ── Handlers ─────────────────────────────────────────────────────────────────

func (s *Server) handleWebServerSites(w http.ResponseWriter, r *http.Request) {
        sites := listNginxSites()
        if sites == nil {
                sites = []nginxSite{}
        }
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(sites) //nolint:errcheck
}

func (s *Server) handleWebServerStatus(w http.ResponseWriter, r *http.Request) {
        status := getNginxStatus()
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(status) //nolint:errcheck
}

func (s *Server) handleWebServerPerformance(w http.ResponseWriter, r *http.Request) {
        perf := getNginxPerformance()
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(perf) //nolint:errcheck
}

func (s *Server) handleWebServerGlobalGet(w http.ResponseWriter, r *http.Request) {
        cfg := getNginxGlobalConfig()
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(cfg) //nolint:errcheck
}

func (s *Server) handleWebServerGlobalPut(w http.ResponseWriter, r *http.Request) {
        var req struct {
                Raw string `json:"raw"`
        }
        if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
                http.Error(w, "bad request", http.StatusBadRequest)
                return
        }
        if req.Raw == "" {
                http.Error(w, "raw config is required", http.StatusBadRequest)
                return
        }

        // Write to a temp file first, then test
        tmpPath := "/tmp/nginx.conf.test"
        if err := os.WriteFile(tmpPath, []byte(req.Raw), 0o644); err != nil {
                http.Error(w, "failed to write temp config: "+err.Error(), http.StatusInternalServerError)
                return
        }

        out, err := exec.Command("nginx", "-t", "-c", tmpPath).CombinedOutput()
        if err != nil {
                w.Header().Set("Content-Type", "application/json")
                json.NewEncoder(w).Encode(map[string]interface{}{ //nolint:errcheck
                        "ok": false, "output": string(out), "error": err.Error(),
                })
                return
        }

        if err := os.WriteFile("/etc/nginx/nginx.conf", []byte(req.Raw), 0o644); err != nil {
                http.Error(w, "failed to write config: "+err.Error(), http.StatusInternalServerError)
                return
        }

        // Reload nginx
        reloadOut, _ := exec.Command("nginx", "-s", "reload").CombinedOutput()
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]interface{}{ //nolint:errcheck
                "ok": true, "output": string(reloadOut),
        })
}

func (s *Server) handleWebServerReload(w http.ResponseWriter, r *http.Request) {
        out, err := exec.Command("nginx", "-s", "reload").CombinedOutput()
        ok := err == nil
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]interface{}{ //nolint:errcheck
                "ok": ok, "output": strings.TrimSpace(string(out)),
        })
}

func (s *Server) handleWebServerTest(w http.ResponseWriter, r *http.Request) {
        out, err := exec.Command("nginx", "-t").CombinedOutput()
        ok := err == nil
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]interface{}{ //nolint:errcheck
                "ok": ok, "output": strings.TrimSpace(string(out)),
        })
}

func (s *Server) handleWebServerStart(w http.ResponseWriter, r *http.Request) {
        out, err := exec.Command("systemctl", "start", "nginx").CombinedOutput()
        if err != nil {
                // fallback
                out2, err2 := exec.Command("nginx").CombinedOutput()
                if err2 == nil {
                        w.Header().Set("Content-Type", "application/json")
                        json.NewEncoder(w).Encode(map[string]interface{}{"ok": true, "output": string(out2)}) //nolint:errcheck
                        return
                }
        }
        ok := err == nil
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]interface{}{"ok": ok, "output": strings.TrimSpace(string(out))}) //nolint:errcheck
}

func (s *Server) handleWebServerStop(w http.ResponseWriter, r *http.Request) {
        out, err := exec.Command("nginx", "-s", "stop").CombinedOutput()
        ok := err == nil
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]interface{}{"ok": ok, "output": strings.TrimSpace(string(out))}) //nolint:errcheck
}

func (s *Server) handleWebServerRestart(w http.ResponseWriter, r *http.Request) {
        // Try systemctl first, then manual stop+start
        out, err := exec.Command("systemctl", "restart", "nginx").CombinedOutput()
        if err != nil {
                exec.Command("nginx", "-s", "stop").Run() //nolint:errcheck
                time.Sleep(500 * time.Millisecond)
                out2, err2 := exec.Command("nginx").CombinedOutput()
                ok := err2 == nil
                w.Header().Set("Content-Type", "application/json")
                json.NewEncoder(w).Encode(map[string]interface{}{"ok": ok, "output": string(out2)}) //nolint:errcheck
                return
        }
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]interface{}{"ok": true, "output": strings.TrimSpace(string(out))}) //nolint:errcheck
}

func (s *Server) handleWebServerUpdateSite(w http.ResponseWriter, r *http.Request) {
        name := r.PathValue("name")
        if strings.Contains(name, "..") || strings.Contains(name, "/") {
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

        path := filepath.Join("/etc/nginx/sites-available", name)
        if err := os.WriteFile(path, []byte(req.Config), 0o644); err != nil {
                http.Error(w, "failed to write site config: "+err.Error(), http.StatusInternalServerError)
                return
        }
        w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleWebServerCreateSite(w http.ResponseWriter, r *http.Request) {
        var req struct {
                Name        string `json:"name"`
                Domain      string `json:"domain"`
                Aliases     string `json:"aliases"`
                DocRoot     string `json:"doc_root"`
                PHP         bool   `json:"php"`
                PHPVersion  string `json:"php_version"`
                SSL         string `json:"ssl"`
                HSTS        bool   `json:"hsts"`
                HTTPRedirect bool  `json:"http_redirect"`
                Gzip        bool   `json:"gzip"`
                Proxy       string `json:"proxy"`
                RateLimit   bool   `json:"rate_limit"`
                RateLimitRate string `json:"rate_limit_rate"`
                SecHeaders  bool   `json:"sec_headers"`
                Config      string `json:"config"`
        }
        if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
                http.Error(w, "bad request", http.StatusBadRequest)
                return
        }
        if req.Domain == "" {
                http.Error(w, "domain is required", http.StatusBadRequest)
                return
        }

        name := req.Name
        if name == "" {
                name = req.Domain
        }
        if strings.Contains(name, "..") || strings.Contains(name, "/") {
                http.Error(w, "invalid name", http.StatusBadRequest)
                return
        }

        configContent := req.Config
        if configContent == "" {
                configContent = generateNginxConfig(req.Domain, req.Aliases, req.DocRoot, req.PHP,
                        req.PHPVersion, req.SSL, req.HSTS, req.HTTPRedirect, req.Gzip, req.Proxy,
                        req.RateLimit, req.RateLimitRate, req.SecHeaders)
        }

        availPath := filepath.Join("/etc/nginx/sites-available", name)
        if _, err := os.Stat(availPath); err == nil {
                http.Error(w, "site already exists", http.StatusConflict)
                return
        }

        if req.DocRoot != "" {
                os.MkdirAll(req.DocRoot, 0o755) //nolint:errcheck
        }

        if err := os.WriteFile(availPath, []byte(configContent), 0o644); err != nil {
                http.Error(w, "failed to create site config: "+err.Error(), http.StatusInternalServerError)
                return
        }

        w.Header().Set("Content-Type", "application/json")
        w.WriteHeader(http.StatusCreated)
        site := parseNginxSite(name, availPath, false)
        json.NewEncoder(w).Encode(site) //nolint:errcheck
}

func (s *Server) handleWebServerDeleteSite(w http.ResponseWriter, r *http.Request) {
        name := r.PathValue("name")
        if strings.Contains(name, "..") || strings.Contains(name, "/") {
                http.Error(w, "invalid name", http.StatusBadRequest)
                return
        }

        availPath := filepath.Join("/etc/nginx/sites-available", name)
        enabledPath := filepath.Join("/etc/nginx/sites-enabled", name)

        os.Remove(enabledPath) //nolint:errcheck
        if err := os.Remove(availPath); err != nil && !os.IsNotExist(err) {
                http.Error(w, "failed to delete site: "+err.Error(), http.StatusInternalServerError)
                return
        }

        exec.Command("nginx", "-s", "reload").Run() //nolint:errcheck
        w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleWebServerToggleSite(w http.ResponseWriter, r *http.Request) {
        name := r.PathValue("name")
        if strings.Contains(name, "..") || strings.Contains(name, "/") {
                http.Error(w, "invalid name", http.StatusBadRequest)
                return
        }

        availPath := filepath.Join("/etc/nginx/sites-available", name)
        enabledPath := filepath.Join("/etc/nginx/sites-enabled", name)

        if _, err := os.Lstat(enabledPath); err == nil {
                // Currently enabled → disable
                os.Remove(enabledPath) //nolint:errcheck
        } else {
                // Currently disabled → enable
                if _, err := os.Stat(availPath); os.IsNotExist(err) {
                        http.Error(w, "site config not found", http.StatusNotFound)
                        return
                }
                if err := os.Symlink(availPath, enabledPath); err != nil {
                        // Fallback: copy instead of symlink
                        data, _ := os.ReadFile(availPath)
                        if err := os.WriteFile(enabledPath, data, 0o644); err != nil {
                                http.Error(w, "failed to enable site: "+err.Error(), http.StatusInternalServerError)
                                return
                        }
                }
        }

        exec.Command("nginx", "-s", "reload").Run() //nolint:errcheck

        site := parseNginxSite(name, availPath, true)
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(site) //nolint:errcheck
}

func (s *Server) handleWebServerLogs(w http.ResponseWriter, r *http.Request) {
        site := r.URL.Query().Get("site")
        limit := 200
        if l := r.URL.Query().Get("limit"); l != "" {
                if n, err := strconv.Atoi(l); err == nil && n > 0 {
                        limit = n
                }
        }

        logPath := "/var/log/nginx/access.log"
        if site != "" {
                candidatePath := "/var/log/nginx/" + site + "-access.log"
                if _, err := os.Stat(candidatePath); err == nil {
                        logPath = candidatePath
                }
        }

        lines := parseAccessLog(logPath, limit)
        if lines == nil {
                lines = []accessLogLine{}
        }
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(lines) //nolint:errcheck
}

// generateNginxConfig produces a basic nginx server block from parameters.
func generateNginxConfig(domain, aliases, docRoot string, php bool, phpVersion, ssl string, hsts, httpRedirect, gzip bool, proxy string, rateLimit bool, rateLimitRate string, secHeaders bool) string {
        if docRoot == "" {
                docRoot = "/var/www/" + domain + "/html"
        }

        serverNames := domain
        if aliases != "" {
                serverNames += " " + strings.ReplaceAll(aliases, ",", " ")
        }

        var b strings.Builder

        if httpRedirect && ssl != "none" {
                fmt.Fprintf(&b, "server {\n    listen 80;\n    server_name %s;\n    return 301 https://$host$request_uri;\n}\n\n", serverNames)
        }

        listenLine := "80"
        if ssl != "none" {
                listenLine = "443 ssl http2"
        }

        fmt.Fprintf(&b, "server {\n")
        fmt.Fprintf(&b, "    listen %s;\n", listenLine)
        if !httpRedirect || ssl == "none" {
                fmt.Fprintf(&b, "    listen 80;\n")
        }
        fmt.Fprintf(&b, "    server_name %s;\n", serverNames)
        fmt.Fprintf(&b, "    root %s;\n", docRoot)
        fmt.Fprintf(&b, "    index index.html index.htm index.php;\n")

        if ssl == "letsencrypt" {
                fmt.Fprintf(&b, "\n    ssl_certificate /etc/letsencrypt/live/%s/fullchain.pem;\n", domain)
                fmt.Fprintf(&b, "    ssl_certificate_key /etc/letsencrypt/live/%s/privkey.pem;\n", domain)
                fmt.Fprintf(&b, "    ssl_protocols TLSv1.2 TLSv1.3;\n")
                fmt.Fprintf(&b, "    ssl_ciphers HIGH:!aNULL:!MD5;\n")
        }

        if hsts && ssl != "none" {
                fmt.Fprintf(&b, "\n    add_header Strict-Transport-Security \"max-age=31536000; includeSubDomains\" always;\n")
        }

        if secHeaders {
                fmt.Fprintf(&b, "    add_header X-Frame-Options SAMEORIGIN always;\n")
                fmt.Fprintf(&b, "    add_header X-Content-Type-Options nosniff always;\n")
                fmt.Fprintf(&b, "    add_header X-XSS-Protection \"1; mode=block\" always;\n")
                fmt.Fprintf(&b, "    add_header Referrer-Policy strict-origin-when-cross-origin always;\n")
        }

        if gzip {
                fmt.Fprintf(&b, "\n    gzip on;\n")
                fmt.Fprintf(&b, "    gzip_types text/plain text/css application/javascript application/json image/svg+xml;\n")
        }

        if rateLimit && rateLimitRate != "" {
                fmt.Fprintf(&b, "\n    limit_req_zone $binary_remote_addr zone=%s:10m rate=%s;\n", domain, rateLimitRate)
                fmt.Fprintf(&b, "    limit_req zone=%s burst=20 nodelay;\n", domain)
        }

        fmt.Fprintf(&b, "\n    access_log /var/log/nginx/%s-access.log;\n", domain)
        fmt.Fprintf(&b, "    error_log /var/log/nginx/%s-error.log;\n", domain)

        if proxy != "" {
                fmt.Fprintf(&b, "\n    location / {\n")
                fmt.Fprintf(&b, "        proxy_pass %s;\n", proxy)
                fmt.Fprintf(&b, "        proxy_set_header Host $host;\n")
                fmt.Fprintf(&b, "        proxy_set_header X-Real-IP $remote_addr;\n")
                fmt.Fprintf(&b, "        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n")
                fmt.Fprintf(&b, "        proxy_set_header X-Forwarded-Proto $scheme;\n")
                fmt.Fprintf(&b, "    }\n")
        } else if phpVersion != "" && phpVersion != "none" {
                fmt.Fprintf(&b, "\n    location / {\n")
                fmt.Fprintf(&b, "        try_files $uri $uri/ /index.php?$args;\n")
                fmt.Fprintf(&b, "    }\n")
                fmt.Fprintf(&b, "\n    location ~ \\.php$ {\n")
                fmt.Fprintf(&b, "        fastcgi_pass unix:/run/php/php%s-fpm.sock;\n", phpVersion)
                fmt.Fprintf(&b, "        fastcgi_index index.php;\n")
                fmt.Fprintf(&b, "        include fastcgi_params;\n")
                fmt.Fprintf(&b, "        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;\n")
                fmt.Fprintf(&b, "    }\n")
        } else {
                fmt.Fprintf(&b, "\n    location / {\n")
                fmt.Fprintf(&b, "        try_files $uri $uri/ =404;\n")
                fmt.Fprintf(&b, "    }\n")
        }

        fmt.Fprintf(&b, "}\n")
        return b.String()
}
