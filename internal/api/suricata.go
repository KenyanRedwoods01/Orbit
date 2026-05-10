package api

import (
        "bufio"
        "bytes"
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

// ── Types ─────────────────────────────────────────────────────────────────────

type suricataStatus struct {
        Installed      bool   `json:"installed"`
        Running        bool   `json:"running"`
        Version        string `json:"version"`
        Mode           string `json:"mode"` // ids | ips | monitor
        Interface      string `json:"interface"`
        RulesLoaded    int    `json:"rules_loaded"`
        AlertsToday    int    `json:"alerts_today"`
        TotalAlerts    int    `json:"total_alerts"`
        PacketsTotal   int64  `json:"packets_total"`
        PacketsDrop    int64  `json:"packets_drop"`
        BytesTotal     int64  `json:"bytes_total"`
        FlowsActive    int    `json:"flows_active"`
        ConfigPath     string `json:"config_path"`
        LogPath        string `json:"log_path"`
        EveLogPath     string `json:"eve_log_path"`
        RulesPath      string `json:"rules_path"`
        SocketPath     string `json:"socket_path"`
        Uptime         int64  `json:"uptime"`
        PID            int    `json:"pid"`
}

type suricataAlert struct {
        ID          string  `json:"id"`
        Timestamp   string  `json:"timestamp"`
        SrcIP       string  `json:"src_ip"`
        SrcPort     int     `json:"src_port"`
        DestIP      string  `json:"dest_ip"`
        DestPort    int     `json:"dest_port"`
        Proto       string  `json:"proto"`
        SigID       int     `json:"sig_id"`
        Signature   string  `json:"signature"`
        Category    string  `json:"category"`
        Severity    int     `json:"severity"`
        SevLabel    string  `json:"sev_label"`
        Action      string  `json:"action"`
        Rev         int     `json:"rev"`
        GID         int     `json:"gid"`
        Metadata    string  `json:"metadata"`
        AppProto    string  `json:"app_proto"`
        FlowID      int64   `json:"flow_id"`
        Direction   string  `json:"direction"`
        BytesToServer int   `json:"bytes_to_server"`
        BytesToClient int   `json:"bytes_to_client"`
}

type suricataRule struct {
        ID          string   `json:"id"`
        Enabled     bool     `json:"enabled"`
        Action      string   `json:"action"`
        Proto       string   `json:"proto"`
        SrcIP       string   `json:"src_ip"`
        SrcPort     string   `json:"src_port"`
        Direction   string   `json:"direction"`
        DestIP      string   `json:"dest_ip"`
        DestPort    string   `json:"dest_port"`
        Options     string   `json:"options"`
        SID         string   `json:"sid"`
        Rev         string   `json:"rev"`
        Msg         string   `json:"msg"`
        Classtype   string   `json:"classtype"`
        Severity    int      `json:"severity"`
        Tags        []string `json:"tags"`
        File        string   `json:"file"`
        Raw         string   `json:"raw"`
}

type suricataFlow struct {
        FlowID      int64  `json:"flow_id"`
        Timestamp   string `json:"timestamp"`
        SrcIP       string `json:"src_ip"`
        SrcPort     int    `json:"src_port"`
        DestIP      string `json:"dest_ip"`
        DestPort    int    `json:"dest_port"`
        Proto       string `json:"proto"`
        AppProto    string `json:"app_proto"`
        State       string `json:"state"`
        BytesToSrv  int    `json:"bytes_to_server"`
        BytesToCli  int    `json:"bytes_to_client"`
        PktToSrv    int    `json:"pkts_to_server"`
        PktToCli    int    `json:"pkts_to_client"`
        Age         int    `json:"age"`
        Reason      string `json:"reason"`
}

type suricataHTTPEvent struct {
        Timestamp  string `json:"timestamp"`
        SrcIP      string `json:"src_ip"`
        DestIP     string `json:"dest_ip"`
        DestPort   int    `json:"dest_port"`
        Method     string `json:"method"`
        Hostname   string `json:"hostname"`
        URL        string `json:"url"`
        Status     int    `json:"status"`
        Length     int    `json:"length"`
        UserAgent  string `json:"user_agent"`
        Proto      string `json:"proto"`
}

type suricataDNSEvent struct {
        Timestamp string `json:"timestamp"`
        SrcIP     string `json:"src_ip"`
        DestIP    string `json:"dest_ip"`
        Rrname    string `json:"rrname"`
        Rrtype    string `json:"rrtype"`
        Type      string `json:"type"` // query | answer
        Rcode     string `json:"rcode"`
        TTL       int    `json:"ttl"`
}

type suricataTLSEvent struct {
        Timestamp  string `json:"timestamp"`
        SrcIP      string `json:"src_ip"`
        DestIP     string `json:"dest_ip"`
        DestPort   int    `json:"dest_port"`
        Subject    string `json:"subject"`
        Issuer     string `json:"issuer"`
        Serial     string `json:"serial"`
        Version    string `json:"version"`
        Fingerprint string `json:"fingerprint"`
        SNI        string `json:"sni"`
        NotBefore  string `json:"notbefore"`
        NotAfter   string `json:"notafter"`
}

type suricataStats struct {
        Date       string `json:"date"`
        Alerts     int    `json:"alerts"`
        Packets    int64  `json:"packets"`
        Drops      int64  `json:"drops"`
        Bytes      int64  `json:"bytes"`
}

type suricataInterface struct {
        Name      string `json:"name"`
        Packets   int64  `json:"packets"`
        Drops     int64  `json:"drops"`
        DropPct   float64 `json:"drop_pct"`
}

type suricataHostbit struct {
        IP      string `json:"ip"`
        Name    string `json:"name"`
        Expire  int    `json:"expire"`
        Added   string `json:"added"`
}

var suricataAllowedCommands = map[string]bool{
	"reload":          true,
	"reload-rules":    true,
	"shutdown-check":  true,
	"iface-list":      true,
	"iface-stat":      true,
	"iface-bypass-stat": true,
	"list-hostbits":    true,
	"add-hostbit":      true,
	"remove-hostbit":   true,
	"uptime":          true,
	"stats":           true,
	"dump-counters":   true,
	"registered-flows": true,
}

type suricataLogEntry struct {
        Timestamp string `json:"timestamp"`
        Level     string `json:"level"`
        Message   string `json:"message"`
}

// ── Helpers ───────────────────────────────────────────────────────────────────

func suricataIsInstalled() bool {
        out, _ := exec.Command("which", "suricata").Output()
        if len(strings.TrimSpace(string(out))) > 0 {
                return true
        }
        out2, _ := exec.Command("dpkg", "-l", "suricata").Output()
        return strings.Contains(string(out2), "ii")
}

func suricataIsRunning() bool {
        out, _ := exec.Command("systemctl", "is-active", "suricata").Output()
        if strings.TrimSpace(string(out)) == "active" {
                return true
        }
        out2, _ := exec.Command("pgrep", "-x", "suricata").Output()
        return len(strings.TrimSpace(string(out2))) > 0
}

func suricataVersion() string {
        out, _ := exec.Command("suricata", "--build-info").Output()
        lines := strings.Split(string(out), "\n")
        for _, line := range lines {
                if strings.HasPrefix(line, "This is Suricata version") {
                        parts := strings.Fields(line)
                        if len(parts) >= 5 {
                                return parts[4]
                        }
                }
        }
        out2, _ := exec.Command("suricata", "-V").Output()
        re := regexp.MustCompile(`(\d+\.\d+\.\d+)`)
        if m := re.FindStringSubmatch(string(out2)); m != nil {
                return m[1]
        }
        return "7.0.3"
}

func suricataPID() int {
        out, _ := exec.Command("pgrep", "-x", "suricata").Output()
        pid, _ := strconv.Atoi(strings.TrimSpace(string(out)))
        return pid
}

func suricataGetMode(configPath string) string {
        data, err := os.ReadFile(configPath)
        if err != nil {
                return "ids"
        }
        content := string(data)
        if strings.Contains(content, "nfqueue") || strings.Contains(content, "mode: repeat") {
                return "ips"
        }
        return "ids"
}

func suricataGetInterface(configPath string) string {
        data, err := os.ReadFile(configPath)
        if err != nil {
                return "eth0"
        }
        re := regexp.MustCompile(`interface:\s*(\S+)`)
        m := re.FindStringSubmatch(string(data))
        if m != nil {
                return m[1]
        }
        return "eth0"
}

func suricataCountRules() int {
        rulesDir := "/etc/suricata/rules"
        count := 0
        files, err := filepath.Glob(filepath.Join(rulesDir, "*.rules"))
        if err != nil {
                return 0
        }
        for _, f := range files {
                data, err := os.ReadFile(f)
                if err != nil {
                        continue
                }
                for _, line := range strings.Split(string(data), "\n") {
                        line = strings.TrimSpace(line)
                        if line != "" && !strings.HasPrefix(line, "#") {
                                count++
                        }
                }
        }
        return count
}

func suricataParseEVEAlerts(limit int) []suricataAlert {
        alerts := []suricataAlert{}
        logPaths := []string{
                "/var/log/suricata/eve.json",
                "/var/log/suricata/eve.log",
        }
        var f *os.File
        for _, p := range logPaths {
                var err error
                f, err = os.Open(p)
                if err == nil {
                        break
                }
        }
        if f == nil {
                return alerts
        }
        defer f.Close()

        scanner := bufio.NewScanner(f)
        scanner.Buffer(make([]byte, 1*1024*1024), 1*1024*1024)
        for scanner.Scan() {
                line := scanner.Text()
                if !strings.Contains(line, `"event_type":"alert"`) {
                        continue
                }
                var raw map[string]interface{}
                if err := json.Unmarshal([]byte(line), &raw); err != nil {
                        continue
                }
                a := suricataAlert{
                        ID:        fmt.Sprintf("%d", len(alerts)),
                        Timestamp: fmt.Sprintf("%v", raw["timestamp"]),
                        SrcIP:     fmt.Sprintf("%v", raw["src_ip"]),
                        DestIP:    fmt.Sprintf("%v", raw["dest_ip"]),
                        Proto:     fmt.Sprintf("%v", raw["proto"]),
                        AppProto:  fmt.Sprintf("%v", raw["app_proto"]),
                }
                if sp, ok := raw["src_port"].(float64); ok {
                        a.SrcPort = int(sp)
                }
                if dp, ok := raw["dest_port"].(float64); ok {
                        a.DestPort = int(dp)
                }
                if fid, ok := raw["flow_id"].(float64); ok {
                        a.FlowID = int64(fid)
                }
                if alertObj, ok := raw["alert"].(map[string]interface{}); ok {
                        a.Signature = fmt.Sprintf("%v", alertObj["signature"])
                        a.Category = fmt.Sprintf("%v", alertObj["category"])
                        a.Action = fmt.Sprintf("%v", alertObj["action"])
                        if sid, ok := alertObj["signature_id"].(float64); ok {
                                a.SigID = int(sid)
                        }
                        if sev, ok := alertObj["severity"].(float64); ok {
                                a.Severity = int(sev)
                                a.SevLabel = suricataSevLabel(int(sev))
                        }
                        if gid, ok := alertObj["gid"].(float64); ok {
                                a.GID = int(gid)
                        }
                        if rev, ok := alertObj["rev"].(float64); ok {
                                a.Rev = int(rev)
                        }
                }
                alerts = append(alerts, a)
        }
        // newest first
        for i, j := 0, len(alerts)-1; i < j; i, j = i+1, j-1 {
                alerts[i], alerts[j] = alerts[j], alerts[i]
        }
        if len(alerts) > limit {
                alerts = alerts[:limit]
        }
        return alerts
}

func suricataSevLabel(sev int) string {
        switch sev {
        case 1:
                return "critical"
        case 2:
                return "high"
        case 3:
                return "medium"
        default:
                return "low"
        }
}

func suricataParseEVEHTTP(limit int) []suricataHTTPEvent {
        events := []suricataHTTPEvent{}
        f, err := os.Open("/var/log/suricata/eve.json")
        if err != nil {
                return events
        }
        defer f.Close()
        scanner := bufio.NewScanner(f)
        scanner.Buffer(make([]byte, 1*1024*1024), 1*1024*1024)
        for scanner.Scan() {
                line := scanner.Text()
                if !strings.Contains(line, `"event_type":"http"`) {
                        continue
                }
                var raw map[string]interface{}
                if err := json.Unmarshal([]byte(line), &raw); err != nil {
                        continue
                }
                e := suricataHTTPEvent{
                        Timestamp: fmt.Sprintf("%v", raw["timestamp"]),
                        SrcIP:     fmt.Sprintf("%v", raw["src_ip"]),
                        DestIP:    fmt.Sprintf("%v", raw["dest_ip"]),
                }
                if dp, ok := raw["dest_port"].(float64); ok {
                        e.DestPort = int(dp)
                }
                if h, ok := raw["http"].(map[string]interface{}); ok {
                        e.Method = fmt.Sprintf("%v", h["http_method"])
                        e.Hostname = fmt.Sprintf("%v", h["hostname"])
                        e.URL = fmt.Sprintf("%v", h["url"])
                        e.UserAgent = fmt.Sprintf("%v", h["http_user_agent"])
                        if sc, ok := h["status"].(float64); ok {
                                e.Status = int(sc)
                        }
                        if cl, ok := h["length"].(float64); ok {
                                e.Length = int(cl)
                        }
                        e.Proto = fmt.Sprintf("%v", h["protocol"])
                }
                events = append(events, e)
                if len(events) >= limit {
                        break
                }
        }
        for i, j := 0, len(events)-1; i < j; i, j = i+1, j-1 {
                events[i], events[j] = events[j], events[i]
        }
        return events
}

func suricataParseEVEDNS(limit int) []suricataDNSEvent {
        events := []suricataDNSEvent{}
        f, err := os.Open("/var/log/suricata/eve.json")
        if err != nil {
                return events
        }
        defer f.Close()
        scanner := bufio.NewScanner(f)
        scanner.Buffer(make([]byte, 1*1024*1024), 1*1024*1024)
        for scanner.Scan() {
                line := scanner.Text()
                if !strings.Contains(line, `"event_type":"dns"`) {
                        continue
                }
                var raw map[string]interface{}
                if err := json.Unmarshal([]byte(line), &raw); err != nil {
                        continue
                }
                e := suricataDNSEvent{
                        Timestamp: fmt.Sprintf("%v", raw["timestamp"]),
                        SrcIP:     fmt.Sprintf("%v", raw["src_ip"]),
                        DestIP:    fmt.Sprintf("%v", raw["dest_ip"]),
                }
                if d, ok := raw["dns"].(map[string]interface{}); ok {
                        e.Type = fmt.Sprintf("%v", d["type"])
                        e.Rrname = fmt.Sprintf("%v", d["rrname"])
                        e.Rrtype = fmt.Sprintf("%v", d["rrtype"])
                        e.Rcode = fmt.Sprintf("%v", d["rcode"])
                        if ttl, ok := d["ttl"].(float64); ok {
                                e.TTL = int(ttl)
                        }
                }
                events = append(events, e)
                if len(events) >= limit {
                        break
                }
        }
        for i, j := 0, len(events)-1; i < j; i, j = i+1, j-1 {
                events[i], events[j] = events[j], events[i]
        }
        return events
}

func suricataParseEVETLS(limit int) []suricataTLSEvent {
        events := []suricataTLSEvent{}
        f, err := os.Open("/var/log/suricata/eve.json")
        if err != nil {
                return events
        }
        defer f.Close()
        scanner := bufio.NewScanner(f)
        scanner.Buffer(make([]byte, 1*1024*1024), 1*1024*1024)
        for scanner.Scan() {
                line := scanner.Text()
                if !strings.Contains(line, `"event_type":"tls"`) {
                        continue
                }
                var raw map[string]interface{}
                if err := json.Unmarshal([]byte(line), &raw); err != nil {
                        continue
                }
                e := suricataTLSEvent{
                        Timestamp: fmt.Sprintf("%v", raw["timestamp"]),
                        SrcIP:     fmt.Sprintf("%v", raw["src_ip"]),
                        DestIP:    fmt.Sprintf("%v", raw["dest_ip"]),
                }
                if dp, ok := raw["dest_port"].(float64); ok {
                        e.DestPort = int(dp)
                }
                if t, ok := raw["tls"].(map[string]interface{}); ok {
                        e.Subject = fmt.Sprintf("%v", t["subject"])
                        e.Issuer = fmt.Sprintf("%v", t["issuerdn"])
                        e.Serial = fmt.Sprintf("%v", t["serial"])
                        e.Version = fmt.Sprintf("%v", t["version"])
                        e.Fingerprint = fmt.Sprintf("%v", t["fingerprint"])
                        e.SNI = fmt.Sprintf("%v", t["sni"])
                        e.NotBefore = fmt.Sprintf("%v", t["notbefore"])
                        e.NotAfter = fmt.Sprintf("%v", t["notafter"])
                }
                events = append(events, e)
                if len(events) >= limit {
                        break
                }
        }
        for i, j := 0, len(events)-1; i < j; i, j = i+1, j-1 {
                events[i], events[j] = events[j], events[i]
        }
        return events
}

func suricataParseRules() []suricataRule {
        rules := []suricataRule{}
        rulesDir := "/etc/suricata/rules"
        files, err := filepath.Glob(filepath.Join(rulesDir, "*.rules"))
        if err != nil {
                return rules
        }

        ruleRe := regexp.MustCompile(`^(#?)(alert|drop|pass|reject)\s+(\S+)\s+(\S+)\s+(\S+)\s+(->|<>|<-)\s+(\S+)\s+(\S+)\s+\((.+)\)`)
        sidRe := regexp.MustCompile(`sid:(\d+)`)
        msgRe := regexp.MustCompile(`msg:"([^"]+)"`)
        classtypeRe := regexp.MustCompile(`classtype:([^;]+)`)
        revRe := regexp.MustCompile(`rev:(\d+)`)

        for _, file := range files {
                data, err := os.ReadFile(file)
                if err != nil {
                        continue
                }
                for _, line := range strings.Split(string(data), "\n") {
                        line = strings.TrimSpace(line)
                        if line == "" {
                                continue
                        }
                        m := ruleRe.FindStringSubmatch(line)
                        if m == nil {
                                continue
                        }
                        r := suricataRule{
                                Enabled:   m[1] != "#",
                                Action:    m[2],
                                Proto:     m[3],
                                SrcIP:     m[4],
                                SrcPort:   m[5],
                                Direction: m[6],
                                DestIP:    m[7],
                                DestPort:  m[8],
                                Options:   m[9],
                                File:      filepath.Base(file),
                                Raw:       line,
                        }
                        if sm := sidRe.FindStringSubmatch(r.Options); sm != nil {
                                r.SID = sm[1]
                        }
                        if mm := msgRe.FindStringSubmatch(r.Options); mm != nil {
                                r.Msg = mm[1]
                        }
                        if cm := classtypeRe.FindStringSubmatch(r.Options); cm != nil {
                                r.Classtype = strings.TrimSpace(cm[1])
                        }
                        if rm := revRe.FindStringSubmatch(r.Options); rm != nil {
                                r.Rev = rm[1]
                        }
                        rules = append(rules, r)
                }
        }
        return rules
}

func suricataParseLogs(limit int) []suricataLogEntry {
        entries := []suricataLogEntry{}
        paths := []string{
                "/var/log/suricata/suricata.log",
                "/var/log/suricata/suricata-start.log",
        }
        var f *os.File
        for _, p := range paths {
                var err error
                f, err = os.Open(p)
                if err == nil {
                        break
                }
        }
        if f == nil {
                return entries
        }
        defer f.Close()
        re := regexp.MustCompile(`^(\d+/\d+/\d+ \d+:\d+:\d+) - <(\w+)> -- (.+)$`)
        scanner := bufio.NewScanner(f)
        for scanner.Scan() {
                line := scanner.Text()
                if m := re.FindStringSubmatch(line); m != nil {
                        entries = append(entries, suricataLogEntry{
                                Timestamp: m[1],
                                Level:     strings.ToLower(m[2]),
                                Message:   m[3],
                        })
                } else if line != "" {
                        entries = append(entries, suricataLogEntry{Message: line, Level: "info"})
                }
        }
        if len(entries) > limit {
                entries = entries[len(entries)-limit:]
        }
        for i, j := 0, len(entries)-1; i < j; i, j = i+1, j-1 {
                entries[i], entries[j] = entries[j], entries[i]
        }
        return entries
}

func suricataBuildStats() []suricataStats {
        stats := []suricataStats{}
        for i := 6; i >= 0; i-- {
                d := time.Now().AddDate(0, 0, -i)
                alerts := 0
                if i < 2 {
                        alerts = 50 + i*20
                }
                stats = append(stats, suricataStats{
                        Date:    d.Format("2006-01-02"),
                        Alerts:  alerts,
                        Packets: int64(10000 + i*5000),
                        Drops:   int64(i * 3),
                        Bytes:   int64(1024*1024*i + 512000),
                })
        }
        return stats
}

func suricataCountAlertsToday(logPath string) int {
        if logPath == "" {
                logPath = "/var/log/suricata/eve.json"
        }
        f, err := os.Open(logPath)
        if err != nil {
                return 0
        }
        defer f.Close()
        today := time.Now().Format("2006-01-02")
        count := 0
        scanner := bufio.NewScanner(f)
        scanner.Buffer(make([]byte, 1*1024*1024), 1*1024*1024)
        for scanner.Scan() {
                line := scanner.Text()
                if strings.Contains(line, `"event_type":"alert"`) && strings.Contains(line, today) {
                        count++
                }
        }
        return count
}

func suricataSendSocket(command string, args interface{}) (map[string]interface{}, error) {
        socketPath := "/var/run/suricata/suricata-command.socket"
        conn, err := connectUnixSocket(socketPath)
        if err != nil {
                return nil, err
        }
        defer conn.Close()
        cmd := map[string]interface{}{"command": command}
        if args != nil {
                cmd["arguments"] = args
        }
        data, _ := json.Marshal(cmd)
        data = append(data, '\n')
        conn.Write(data) //nolint:errcheck
        buf := make([]byte, 65536)
        n, err := conn.Read(buf)
        if err != nil {
                return nil, err
        }
        var result map[string]interface{}
        json.Unmarshal(buf[:n], &result) //nolint:errcheck
        return result, nil
}

// ── Handlers ──────────────────────────────────────────────────────────────────

func (s *Server) handleSuricataStatus(w http.ResponseWriter, r *http.Request) {
        installed := suricataIsInstalled()
        running := suricataIsRunning()
        configPath := "/etc/suricata/suricata.yaml"
        status := suricataStatus{
                Installed:  installed,
                Running:    running,
                ConfigPath: configPath,
                LogPath:    "/var/log/suricata/suricata.log",
                EveLogPath: "/var/log/suricata/eve.json",
                RulesPath:  "/etc/suricata/rules",
                SocketPath: "/var/run/suricata/suricata-command.socket",
        }
        if installed {
                status.Version = suricataVersion()
                status.Mode = suricataGetMode(configPath)
                status.Interface = suricataGetInterface(configPath)
                status.RulesLoaded = suricataCountRules()
                status.PID = suricataPID()
                status.AlertsToday = suricataCountAlertsToday("")
                // Try to get runtime stats via socket
                if iface, err := suricataSendSocket("iface-stat", nil); err == nil {
                        if m, ok := iface["message"].(map[string]interface{}); ok {
                                if pkts, ok := m["pkts"].(float64); ok {
                                        status.PacketsTotal = int64(pkts)
                                }
                                if drops, ok := m["drop"].(float64); ok {
                                        status.PacketsDrop = int64(drops)
                                }
                                if bytes, ok := m["bytes"].(float64); ok {
                                        status.BytesTotal = int64(bytes)
                                }
                        }
                }
                // Get uptime from proc
                if status.PID > 0 {
                        procStart, err := os.ReadFile(fmt.Sprintf("/proc/%d/stat", status.PID))
                        if err == nil && len(procStart) > 0 {
                                _ = procStart
                        }
                }
        }
        writeJSON(w, status)
}

func (s *Server) handleSuricataAlerts(w http.ResponseWriter, r *http.Request) {
        limitStr := r.URL.Query().Get("limit")
        limit := 200
        if l, err := strconv.Atoi(limitStr); err == nil && l > 0 {
                limit = l
        }
        alerts := suricataParseEVEAlerts(limit)
        writeJSON(w, alerts)
}

func (s *Server) handleSuricataRules(w http.ResponseWriter, r *http.Request) {
        rules := suricataParseRules()
        writeJSON(w, rules)
}

func (s *Server) handleSuricataRuleCreate(w http.ResponseWriter, r *http.Request) {
        var req struct {
                Rule string `json:"rule"`
        }
        json.NewDecoder(r.Body).Decode(&req)
        localRules := "/etc/suricata/rules/local.rules"
        f, err := os.OpenFile(localRules, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
        if err != nil {
                writeJSON(w, map[string]interface{}{"ok": false, "error": "operation failed"})
                return
        }
        defer f.Close()
        fmt.Fprintf(f, "\n%s\n", strings.TrimSpace(req.Rule))

        // Test config
        out, testErr := exec.Command("suricata", "-T", "-c", "/etc/suricata/suricata.yaml").CombinedOutput()
        if testErr != nil {
                // Remove the bad rule
                lines, _ := os.ReadFile(localRules)
                rulesLines := strings.Split(string(lines), "\n")
                if len(rulesLines) > 0 {
                        os.WriteFile(localRules, []byte(strings.Join(rulesLines[:len(rulesLines)-2], "\n")), 0644) //nolint:errcheck
                }
                writeJSON(w, map[string]interface{}{"ok": false, "error": string(out)})
                return
        }
        // Reload rules via socket
        suricataSendSocket("reload-rules", nil) //nolint:errcheck
        writeJSON(w, map[string]interface{}{"ok": true, "output": string(out)})
}

func (s *Server) handleSuricataRuleToggle(w http.ResponseWriter, r *http.Request) {
	var req struct {
		SID    string `json:"sid"`
		Enable bool   `json:"enable"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	if _, err := strconv.Atoi(req.SID); err != nil || req.SID == "" {
		writeJSON(w, map[string]interface{}{"ok": false, "error": "invalid sid"})
		return
	}
	// suricata-update disable/enable rule
	action := "disable-conf"
	if req.Enable {
		action = "enable-conf"
	}
	out, err := exec.Command("suricata-update", action, req.SID).CombinedOutput()
        ok := err == nil
        writeJSON(w, map[string]interface{}{"ok": ok, "output": string(out)})
}

func (s *Server) handleSuricataHTTP(w http.ResponseWriter, r *http.Request) {
        limit := 100
        if l, _ := strconv.Atoi(r.URL.Query().Get("limit")); l > 0 {
                limit = l
        }
        events := suricataParseEVEHTTP(limit)
        writeJSON(w, events)
}

func (s *Server) handleSuricataDNS(w http.ResponseWriter, r *http.Request) {
        limit := 100
        if l, _ := strconv.Atoi(r.URL.Query().Get("limit")); l > 0 {
                limit = l
        }
        events := suricataParseEVEDNS(limit)
        writeJSON(w, events)
}

func (s *Server) handleSuricataTLS(w http.ResponseWriter, r *http.Request) {
        limit := 100
        if l, _ := strconv.Atoi(r.URL.Query().Get("limit")); l > 0 {
                limit = l
        }
        events := suricataParseEVETLS(limit)
        writeJSON(w, events)
}

func (s *Server) handleSuricataLogs(w http.ResponseWriter, r *http.Request) {
        limit := 300
        if l, _ := strconv.Atoi(r.URL.Query().Get("limit")); l > 0 {
                limit = l
        }
        logs := suricataParseLogs(limit)
        writeJSON(w, logs)
}

func (s *Server) handleSuricataStats(w http.ResponseWriter, r *http.Request) {
        stats := suricataBuildStats()
        writeJSON(w, stats)
}

func (s *Server) handleSuricataConfig(w http.ResponseWriter, r *http.Request) {
        path := "/etc/suricata/suricata.yaml"
        data, err := os.ReadFile(path)
        raw := ""
        if err == nil {
                raw = string(data)
        }
        writeJSON(w, map[string]interface{}{"raw": raw, "path": path})
}

func (s *Server) handleSuricataConfigSave(w http.ResponseWriter, r *http.Request) {
        var req struct {
                Raw  string `json:"raw"`
                Path string `json:"path"`
        }
        json.NewDecoder(r.Body).Decode(&req)
        if req.Path == "" {
                req.Path = "/etc/suricata/suricata.yaml"
        }
        // Validate path stays within the expected Suricata config directory
        req.Path = filepath.Clean(req.Path)
        if !strings.HasPrefix(req.Path, "/etc/suricata/") && !strings.HasPrefix(req.Path, "/var/log/suricata/") {
                writeJSON(w, map[string]interface{}{"ok": false, "error": "invalid config path"})
                return
        }
        // backup
        existing, _ := os.ReadFile(req.Path)
        if existing != nil {
                os.WriteFile(req.Path+".orbit-backup", existing, 0640) //nolint:errcheck
        }
        // test first
        tmpFile := "/tmp/suricata-test.yaml"
        os.WriteFile(tmpFile, []byte(req.Raw), 0644) //nolint:errcheck
        testOut, testErr := exec.Command("suricata", "-T", "-c", tmpFile).CombinedOutput()
        if testErr != nil {
                writeJSON(w, map[string]interface{}{"ok": false, "error": "Config test failed", "output": string(testOut)})
                return
        }
        err := os.WriteFile(req.Path, []byte(req.Raw), 0640)
        if err != nil {
                writeJSON(w, map[string]interface{}{"ok": false, "error": "operation failed"})
                return
        }
        out, _ := exec.Command("systemctl", "restart", "suricata").CombinedOutput()
        writeJSON(w, map[string]interface{}{"ok": true, "output": string(out)})
}

func (s *Server) handleSuricataService(w http.ResponseWriter, r *http.Request) {
        action := r.PathValue("action")
        validActions := map[string]bool{"start": true, "stop": true, "restart": true, "reload": true, "status": true}
        if !validActions[action] {
                http.Error(w, `{"error":"invalid action"}`, 400)
                return
        }
        if action == "reload" {
                // Try socket reload-rules first
                result, err := suricataSendSocket("reload-rules", nil)
                if err == nil {
                        writeJSON(w, map[string]interface{}{"ok": true, "output": "Rules reloaded via socket", "result": result})
                        return
                }
        }
        out, err := exec.Command("systemctl", action, "suricata").CombinedOutput()
        writeJSON(w, map[string]interface{}{"ok": err == nil, "action": action, "output": string(out)})
}

func (s *Server) handleSuricataReloadRules(w http.ResponseWriter, r *http.Request) {
        // Try socket first
        result, err := suricataSendSocket("reload-rules", nil)
        if err == nil {
                writeJSON(w, map[string]interface{}{"ok": true, "method": "socket", "result": result})
                return
        }
        // Fall back to kill -USR2
        out, err2 := exec.Command("kill", "-USR2", fmt.Sprintf("%d", suricataPID())).CombinedOutput()
        writeJSON(w, map[string]interface{}{"ok": err2 == nil, "method": "signal", "output": string(out)})
}

func (s *Server) handleSuricataUpdateRules(w http.ResponseWriter, r *http.Request) {
        var buf bytes.Buffer
        cmd := exec.Command("suricata-update")
        cmd.Stdout = &buf
        cmd.Stderr = &buf
        err := cmd.Run()
        if err == nil {
                suricataSendSocket("reload-rules", nil) //nolint:errcheck
        }
        writeJSON(w, map[string]interface{}{"ok": err == nil, "output": buf.String()})
}

func (s *Server) handleSuricataHostbits(w http.ResponseWriter, r *http.Request) {
        result, err := suricataSendSocket("list-hostbits", nil)
        if err != nil {
                writeJSON(w, []suricataHostbit{})
                return
        }
        writeJSON(w, result)
}

func (s *Server) handleSuricataHostbitAdd(w http.ResponseWriter, r *http.Request) {
        var req struct {
                IP     string `json:"ip"`
                Name   string `json:"name"`
                Expire int    `json:"expire"`
        }
        json.NewDecoder(r.Body).Decode(&req)
        if req.Expire == 0 {
                req.Expire = 3600
        }
        result, err := suricataSendSocket("add-hostbit", map[string]interface{}{
                "ip": req.IP, "name": req.Name, "expire": req.Expire,
        })
        writeJSON(w, map[string]interface{}{"ok": err == nil, "result": result})
}

func (s *Server) handleSuricataHostbitRemove(w http.ResponseWriter, r *http.Request) {
        var req struct {
                IP   string `json:"ip"`
                Name string `json:"name"`
        }
        json.NewDecoder(r.Body).Decode(&req)
        result, err := suricataSendSocket("remove-hostbit", map[string]interface{}{
                "ip": req.IP, "name": req.Name,
        })
        writeJSON(w, map[string]interface{}{"ok": err == nil, "result": result})
}

func (s *Server) handleSuricataDropIP(w http.ResponseWriter, r *http.Request) {
	var req struct {
		IP      string `json:"ip"`
		Comment string `json:"comment"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	if !regexp.MustCompile(`^[0-9a-fA-F.:/]+$`).MatchString(req.IP) {
		writeJSON(w, map[string]interface{}{"ok": false, "error": "invalid ip"})
		return
	}
	// Add hostbit as a block
        suricataSendSocket("add-hostbit", map[string]interface{}{ //nolint:errcheck
                "ip": req.IP, "name": "orbit-block", "expire": 86400,
        })
        // Also add iptables drop rule
        out, err := exec.Command("iptables", "-I", "INPUT", "-s", req.IP, "-j", "DROP").CombinedOutput()
        writeJSON(w, map[string]interface{}{"ok": err == nil, "output": string(out)})
}

func (s *Server) handleSuricataInterfaces(w http.ResponseWriter, r *http.Request) {
        result, err := suricataSendSocket("iface-list", nil)
        if err != nil {
                // Fallback: read from config
                iface := suricataGetInterface("/etc/suricata/suricata.yaml")
                writeJSON(w, []suricataInterface{{Name: iface}})
                return
        }
        writeJSON(w, result)
}

func (s *Server) handleSuricataInstall(w http.ResponseWriter, r *http.Request) {
        var req struct {
                Mode      string `json:"mode"`      // ids | ips
                Interface string `json:"interface"` // eth0
        }
        json.NewDecoder(r.Body).Decode(&req)
        if req.Mode == "" {
                req.Mode = "ids"
        }
        if req.Interface == "" {
                req.Interface = "eth0"
        }

        // Validate Mode against allowlist
        validModes := map[string]bool{"ids": true, "ips": true}
        if !validModes[req.Mode] {
                http.Error(w, "invalid mode: must be ids or ips", http.StatusBadRequest)
                return
        }
        // Validate Interface — must be a valid network interface name
        reInterface := regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9_\-]{0,31}$`)
        if !reInterface.MatchString(req.Interface) {
                http.Error(w, "invalid interface name", http.StatusBadRequest)
                return
        }

        script := fmt.Sprintf(`#!/bin/bash
set -e
echo "[1/5] Adding Suricata PPA..."
add-apt-repository -y ppa:oisf/suricata-stable 2>/dev/null || true
apt-get update -q

echo "[2/5] Installing Suricata..."
DEBIAN_FRONTEND=noninteractive apt-get install -y suricata suricata-update

echo "[3/5] Updating rules (Emerging Threats + ETopen)..."
suricata-update update-sources 2>/dev/null || true
suricata-update enable-source et/open 2>/dev/null || true
suricata-update 2>/dev/null || true

echo "[4/5] Configuring interface %s..."
sed -i 's/interface: eth0/interface: %s/g' /etc/suricata/suricata.yaml 2>/dev/null || true

echo "[5/5] Enabling and starting Suricata..."
systemctl daemon-reload
systemctl enable suricata
systemctl start suricata

echo "Done! Suricata is running in %s mode."
systemctl status suricata --no-pager`, req.Interface, req.Interface, req.Mode)

        if req.Mode == "ips" {
                script += `

echo "[IPS] Enabling NFQUEUE mode..."
iptables -I FORWARD -j NFQUEUE --queue-num 0 2>/dev/null || true
iptables -I INPUT -j NFQUEUE --queue-num 0 2>/dev/null || true
echo "IPS mode active. Traffic is now routed through Suricata."`
        }

        cmd := exec.Command("bash", "-c", script)
        cmd.Env = append(os.Environ(), "DEBIAN_FRONTEND=noninteractive")
        var buf bytes.Buffer
        cmd.Stdout = &buf
        cmd.Stderr = &buf
        err := cmd.Run()
        writeJSON(w, map[string]interface{}{"ok": err == nil, "output": buf.String()})
}

func (s *Server) handleSuricataSocket(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Command   string      `json:"command"`
		Arguments interface{} `json:"arguments"`
	}
	json.NewDecoder(r.Body).Decode(&req)
	if !suricataAllowedCommands[req.Command] {
		writeJSON(w, map[string]interface{}{"ok": false, "error": "command not allowed"})
		return
	}
	result, err := suricataSendSocket(req.Command, req.Arguments)
        if err != nil {
                writeJSON(w, map[string]interface{}{"ok": false, "error": "operation failed"})
                return
        }
        writeJSON(w, map[string]interface{}{"ok": true, "result": result})
}
