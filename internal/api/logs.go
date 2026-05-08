package api

import (
        "bufio"
        "bytes"
        "context"
        "encoding/json"
        "fmt"
        "net/http"
        "os"
        "os/exec"
        "path/filepath"
        "strconv"
        "strings"
        "time"
        "unicode/utf8"

        "github.com/gorilla/websocket"
)

// ─── Types ────────────────────────────────────────────────────────────────────

type LogSource struct {
        ID    string `json:"id"`
        Label string `json:"label"`
        Kind  string `json:"kind"`
        Color string `json:"color"`
}

type LogEntry struct {
        ID        string            `json:"id"`
        Ts        int64             `json:"ts"`
        Unit      string            `json:"unit"`
        Pid       int               `json:"pid"`
        Priority  int               `json:"priority"`
        Message   string            `json:"message"`
        Host      string            `json:"host"`
        Comm      string            `json:"comm"`
        Exe       string            `json:"exe"`
        Uid       int               `json:"uid"`
        Transport string            `json:"transport"`
        BootID    string            `json:"bootId"`
        Fields    map[string]string `json:"fields"`
}

type LogStats struct {
        Total      int            `json:"total"`
        ByPriority map[string]int `json:"by_priority"`
        ByUnit     map[string]int `json:"by_unit"`
}

// ─── Color mapping ────────────────────────────────────────────────────────────

var logSourceColors = map[string]string{
        "nginx":      "#22c55e",
        "apache":     "#ff9800",
        "httpd":      "#ff9800",
        "postgresql": "#63b3ed",
        "postgres":   "#63b3ed",
        "mysql":      "#f6ad55",
        "mariadb":    "#f6ad55",
        "redis":      "#fc8181",
        "node":       "#68d391",
        "sshd":       "#a78bfa",
        "ssh":        "#a78bfa",
        "kernel":     "#f6ad55",
        "systemd":    "#60a5fa",
        "docker":     "#63b3ed",
        "containerd": "#63b3ed",
        "cron":       "#68d391",
        "fail2ban":   "#fc8181",
        "ufw":        "#9ca3af",
        "auth":       "#a78bfa",
        "syslog":     "#9ca3af",
        "php":        "#9c27b0",
        "certbot":    "#22c55e",
}

func logColor(id string) string {
        id = strings.ToLower(id)
        for k, v := range logSourceColors {
                if strings.Contains(id, k) {
                        return v
                }
        }
        return "#9ca3af"
}

// ─── journald helpers ─────────────────────────────────────────────────────────

// journalFieldStr extracts a string value from a journald JSON field.
// Fields can be strings or arrays of byte values (for binary data).
func journalFieldStr(v interface{}) string {
        switch val := v.(type) {
        case string:
                return val
        case []interface{}:
                var b bytes.Buffer
                for _, bv := range val {
                        if n, ok := bv.(float64); ok && utf8.Valid([]byte{byte(n)}) {
                                b.WriteByte(byte(n))
                        }
                }
                return b.String()
        case nil:
                return ""
        }
        return fmt.Sprintf("%v", v)
}

