package api

import (
        "bufio"
        "bytes"
        "encoding/json"
        "fmt"
        "io"
        "net/http"
        "os"
        "os/exec"
        "regexp"
        "strconv"
        "strings"
        "time"
)

// ── Types ─────────────────────────────────────────────────────────────────────

type csStatus struct {
        Installed     bool   `json:"installed"`
        Running       bool   `json:"running"`
        Version       string `json:"version"`
        APIRunning    bool   `json:"api_running"`
        APIUrl        string `json:"api_url"`
        APIKey        string `json:"api_key"`
        TotalAlerts   int    `json:"total_alerts"`
        TotalDecisions int   `json:"total_decisions"`
        HubStatus     string `json:"hub_status"`
        LogFile       string `json:"log_file"`
        DBPath        string `json:"db_path"`
        ConfigPath    string `json:"config_path"`
}

type csAlert struct {
        ID          int64  `json:"id"`
        Scenario    string `json:"scenario"`
        Source      csSource `json:"source"`
        StartAt     string `json:"start_at"`
        StopAt      string `json:"stop_at"`
        Capacity    int32  `json:"capacity"`
        Leakspeed   string `json:"leakspeed"`
        Simulated   bool   `json:"simulated"`
        EventsCount int32  `json:"events_count"`
        Message     string `json:"message"`
}

type csSource struct {
        IP        string  `json:"ip"`
        Range     string  `json:"range"`
        AS        string  `json:"as_name"`
        CN        string  `json:"cn"`
        Latitude  float64 `json:"latitude"`
        Longitude float64 `json:"longitude"`
}

type csDecision struct {
        ID        int64  `json:"id"`
        Origin    string `json:"origin"`
        Type      string `json:"type"`
        Scope     string `json:"scope"`
        Value     string `json:"value"`
        Duration  string `json:"duration"`
        Scenario  string `json:"scenario"`
        Simulated bool   `json:"simulated"`
}

type csBouncer struct {
        Name        string `json:"name"`
        APIKey      string `json:"api_key"`
        Revoked     bool   `json:"revoked"`
        IPAddress   string `json:"ip_address"`
        Type        string `json:"type"`
        Version     string `json:"version"`
        LastPull    string `json:"last_pull"`
        AuthType    string `json:"auth_type"`
        CreatedAt   string `json:"created_at"`
        UpdatedAt   string `json:"updated_at"`
}

type csHubItem struct {
        Name        string `json:"name"`
        Author      string `json:"author"`
        Version     string `json:"version"`
        Status      string `json:"status"`
        Description string `json:"description"`
        Type        string `json:"type"`
}

type csMetrics struct {
        ActiveDecisions  int64 `json:"active_decisions"`
        Alerts24h        int64 `json:"alerts_24h"`
        OriginCrowdsec   int64 `json:"origin_crowdsec"`
        OriginCapi       int64 `json:"origin_capi"`
        OriginList       int64 `json:"origin_list"`
}

// ── Helpers ───────────────────────────────────────────────────────────────────

func csInstalled() bool {
        _, err := exec.LookPath("cscli")
        return err == nil
}

func csRunning() bool {
        out, err := exec.Command("systemctl", "is-active", "crowdsec").Output()
        return err == nil && strings.TrimSpace(string(out)) == "active"
}

func csVersion() string {
        out, err := exec.Command("cscli", "version").Output()
        if err != nil {
                return ""
        }
        lines := strings.Split(string(out), "\n")
        if len(lines) > 0 {
                return strings.TrimSpace(lines[0])
        }
        return ""
}

func csGetAPIConfig() (url, key string) {
        // Read from LAPI config
        cfgPaths := []string{
                "/etc/crowdsec/config.yaml",
                "/etc/crowdsec/local_api_credentials.yaml",
        }
        for _, p := range cfgPaths {
                raw, err := os.ReadFile(p)
                if err != nil {
                        continue
                }
                text := string(raw)
                urlRe := regexp.MustCompile(`(?m)^\s*url:\s*(.+)$`)
                keyRe := regexp.MustCompile(`(?m)^\s*(?:api_key|password):\s*(.+)$`)
                if m := urlRe.FindStringSubmatch(text); m != nil {
                        url = strings.TrimSpace(m[1])
                }
                if m := keyRe.FindStringSubmatch(text); m != nil {
                        key = strings.TrimSpace(m[1])
                }
                if url != "" {
                        break
                }
        }
        if url == "" {
                url = "http://localhost:8080"
        }
        return url, key
}

func csAPIRequest(method, path string, body interface{}) (*http.Response, error) {
        apiURL, apiKey := csGetAPIConfig()
        // Validate URL scheme to prevent uncontrolled network requests
        if !strings.HasPrefix(apiURL, "http://") && !strings.HasPrefix(apiURL, "https://") {
                return nil, fmt.Errorf("crowdsec API URL must start with http:// or https://")
        }
        var bodyReader io.Reader
        if body != nil {
                b, _ := json.Marshal(body)
                bodyReader = bytes.NewReader(b)
        }
        req, err := http.NewRequest(method, apiURL+path, bodyReader)
        if err != nil {
                return nil, err
        }
        if apiKey != "" {
                req.Header.Set("X-Api-Key", apiKey)
        }
        req.Header.Set("Content-Type", "application/json")
        client := &http.Client{Timeout: 5 * time.Second}
        return client.Do(req)
}

func cscliJSON(args ...string) ([]byte, error) {
        args = append(args, "-o", "json")
        out, err := exec.Command("cscli", args...).Output()
        return out, err
}

// ── Handlers ──────────────────────────────────────────────────────────────────

func (s *Server) handleCrowdSecStatus(w http.ResponseWriter, r *http.Request) {
        status := csStatus{
                APIUrl:     "http://localhost:8080",
                LogFile:    "/var/log/crowdsec.log",
                DBPath:     "/var/lib/crowdsec/data/crowdsec.db",
                ConfigPath: "/etc/crowdsec",
        }
        status.Installed = csInstalled()
        if !status.Installed {
                w.Header().Set("Content-Type", "application/json")
                json.NewEncoder(w).Encode(status) //nolint:errcheck
                return
        }
        status.Running = csRunning()
        status.Version = csVersion()
        apiURL, _ := csGetAPIConfig()
        status.APIUrl = apiURL

        // Check if LAPI is responding
        if resp, err := csAPIRequest("GET", "/v1/alerts?limit=0", nil); err == nil {
                resp.Body.Close()
                status.APIRunning = resp.StatusCode < 500
        }

        // Get decision count from LAPI
        if resp, err := csAPIRequest("GET", "/v1/decisions", nil); err == nil {
                defer resp.Body.Close()
                var decisions []csDecision
                if json.NewDecoder(resp.Body).Decode(&decisions) == nil {
                        status.TotalDecisions = len(decisions)
                }
        }

        // Get hub status summary
        if out, err := exec.Command("cscli", "hub", "list", "--all", "-o", "json").Output(); err == nil {
                var items []csHubItem
                if json.Unmarshal(out, &items) == nil {
                        status.HubStatus = fmt.Sprintf("%d items installed", len(items))
                }
        }

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(status) //nolint:errcheck
}

func (s *Server) handleCrowdSecAlerts(w http.ResponseWriter, r *http.Request) {
        limitStr := r.URL.Query().Get("limit")
        limit := 50
        if n, err := strconv.Atoi(limitStr); err == nil && n > 0 {
                limit = n
        }

        resp, err := csAPIRequest("GET", fmt.Sprintf("/v1/alerts?limit=%d", limit), nil)
        if err != nil {
                // Fallback: try cscli
                out, cliErr := cscliJSON("alerts", "list")
                if cliErr != nil {
                        w.Header().Set("Content-Type", "application/json")
                        json.NewEncoder(w).Encode([]csAlert{}) //nolint:errcheck
                        return
                }
                w.Header().Set("Content-Type", "application/json")
                w.Write(out) //nolint:errcheck
                return
        }
        defer resp.Body.Close()
        body, _ := io.ReadAll(resp.Body)
        w.Header().Set("Content-Type", "application/json")
        w.Write(body) //nolint:errcheck
}