func journalEntryToLogEntry(idx int, fields map[string]interface{}) LogEntry {
        ts := int64(0)
        if v, ok := fields["__REALTIME_TIMESTAMP"]; ok {
                if s := journalFieldStr(v); s != "" {
                        if n, err := strconv.ParseInt(s, 10, 64); err == nil {
                                ts = n / 1000 // microseconds → milliseconds
                        }
                }
        }

        priority := 6
        if v, ok := fields["PRIORITY"]; ok {
                if s := journalFieldStr(v); s != "" {
                        if n, err := strconv.Atoi(s); err == nil {
                                priority = n
                        }
                }
        }

        pid := 0
        if v, ok := fields["_PID"]; ok {
                if s := journalFieldStr(v); s != "" {
                        n, _ := strconv.Atoi(s)
                        pid = n
                }
        }

        uid := 0
        if v, ok := fields["_UID"]; ok {
                if s := journalFieldStr(v); s != "" {
                        n, _ := strconv.Atoi(s)
                        uid = n
                }
        }

        unit := journalFieldStr(fields["_SYSTEMD_UNIT"])
        if unit == "" {
                unit = journalFieldStr(fields["SYSLOG_IDENTIFIER"])
                if unit == "" {
                        unit = journalFieldStr(fields["_COMM"])
                }
        }

        transport := journalFieldStr(fields["_TRANSPORT"])
        if transport == "" {
                transport = "journal"
        }

        // Collect all known fields as strings
        strFields := make(map[string]string)
        for k, v := range fields {
                str := journalFieldStr(v)
                if str != "" {
                        strFields[k] = str
                }
        }

        return LogEntry{
                ID:        fmt.Sprintf("j-%d-%d", ts, idx),
                Ts:        ts,
                Unit:      unit,
                Pid:       pid,
                Priority:  priority,
                Message:   journalFieldStr(fields["MESSAGE"]),
                Host:      journalFieldStr(fields["_HOSTNAME"]),
                Comm:      journalFieldStr(fields["_COMM"]),
                Exe:       journalFieldStr(fields["_EXE"]),
                Uid:       uid,
                Transport: transport,
                BootID:    journalFieldStr(fields["_BOOT_ID"]),
                Fields:    strFields,
        }
}

// sinceFromTimeRange converts a UI time range label to a journalctl --since value.
func sinceFromTimeRange(tr string) string {
        now := time.Now()
        switch tr {
        case "15m":
                return now.Add(-15 * time.Minute).Format("2006-01-02 15:04:05")
        case "1h":
                return now.Add(-time.Hour).Format("2006-01-02 15:04:05")
        case "today":
                return now.Format("2006-01-02") + " 00:00:00"
        case "7d":
                return now.AddDate(0, 0, -7).Format("2006-01-02 15:04:05")
        case "live":
                return now.Add(-5 * time.Minute).Format("2006-01-02 15:04:05")
        }
        return ""
}

// applySourceFilter appends journalctl flags for the given source ID.
func applySourceFilter(args []string, source string) []string {
        switch source {
        case "", "all":
                // no filter
        case "kernel":
                args = append(args, "-k")
        default:
                unit := source
                if !strings.Contains(unit, ".") {
                        unit += ".service"
                }
                args = append(args, "-u", unit)
        }
        return args
}

// parseJournalOutput parses journalctl --output=json lines into LogEntry slice.
func parseJournalOutput(out []byte, priorities []int) []LogEntry {
        priSet := map[int]bool{}
        for _, p := range priorities {
                priSet[p] = true
        }

        var entries []LogEntry
        scanner := bufio.NewScanner(bytes.NewReader(out))
        scanner.Buffer(make([]byte, 2*1024*1024), 2*1024*1024)
        idx := 0
        for scanner.Scan() {
                line := scanner.Bytes()
                if len(line) == 0 {
                        continue
                }
                var fields map[string]interface{}
                if err := json.Unmarshal(line, &fields); err != nil {
                        continue
                }
                entry := journalEntryToLogEntry(idx, fields)
                if len(priSet) > 0 && !priSet[entry.Priority] {
                        continue
                }
                entries = append(entries, entry)
                idx++
        }
        return entries
}

// ─── GET /api/logs/sources ────────────────────────────────────────────────────