func (s *Server) handleCrowdSecDecisions(w http.ResponseWriter, r *http.Request) {
        ipFilter   := r.URL.Query().Get("ip")
        typeFilter := r.URL.Query().Get("type")
        scope      := r.URL.Query().Get("scope")

        path := "/v1/decisions?"
        if ipFilter != ""   { path += "ip=" + ipFilter + "&" }
        if typeFilter != "" { path += "type=" + typeFilter + "&" }
        if scope != ""      { path += "scope=" + scope + "&" }

        resp, err := csAPIRequest("GET", path, nil)
        if err != nil {
                // Fallback to cscli
                out, cliErr := cscliJSON("decisions", "list")
                if cliErr != nil {
                        w.Header().Set("Content-Type", "application/json")
                        json.NewEncoder(w).Encode([]csDecision{}) //nolint:errcheck
                        return
                }
                w.Header().Set("Content-Type", "application/json")
                w.Write(out) //nolint:errcheck
                return
        }
        defer resp.Body.Close()
        body, _ := io.ReadAll(resp.Body)

        // null response means no decisions
        if strings.TrimSpace(string(body)) == "null" {
                body = []byte("[]")
        }
        w.Header().Set("Content-Type", "application/json")
        w.Write(body) //nolint:errcheck
}

func (s *Server) handleCrowdSecAddDecision(w http.ResponseWriter, r *http.Request) {
        var req struct {
                IP       string `json:"ip"`
                Duration string `json:"duration"`
                Reason   string `json:"reason"`
                Type     string `json:"type"`
                Scope    string `json:"scope"`
        }
        if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.IP == "" {
                http.Error(w, "ip is required", http.StatusBadRequest)
                return
        }
        if req.Duration == "" { req.Duration = "4h" }
        if req.Type == ""     { req.Type = "ban" }
        if req.Scope == ""    { req.Scope = "Ip" }
        if req.Reason == ""   { req.Reason = "Manual ban via Orbit VPS" }

        // Try cscli first (more reliable)
        out, err := exec.Command("cscli", "decisions", "add",
                "--ip", req.IP,
                "--duration", req.Duration,
                "--reason", req.Reason,
                "--type", req.Type,
        ).CombinedOutput()
        if err != nil {
                // Try LAPI
                payload := []map[string]interface{}{{
                        "value":    req.IP,
                        "duration": req.Duration,
                        "reason":   req.Reason,
                        "type":     req.Type,
                        "scope":    req.Scope,
                        "origin":   "manual",
                }}
                resp, apiErr := csAPIRequest("POST", "/v1/decisions", payload)
                if apiErr != nil {
                        http.Error(w, "failed: "+string(out), http.StatusInternalServerError)
                        return
                }
                defer resp.Body.Close()
                body, _ := io.ReadAll(resp.Body)
                w.Header().Set("Content-Type", "application/json")
                w.Write(body) //nolint:errcheck
                return
        }
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]interface{}{"ok": true, "output": string(out)}) //nolint:errcheck
}

func (s *Server) handleCrowdSecDeleteDecision(w http.ResponseWriter, r *http.Request) {
        id := r.PathValue("id")
        out, err := exec.Command("cscli", "decisions", "delete", "--id", id).CombinedOutput()
        if err != nil {
                // Try LAPI
                resp, apiErr := csAPIRequest("DELETE", "/v1/decisions/"+id, nil)
                if apiErr != nil || resp.StatusCode >= 400 {
                        if resp != nil { resp.Body.Close() }
                        http.Error(w, "delete failed: "+string(out), http.StatusInternalServerError)
                        return
                }
                resp.Body.Close()
        }
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]interface{}{"ok": true, "output": string(out)}) //nolint:errcheck
}

func (s *Server) handleCrowdSecDeleteDecisionByIP(w http.ResponseWriter, r *http.Request) {
        var req struct {
                IP    string `json:"ip"`
                Scope string `json:"scope"`
        }
        if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.IP == "" {
                http.Error(w, "ip is required", http.StatusBadRequest)
                return
        }
        out, err := exec.Command("cscli", "decisions", "delete", "--ip", req.IP).CombinedOutput()
        ok := err == nil
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]interface{}{"ok": ok, "output": string(out)}) //nolint:errcheck
}

func (s *Server) handleCrowdSecBouncers(w http.ResponseWriter, r *http.Request) {
        out, err := cscliJSON("bouncers", "list")
        if err != nil {
                // Try LAPI
                resp, apiErr := csAPIRequest("GET", "/v1/bouncers", nil)
                if apiErr != nil {
                        w.Header().Set("Content-Type", "application/json")
                        json.NewEncoder(w).Encode([]csBouncer{}) //nolint:errcheck
                        return
                }
                defer resp.Body.Close()
                body, _ := io.ReadAll(resp.Body)
                w.Header().Set("Content-Type", "application/json")
                w.Write(body) //nolint:errcheck
                return
        }
        w.Header().Set("Content-Type", "application/json")
        w.Write(out) //nolint:errcheck
}