func (s *Server) handleLogSources(w http.ResponseWriter, r *http.Request) {
        var sources []LogSource

        sources = append(sources, LogSource{
                ID:    "all",
                Label: "All Sources",
                Kind:  "journald",
                Color: "#9ca3af",
        })

        // Enumerate journald units
        out, err := exec.Command("journalctl", "--no-pager", "--field=_SYSTEMD_UNIT").Output()
        if err == nil {
                seen := map[string]bool{}
                for _, line := range strings.Split(strings.TrimSpace(string(out)), "\n") {
                        unit := strings.TrimSpace(line)
                        if unit == "" || seen[unit] {
                                continue
                        }
                        seen[unit] = true
                        id := strings.TrimSuffix(unit, ".service")
                        sources = append(sources, LogSource{
                                ID:    id,
                                Label: unit,
                                Kind:  "journald",
                                Color: logColor(id),
                        })
                }
                // Always expose kernel separately
                hasKernel := false
                for _, src := range sources {
                        if src.ID == "kernel" {
                                hasKernel = true
                                break
                        }
                }
                if !hasKernel {
                        sources = append(sources, LogSource{
                                ID:    "kernel",
                                Label: "kernel",
                                Kind:  "kernel",
                                Color: logColor("kernel"),
                        })
                }
        }

        // Enumerate log files
        logDirs := []string{"/var/log", "/var/log/nginx", "/var/log/apache2"}
        for _, dir := range logDirs {
                entries, err := os.ReadDir(dir)
                if err != nil {
                        continue
                }
                for _, e := range entries {
                        if e.IsDir() {
                                continue
                        }
                        name := e.Name()
                        if !strings.HasSuffix(name, ".log") && !strings.HasSuffix(name, ".log.1") {
                                continue
                        }
                        path := filepath.Join(dir, name)
                        sources = append(sources, LogSource{
                                ID:    "file:" + path,
                                Label: name,
                                Kind:  "file",
                                Color: logColor(name),
                        })
                }
        }

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(sources) //nolint:errcheck
}

// ─── GET /api/logs/entries ────────────────────────────────────────────────────

func (s *Server) handleLogEntries(w http.ResponseWriter, r *http.Request) {
        source     := r.URL.Query().Get("source")
        timeRange  := r.URL.Query().Get("range")
        search     := r.URL.Query().Get("search")
        priStr     := r.URL.Query().Get("priorities")
        unitFilter := r.URL.Query().Get("unit")
        limitStr   := r.URL.Query().Get("limit")

        limit := 500
        if n, err := strconv.Atoi(limitStr); err == nil && n > 0 && n <= 5000 {
                limit = n
        }

        // Parse priority filter
        var priorities []int
        if priStr != "" {
                for _, p := range strings.Split(priStr, ",") {
                        if n, err := strconv.Atoi(strings.TrimSpace(p)); err == nil {
                                priorities = append(priorities, n)
                        }
                }
        }

        // File source
        if strings.HasPrefix(source, "file:") {
                path := strings.TrimPrefix(source, "file:")
                entries := readFileEntries(path, search, priorities, limit)
                w.Header().Set("Content-Type", "application/json")
                json.NewEncoder(w).Encode(entries) //nolint:errcheck
                return
        }

        args := []string{"--no-pager", "--output=json", "-n", strconv.Itoa(limit)}
        args = applySourceFilter(args, source)

        if timeRange == "boot" {
                args = append(args, "-b")
        } else if since := sinceFromTimeRange(timeRange); since != "" {
                args = append(args, "--since", since)
        }

        if search != "" {
                args = append(args, "-g", search)
        }

        // Additional unit filter (only when source is "all")
        if unitFilter != "" && unitFilter != "all" && (source == "" || source == "all") {
                unit := unitFilter
                if !strings.Contains(unit, ".") {
                        unit += ".service"
                }
                args = append(args, "-u", unit)
        }

        out, err := exec.Command("journalctl", args...).Output()

        var entries []LogEntry
        if err == nil && len(out) > 0 {
                entries = parseJournalOutput(out, priorities)
        }
        if entries == nil {
                entries = []LogEntry{}
        }

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(entries) //nolint:errcheck
}

// ─── GET /api/logs/stats ──────────────────────────────────────────────────────