func (s *Server) handleCrowdSecHub(w http.ResponseWriter, r *http.Request) {
        itemType := r.URL.Query().Get("type") // collections, parsers, scenarios, postoverflows
        if itemType == "" {
                itemType = "all"
        }
        var args []string
        switch itemType {
        case "collections":
                args = []string{"collections", "list"}
        case "parsers":
                args = []string{"parsers", "list"}
        case "scenarios":
                args = []string{"scenarios", "list"}
        case "postoverflows":
                args = []string{"postoverflows", "list"}
        default:
                args = []string{"hub", "list", "--all"}
        }
        out, err := cscliJSON(args...)
        if err != nil {
                w.Header().Set("Content-Type", "application/json")
                json.NewEncoder(w).Encode([]csHubItem{}) //nolint:errcheck
                return
        }
        w.Header().Set("Content-Type", "application/json")
        w.Write(out) //nolint:errcheck
}

func (s *Server) handleCrowdSecHubUpdate(w http.ResponseWriter, r *http.Request) {
        out, err := exec.Command("cscli", "hub", "update").CombinedOutput()
        ok := err == nil
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]interface{}{"ok": ok, "output": string(out)}) //nolint:errcheck
}

func (s *Server) handleCrowdSecHubUpgrade(w http.ResponseWriter, r *http.Request) {
        out, err := exec.Command("cscli", "hub", "upgrade").CombinedOutput()
        ok := err == nil
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]interface{}{"ok": ok, "output": string(out)}) //nolint:errcheck
}

func (s *Server) handleCrowdSecCollectionInstall(w http.ResponseWriter, r *http.Request) {
        var req struct {
                Name string `json:"name"`
        }
        if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Name == "" {
                http.Error(w, "name is required", http.StatusBadRequest)
                return
        }
        out, err := exec.Command("cscli", "collections", "install", req.Name).CombinedOutput()
        ok := err == nil
        if ok {
                exec.Command("systemctl", "reload", "crowdsec").Run() //nolint:errcheck
        }
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]interface{}{"ok": ok, "output": string(out)}) //nolint:errcheck
}

func (s *Server) handleCrowdSecCollectionRemove(w http.ResponseWriter, r *http.Request) {
        name := r.PathValue("name")
        out, err := exec.Command("cscli", "collections", "remove", name, "--purge").CombinedOutput()
        ok := err == nil
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]interface{}{"ok": ok, "output": string(out)}) //nolint:errcheck
}

func (s *Server) handleCrowdSecService(w http.ResponseWriter, r *http.Request) {
        action := r.PathValue("action")
        var cmd *exec.Cmd
        switch action {
        case "start":
                cmd = exec.Command("systemctl", "start", "crowdsec")
        case "stop":
                cmd = exec.Command("systemctl", "stop", "crowdsec")
        case "restart":
                cmd = exec.Command("systemctl", "restart", "crowdsec")
        case "reload":
                cmd = exec.Command("systemctl", "reload", "crowdsec")
        case "enable":
                cmd = exec.Command("systemctl", "enable", "crowdsec")
        case "disable":
                cmd = exec.Command("systemctl", "disable", "crowdsec")
        default:
                http.Error(w, "unknown action", http.StatusBadRequest)
                return
        }
        out, err := cmd.CombinedOutput()
        ok := err == nil
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]interface{}{"ok": ok, "output": string(out), "action": action}) //nolint:errcheck
}