func (s *Server) handleLogStats(w http.ResponseWriter, r *http.Request) {
        source    := r.URL.Query().Get("source")
        timeRange := r.URL.Query().Get("range")

        args := []string{"--no-pager", "--output=json", "-n", "2000"}
        args = applySourceFilter(args, source)

        if timeRange == "boot" {
                args = append(args, "-b")
        } else if since := sinceFromTimeRange(timeRange); since != "" {
                args = append(args, "--since", since)
        }

        out, _ := exec.Command("journalctl", args...).Output()

        stats := LogStats{
                ByPriority: map[string]int{"0": 0, "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, "6": 0, "7": 0},
                ByUnit:     map[string]int{},
        }

        scanner := bufio.NewScanner(bytes.NewReader(out))
        scanner.Buffer(make([]byte, 2*1024*1024), 2*1024*1024)
        for scanner.Scan() {
                line := scanner.Bytes()
                if len(line) == 0 {
                        continue
                }
                var fields map[string]interface{}
                if err := json.Unmarshal(line, &fields); err != nil {
                        continue
                }
                stats.Total++

                pri := "6"
                if v, ok := fields["PRIORITY"]; ok {
                        pri = journalFieldStr(v)
                }
                stats.ByPriority[pri]++

                unit := journalFieldStr(fields["_SYSTEMD_UNIT"])
                if unit == "" {
                        unit = journalFieldStr(fields["SYSLOG_IDENTIFIER"])
                }
                if unit != "" {
                        stats.ByUnit[unit]++
                }
        }

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(stats) //nolint:errcheck
}

// ─── File log reader ──────────────────────────────────────────────────────────

func readFileEntries(path, search string, priorities []int, limit int) []LogEntry {
        f, err := os.Open(path)
        if err != nil {
                return []LogEntry{}
        }
        defer f.Close()

        priSet := map[int]bool{}
        for _, p := range priorities {
                priSet[p] = true
        }

        searchL := strings.ToLower(search)

        var lines []string
        scanner := bufio.NewScanner(f)
        scanner.Buffer(make([]byte, 512*1024), 512*1024)
        for scanner.Scan() {
                line := scanner.Text()
                if search != "" && !strings.Contains(strings.ToLower(line), searchL) {
                        continue
                }
                lines = append(lines, line)
        }

        if len(lines) > limit {
                lines = lines[len(lines)-limit:]
        }

        filename := filepath.Base(path)
        now := time.Now()
        var entries []LogEntry

        for i, line := range lines {
                priority := inferPriority(line)
                if len(priSet) > 0 && !priSet[priority] {
                        continue
                }
                entries = append(entries, LogEntry{
                        ID:        fmt.Sprintf("f-%d-%d", now.UnixMilli(), i),
                        Ts:        now.UnixMilli() - int64(len(lines)-i)*1000,
                        Unit:      filename,
                        Pid:       0,
                        Priority:  priority,
                        Message:   line,
                        Host:      "",
                        Comm:      filename,
                        Exe:       path,
                        Uid:       0,
                        Transport: "syslog",
                        BootID:    "",
                        Fields: map[string]string{
                                "MESSAGE":  line,
                                "PRIORITY": strconv.Itoa(priority),
                                "_COMM":    filename,
                                "_EXE":     path,
                        },
                })
        }
        return entries
}

func inferPriority(line string) int {
        l := strings.ToLower(line)
        switch {
        case strings.Contains(l, "emerg") || strings.Contains(l, "panic"):
                return 0
        case strings.Contains(l, "alert"):
                return 1
        case strings.Contains(l, "crit") || strings.Contains(l, "critical"):
                return 2
        case strings.Contains(l, "error") || strings.Contains(l, " err ") || strings.HasSuffix(l, " err"):
                return 3
        case strings.Contains(l, "warn"):
                return 4
        case strings.Contains(l, "notice"):
                return 5
        case strings.Contains(l, "debug") || strings.Contains(l, "trace"):
                return 7
        default:
                return 6
        }
}

// ─── Legacy: GET /api/logs ────────────────────────────────────────────────────

type logFile struct {
        Name string `json:"name"`
        Path string `json:"path"`
        Size int64  `json:"size"`
}

var commonLogDirs = []string{
        "/var/log",
        "/var/log/nginx",
        "/var/log/apache2",
}

func (s *Server) handleLogList(w http.ResponseWriter, r *http.Request) {
        var logs []logFile
        for _, dir := range commonLogDirs {
                entries, err := os.ReadDir(dir)
                if err != nil {
                        continue
                }
                for _, e := range entries {
                        if e.IsDir() {
                                continue
                        }
                        if !strings.HasSuffix(e.Name(), ".log") && !strings.HasSuffix(e.Name(), ".log.1") {
                                continue
                        }
                        info, _ := e.Info()
                        size := int64(0)
                        if info != nil {
                                size = info.Size()
                        }
                        logs = append(logs, logFile{
                                Name: e.Name(),
                                Path: filepath.Join(dir, e.Name()),
                                Size: size,
                        })
                }
        }
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(logs) //nolint:errcheck
}

// ─── WebSocket: GET /ws/logs ──────────────────────────────────────────────────

func (s *Server) handleLogTailWS(w http.ResponseWriter, r *http.Request) {
        source := r.URL.Query().Get("source")

        conn, err := wsUpgrader.Upgrade(w, r, nil)
        if err != nil {
                return
        }
        defer conn.Close()

        ctx := r.Context()

        if strings.HasPrefix(source, "file:") {
                path := strings.TrimPrefix(source, "file:")
                tailFileWS(ctx, conn, path)
                return
        }

        // journalctl -f
        args := []string{"-f", "--no-pager", "--output=json", "-n", "50"}
        args = applySourceFilter(args, source)

        cmd := exec.CommandContext(ctx, "journalctl", args...)
        stdout, err := cmd.StdoutPipe()
        if err != nil {
                tailFallbackWS(ctx, conn, source)
                return
        }
        if err := cmd.Start(); err != nil {
                tailFallbackWS(ctx, conn, source)
                return
        }
        defer cmd.Wait()

        scanner := bufio.NewScanner(stdout)
        scanner.Buffer(make([]byte, 512*1024), 512*1024)
        idx := 0
        for scanner.Scan() {
                select {
                case <-ctx.Done():
                        cmd.Process.Kill() //nolint:errcheck
                        return
                default:
                }
                line := scanner.Bytes()
                if len(line) == 0 {
                        continue
                }
                var fields map[string]interface{}
                if err := json.Unmarshal(line, &fields); err != nil {
                        continue
                }
                entry := journalEntryToLogEntry(idx, fields)
                idx++

                payload, _ := json.Marshal(map[string]interface{}{
                        "type":    "log",
                        "payload": entry.Message,
                        "entry":   entry,
                })
                if err := conn.WriteMessage(websocket.TextMessage, payload); err != nil {
                        return
                }
        }
}

func tailFileWS(ctx context.Context, conn *websocket.Conn, path string) {
        f, err := os.Open(path)
        if err != nil {
                conn.WriteMessage(websocket.TextMessage, []byte(`{"type":"error","payload":"cannot open log file"}`)) //nolint:errcheck
                return
        }
        defer f.Close()

        fi, _ := f.Stat()
        if fi != nil && fi.Size() > 8192 {
                f.Seek(-8192, 2) //nolint:errcheck
        }

        scanner := bufio.NewScanner(f)
        scanner.Scan() // skip partial first line

        for scanner.Scan() {
                data, _ := json.Marshal(map[string]string{"type": "log", "payload": scanner.Text()})
                if err := conn.WriteMessage(websocket.TextMessage, data); err != nil {
                        return
                }
        }

        ticker := time.NewTicker(500 * time.Millisecond)
        defer ticker.Stop()
        for {
                select {
                case <-ctx.Done():
                        return
                case <-ticker.C:
                        for scanner.Scan() {
                                data, _ := json.Marshal(map[string]string{"type": "log", "payload": scanner.Text()})
                                if err := conn.WriteMessage(websocket.TextMessage, data); err != nil {
                                        return
                                }
                        }
                }
        }
}

func tailFallbackWS(ctx context.Context, conn *websocket.Conn, source string) {
        // Sanitize source: strip directory components and allow only safe filename characters
        source = filepath.Base(source)
        var safeSrc strings.Builder
        for _, r := range source {
                if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '-' || r == '_' || r == '.' {
                        safeSrc.WriteRune(r)
                }
        }
        source = safeSrc.String()

        path := "/var/log/syslog"
        candidates := []string{
                "/var/log/" + source + ".log",
                "/var/log/" + strings.TrimSuffix(source, ".service") + ".log",
        }
        for _, c := range candidates {
                if _, err := os.Stat(c); err == nil {
                        path = c
                        break
                }
        }
        tailFileWS(ctx, conn, path)
}