func (s *Server) handleCrowdSecLogs(w http.ResponseWriter, r *http.Request) {
        limitStr := r.URL.Query().Get("limit")
        limit := 200
        if n, err := strconv.Atoi(limitStr); err == nil && n > 0 && n <= 2000 {
                limit = n
        }

        logPaths := []string{
                "/var/log/crowdsec.log",
                "/var/log/crowdsec/crowdsec.log",
        }

        type csLogEntry struct {
                ID        string `json:"id"`
                Timestamp string `json:"timestamp"`
                Level     string `json:"level"`
                Component string `json:"component"`
                IP        string `json:"ip"`
                Scenario  string `json:"scenario"`
                Message   string `json:"message"`
                Action    string `json:"action"`
        }

        var entries []csLogEntry
        for _, logPath := range logPaths {
                f, err := os.Open(logPath)
                if err != nil {
                        continue
                }
                var lines []string
                scanner := bufio.NewScanner(f)
                for scanner.Scan() {
                        lines = append(lines, scanner.Text())
                }
                f.Close()
                if len(lines) > limit {
                        lines = lines[len(lines)-limit:]
                }

                ipRe       := regexp.MustCompile(`\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\b`)
                scenarioRe := regexp.MustCompile(`scenario=([\w/.-]+)`)

                for i, line := range lines {
                        // CrowdSec log format: time="2024-01-15T10:38:12Z" level=info msg="..." component=...
                        entry := csLogEntry{ID: strconv.Itoa(i)}

                        if m := regexp.MustCompile(`time="([^"]+)"`).FindStringSubmatch(line); m != nil {
                                entry.Timestamp = m[1]
                        }
                        if m := regexp.MustCompile(`level=(\w+)`).FindStringSubmatch(line); m != nil {
                                entry.Level = m[1]
                        }
                        if m := regexp.MustCompile(`msg="([^"]+)"`).FindStringSubmatch(line); m != nil {
                                entry.Message = m[1]
                        } else if m := regexp.MustCompile(`msg=(\S+)`).FindStringSubmatch(line); m != nil {
                                entry.Message = m[1]
                        }
                        if m := regexp.MustCompile(`component=(\S+)`).FindStringSubmatch(line); m != nil {
                                entry.Component = m[1]
                        }
                        if m := ipRe.FindStringSubmatch(entry.Message); m != nil {
                                entry.IP = m[1]
                        }
                        if m := scenarioRe.FindStringSubmatch(entry.Message); m != nil {
                                entry.Scenario = m[1]
                        }
                        // Detect action
                        msg := strings.ToLower(entry.Message)
                        switch {
                        case strings.Contains(msg, "ban"):
                                entry.Action = "ban"
                        case strings.Contains(msg, "decision"):
                                entry.Action = "decision"
                        case strings.Contains(msg, "alert"):
                                entry.Action = "alert"
                        }

                        if entry.Level == "" {
                                continue
                        }
                        entries = append(entries, entry)
                }
                if len(entries) > 0 {
                        break
                }
        }
        // Reverse for newest first
        for i, j := 0, len(entries)-1; i < j; i, j = i+1, j-1 {
                entries[i], entries[j] = entries[j], entries[i]
        }
        if entries == nil {
                entries = []csLogEntry{}
        }
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(entries) //nolint:errcheck
}

func (s *Server) handleCrowdSecMetrics(w http.ResponseWriter, r *http.Request) {
        metrics := csMetrics{}
        // Query LAPI for decision count
        if resp, err := csAPIRequest("GET", "/v1/decisions", nil); err == nil {
                defer resp.Body.Close()
                var decisions []csDecision
                if json.NewDecoder(resp.Body).Decode(&decisions) == nil {
                        metrics.ActiveDecisions = int64(len(decisions))
                        for _, d := range decisions {
                                switch d.Origin {
                                case "crowdsec":
                                        metrics.OriginCrowdsec++
                                case "CAPI":
                                        metrics.OriginCapi++
                                case "lists":
                                        metrics.OriginList++
                                }
                        }
                }
        }
        // Parse prometheus metrics if available
        if resp, err := http.Get("http://localhost:6060/metrics"); err == nil {
                defer resp.Body.Close()
                scanner := bufio.NewScanner(resp.Body)
                for scanner.Scan() {
                        line := scanner.Text()
                        if strings.HasPrefix(line, "cs_active_decisions") {
                                parts := strings.Fields(line)
                                if len(parts) >= 2 {
                                        if n, err := strconv.ParseInt(parts[1], 10, 64); err == nil {
                                                metrics.ActiveDecisions = n
                                        }
                                }
                        }
                }
        }
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(metrics) //nolint:errcheck
}

func (s *Server) handleCrowdSecInstall(w http.ResponseWriter, r *http.Request) {
        if csInstalled() {
                w.Header().Set("Content-Type", "application/json")
                json.NewEncoder(w).Encode(map[string]interface{}{"ok": true, "output": "CrowdSec is already installed"}) //nolint:errcheck
                return
        }

        installScript := `
set -e
# Add CrowdSec repository
curl -s https://packagecloud.io/install/repositories/crowdsec/crowdsec/script.deb.sh | bash
# Install CrowdSec and the iptables bouncer
DEBIAN_FRONTEND=noninteractive apt-get install -y crowdsec crowdsec-firewall-bouncer-iptables
# Install essential collections
cscli collections install crowdsecurity/linux
cscli collections install crowdsecurity/sshd
cscli collections install crowdsecurity/nginx
# Start and enable
systemctl enable --now crowdsec
# Register firewall bouncer
API_KEY=$(cscli bouncers add crowdsec-firewall-bouncer -o raw 2>/dev/null || echo "")
if [ -n "$API_KEY" ]; then
  sed -i "s/api_key: .*/api_key: $API_KEY/" /etc/crowdsec/bouncers/crowdsec-firewall-bouncer.yaml
  systemctl enable --now crowdsec-firewall-bouncer
fi
echo "CrowdSec installation complete"
`
        out, err := exec.Command("bash", "-c", installScript).CombinedOutput()
        ok := err == nil
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]interface{}{"ok": ok, "output": string(out)}) //nolint:errcheck
}

func (s *Server) handleCrowdSecConfig(w http.ResponseWriter, r *http.Request) {
        cfgPath := "/etc/crowdsec/config.yaml"
        raw, err := os.ReadFile(cfgPath)
        if err != nil {
                w.Header().Set("Content-Type", "application/json")
                json.NewEncoder(w).Encode(map[string]string{"raw": "", "path": cfgPath, "error": err.Error()}) //nolint:errcheck
                return
        }
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]string{"raw": string(raw), "path": cfgPath}) //nolint:errcheck
}

func (s *Server) handleCrowdSecConfigSave(w http.ResponseWriter, r *http.Request) {
        var req struct {
                Raw  string `json:"raw"`
                Path string `json:"path"`
        }
        if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
                http.Error(w, "bad request", http.StatusBadRequest)
                return
        }
        targetPath := "/etc/crowdsec/config.yaml"
        if req.Path != "" && strings.HasPrefix(req.Path, "/etc/crowdsec/") {
                targetPath = req.Path
        }
        if err := os.WriteFile(targetPath, []byte(req.Raw), 0o644); err != nil {
                http.Error(w, "write failed: "+err.Error(), http.StatusInternalServerError)
                return
        }
        out, _ := exec.Command("systemctl", "reload", "crowdsec").CombinedOutput()
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]interface{}{"ok": true, "output": string(out)}) //nolint:errcheck
}

func (s *Server) handleCrowdSecAcquis(w http.ResponseWriter, r *http.Request) {
        acquisPath := "/etc/crowdsec/acquis.yaml"
        raw, err := os.ReadFile(acquisPath)
        if err != nil {
                w.Header().Set("Content-Type", "application/json")
                json.NewEncoder(w).Encode(map[string]string{"raw": "", "path": acquisPath}) //nolint:errcheck
                return
        }
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]string{"raw": string(raw), "path": acquisPath}) //nolint:errcheck
}

func (s *Server) handleCrowdSecAcquisSave(w http.ResponseWriter, r *http.Request) {
        var req struct {
                Raw string `json:"raw"`
        }
        if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
                http.Error(w, "bad request", http.StatusBadRequest)
                return
        }
        acquisPath := "/etc/crowdsec/acquis.yaml"
        if err := os.WriteFile(acquisPath, []byte(req.Raw), 0o644); err != nil {
                http.Error(w, "write failed: "+err.Error(), http.StatusInternalServerError)
                return
        }
        out, _ := exec.Command("systemctl", "reload", "crowdsec").CombinedOutput()
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]interface{}{"ok": true, "output": string(out)}) //nolint:errcheck
}

func (s *Server) handleCrowdSecAllowlistAdd(w http.ResponseWriter, r *http.Request) {
        var req struct {
                IP      string `json:"ip"`
                Comment string `json:"comment"`
        }
        if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.IP == "" {
                http.Error(w, "ip is required", http.StatusBadRequest)
                return
        }
        comment := req.Comment
        if comment == "" {
                comment = "manual whitelist via Orbit VPS"
        }
        // Try with --comment flag (newer cscli versions)
        out, err := exec.Command("cscli", "allowlists", "add", "orbit-allowlist", req.IP, "--comment", comment).CombinedOutput()
        if err != nil {
                // Fallback: add decision to delete for this IP
                out, err = exec.Command("cscli", "decisions", "delete", "--ip", req.IP).CombinedOutput()
        }
        ok := err == nil
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]interface{}{"ok": ok, "output": string(out)}) //nolint:errcheck
}
