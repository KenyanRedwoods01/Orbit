// Package api — Advanced Ports Management backend.
// Provides real-time port discovery, process association, connection tracking,
// and port access-control operations using ss, iptables, and /proc/net.
package api

import (
        "bufio"
        "database/sql"
        "encoding/json"
        "fmt"
        "log"
        "net"
        "net/http"
        "os"
        "os/exec"
        "sort"
        "strconv"
        "strings"
        "time"
)

// ─────────────────────────────────────────────────────────────────────────────
// Domain types
// ─────────────────────────────────────────────────────────────────────────────

type PortEntry struct {
        Port        int    `json:"port"`
        Protocol    string `json:"protocol"`
        State       string `json:"state"`
        ServiceName string `json:"service_name"`
        ProcessName string `json:"process_name"`
        ProcessPID  int    `json:"process_pid"`
        BindAddress string `json:"bind_address"`
        PortType    string `json:"port_type"`
        RiskLevel   string `json:"risk_level"`
        Description string `json:"description"`
}

type ConnectionEntry struct {
        LocalAddr   string `json:"local_addr"`
        LocalPort   int    `json:"local_port"`
        RemoteAddr  string `json:"remote_addr"`
        RemotePort  int    `json:"remote_port"`
        State       string `json:"state"`
        ProcessName string `json:"process_name"`
        ProcessPID  int    `json:"process_pid"`
        Protocol    string `json:"protocol"`
}

type PortRule struct {
        ID        string `json:"id"`
        Port      int    `json:"port"`
        Protocol  string `json:"protocol"`
        Action    string `json:"action"`
        Source    string `json:"source"`
        Comment   string `json:"comment"`
        CreatedAt string `json:"created_at"`
        Enabled   bool   `json:"enabled"`
}

type PortSummary struct {
        TotalListening  int            `json:"total_listening"`
        TotalTCP        int            `json:"total_tcp"`
        TotalUDP        int            `json:"total_udp"`
        TotalEstablished int           `json:"total_established"`
        RiskBreakdown   map[string]int `json:"risk_breakdown"`
        TopProcesses    []ProcessPort  `json:"top_processes"`
        PortsByType     map[string]int `json:"ports_by_type"`
        PublicPorts     []int          `json:"public_ports"`
        PrivatePorts    []int          `json:"private_ports"`
}

type ProcessPort struct {
        ProcessName string `json:"process_name"`
        PID         int    `json:"pid"`
        PortCount   int    `json:"port_count"`
        Ports       []int  `json:"ports"`
}

type PortRuleInput struct {
        Port     int    `json:"port"`
        Protocol string `json:"protocol"`
        Action   string `json:"action"`
        Source   string `json:"source"`
        Comment  string `json:"comment"`
}

// ─────────────────────────────────────────────────────────────────────────────
// Well-known port service map
// ─────────────────────────────────────────────────────────────────────────────

var wellKnownPorts = map[int]string{
        20: "FTP-Data", 21: "FTP", 22: "SSH", 23: "Telnet", 25: "SMTP",
        53: "DNS", 67: "DHCP", 68: "DHCP", 69: "TFTP", 80: "HTTP",
        110: "POP3", 119: "NNTP", 123: "NTP", 143: "IMAP", 161: "SNMP",
        194: "IRC", 389: "LDAP", 443: "HTTPS", 445: "SMB", 465: "SMTPS",
        514: "Syslog", 587: "SMTP-Sub", 636: "LDAPS", 873: "rsync",
        993: "IMAPS", 995: "POP3S", 1433: "MSSQL", 1521: "Oracle",
        1723: "PPTP", 2049: "NFS", 2375: "Docker", 2376: "Docker-TLS",
        3000: "Node.js", 3306: "MySQL", 3389: "RDP", 4000: "App",
        4443: "HTTPS-Alt", 5000: "App/Flask", 5432: "PostgreSQL",
        5672: "RabbitMQ", 5900: "VNC", 5984: "CouchDB",
        6379: "Redis", 6443: "Kubernetes", 7000: "Cassandra",
        8000: "HTTP-Dev", 8080: "HTTP-Alt", 8443: "HTTPS-Alt",
        8888: "Jupyter", 9000: "PHP-FPM/SonarQube", 9090: "Prometheus",
        9200: "Elasticsearch", 9300: "Elasticsearch-Cluster",
        9443: "HTTPS-Alt", 10250: "Kubelet", 11211: "Memcached",
        15672: "RabbitMQ-UI", 16379: "Redis-Cluster",
        27017: "MongoDB", 27018: "MongoDB-Shard", 28017: "MongoDB-HTTP",
}

func portServiceName(port int, process string) string {
        if name, ok := wellKnownPorts[port]; ok {
                return name
        }
        if process != "" {
                return process
        }
        return "unknown"
}

func portType(port int, process string) string {
        systemPorts := map[int]bool{
                20: true, 21: true, 22: true, 23: true, 25: true, 53: true,
                80: true, 110: true, 143: true, 443: true, 514: true, 873: true,
        }
        dbPorts := map[int]bool{
                1433: true, 1521: true, 3306: true, 5432: true, 5984: true,
                6379: true, 7000: true, 9200: true, 9300: true, 11211: true,
                27017: true, 27018: true,
        }
        appPorts := map[int]bool{
                3000: true, 4000: true, 5000: true, 8000: true, 8080: true,
                8443: true, 8888: true, 9000: true, 9090: true, 15672: true,
        }
        infraPorts := map[int]bool{
                2375: true, 2376: true, 6443: true, 10250: true,
        }
        if port < 1024 {
                if _, ok := systemPorts[port]; ok {
                        return "system"
                }
                return "system"
        }
        if dbPorts[port] {
                return "database"
        }
        if appPorts[port] {
                return "application"
        }
        if infraPorts[port] {
                return "infrastructure"
        }
        return "custom"
}

func portRisk(port int, bindAddr string, ptype string) string {
        criticalPorts := map[int]bool{23: true, 3389: true, 5900: true}
        highRiskPorts := map[int]bool{
                21: true, 2375: true, 6379: true, 27017: true, 11211: true, 5984: true,
        }
        isPublic := bindAddr == "0.0.0.0" || bindAddr == "::" || bindAddr == "*"
        if criticalPorts[port] && isPublic {
                return "critical"
        }
        if highRiskPorts[port] && isPublic {
                return "high"
        }
        if isPublic && ptype == "custom" {
                return "medium"
        }
        if isPublic {
                return "low"
        }
        return "info"
}

func portDescription(port int) string {
        descs := map[int]string{
                22:    "Secure Shell — remote login and command execution",
                80:    "Hypertext Transfer Protocol — web server",
                443:   "HTTP over TLS — encrypted web server",
                3306:  "MySQL database server",
                5432:  "PostgreSQL database server",
                6379:  "Redis in-memory data store",
                27017: "MongoDB document database",
                2375:  "Docker daemon (unauthenticated) — high risk if exposed",
                2376:  "Docker daemon (TLS-authenticated)",
                6443:  "Kubernetes API server",
                3389:  "Remote Desktop Protocol — high risk if exposed",
                5900:  "VNC remote desktop — high risk if exposed",
                23:    "Telnet — unencrypted, obsolete, critical risk",
                25:    "SMTP mail transfer agent",
                53:    "DNS name resolution",
                9090:  "Prometheus metrics server",
                9200:  "Elasticsearch HTTP API",
                8080:  "HTTP alternate port (proxy/dev server)",
        }
        if d, ok := descs[port]; ok {
                return d
        }
        return ""
}

// ─────────────────────────────────────────────────────────────────────────────
// DB helpers — port rules stored in SQLite
// ─────────────────────────────────────────────────────────────────────────────

func (s *Server) ensurePortRulesTable() {
        s.db.SQL.Exec(`CREATE TABLE IF NOT EXISTS port_rules (
                id         TEXT PRIMARY KEY,
                port       INTEGER NOT NULL,
                protocol   TEXT NOT NULL DEFAULT 'tcp',
                action     TEXT NOT NULL DEFAULT 'allow',
                source     TEXT NOT NULL DEFAULT 'any',
                comment    TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                enabled    INTEGER NOT NULL DEFAULT 1
        )`)
}

func genPortRuleID() string {
        b := make([]byte, 6)
        for i := range b {
                b[i] = "abcdefghijklmnopqrstuvwxyz0123456789"[time.Now().UnixNano()%36]
                time.Sleep(time.Nanosecond)
        }
        return "pr_" + string(b)
}

// ─────────────────────────────────────────────────────────────────────────────
// System data collection
// ─────────────────────────────────────────────────────────────────────────────

func collectListeningPorts() []PortEntry {
        ports := []PortEntry{}
        seen := map[string]bool{}

        // Try ss -tlnpH first (TCP listening)
        for _, args := range [][]string{
                {"-tlnpH"},
                {"-ulnpH"},
                {"-tlnp"},
                {"-ulnp"},
        } {
                proto := "tcp"
                if strings.Contains(args[0], "u") {
                        proto = "udp"
                }
                out, err := exec.Command("ss", args...).Output()
                if err != nil {
                        // fallback: read /proc/net/tcp
                        entries := readProcNetTCP(proto)
                        for _, e := range entries {
                                key := fmt.Sprintf("%s:%d", e.BindAddress, e.Port)
                                if seen[key] {
                                        continue
                                }
                                seen[key] = true
                                ports = append(ports, e)
                        }
                        continue
                }
                scanner := bufio.NewScanner(strings.NewReader(string(out)))
                for scanner.Scan() {
                        line := scanner.Text()
                        if strings.HasPrefix(line, "State") || strings.HasPrefix(line, "Netid") || line == "" {
                                continue
                        }
                        entry := parseSsLine(line, proto)
                        if entry == nil {
                                continue
                        }
                        key := fmt.Sprintf("%s:%d", entry.BindAddress, entry.Port)
                        if seen[key] {
                                continue
                        }
                        seen[key] = true
                        entry.ServiceName = portServiceName(entry.Port, entry.ProcessName)
                        entry.PortType = portType(entry.Port, entry.ProcessName)
                        entry.RiskLevel = portRisk(entry.Port, entry.BindAddress, entry.PortType)
                        entry.Description = portDescription(entry.Port)
                        ports = append(ports, *entry)
                }
        }

        sort.Slice(ports, func(i, j int) bool {
                return ports[i].Port < ports[j].Port
        })
        return ports
}

func parseSsLine(line, proto string) *PortEntry {
        // ss output columns: Netid State Recv-Q Send-Q Local-Address:Port Peer-Address:Port Process
        fields := strings.Fields(line)
        if len(fields) < 5 {
                return nil
        }

        // Determine column offsets — ss -H omits header but columns are same
        localCol := 4
        if len(fields) >= 6 && (fields[0] == "tcp" || fields[0] == "udp" || fields[0] == "tcp6" || fields[0] == "udp6") {
                // with netid column
                localCol = 4
        }
        if localCol >= len(fields) {
                return nil
        }

        localAddrPort := fields[localCol]
        addr, portStr := splitAddrPort(localAddrPort)
        port, err := strconv.Atoi(portStr)
        if err != nil || port <= 0 {
                return nil
        }

        state := "LISTEN"
        if len(fields) > 1 {
                state = fields[1]
        }

        processName, pid := extractProcessFromSS(line)

        return &PortEntry{
                Port:        port,
                Protocol:    proto,
                State:       normalizeState(state),
                BindAddress: addr,
                ProcessName: processName,
                ProcessPID:  pid,
        }
}

func splitAddrPort(s string) (string, string) {
        // Handle IPv6 like [::]:80
        if strings.HasPrefix(s, "[") {
                end := strings.LastIndex(s, "]")
                if end < 0 {
                        return s, "0"
                }
                addr := s[1:end]
                rest := s[end+1:]
                rest = strings.TrimPrefix(rest, ":")
                return addr, rest
        }
        // IPv4 like 0.0.0.0:80
        idx := strings.LastIndex(s, ":")
        if idx < 0 {
                return s, "0"
        }
        return s[:idx], s[idx+1:]
}

func normalizeState(s string) string {
        switch strings.ToUpper(s) {
        case "LISTEN":
                return "LISTEN"
        case "ESTABLISHED":
                return "ESTABLISHED"
        case "TIME_WAIT":
                return "TIME_WAIT"
        case "CLOSE_WAIT":
                return "CLOSE_WAIT"
        default:
                return s
        }
}

func extractProcessFromSS(line string) (string, int) {
        // Look for users:(...) or (("name",pid=N,...))
        pidIdx := strings.Index(line, "pid=")
        if pidIdx < 0 {
                // Try fd=
                return extractProcessFromProcPID(line), 0
        }
        rest := line[pidIdx+4:]
        end := strings.IndexAny(rest, ",)")
        if end < 0 {
                end = len(rest)
        }
        pid, _ := strconv.Atoi(rest[:end])

        // Extract name from "name",pid=N
        nameStart := strings.LastIndex(line[:pidIdx], "\"")
        if nameStart < 0 {
                return procNameFromPID(pid), pid
        }
        beforeName := line[:nameStart]
        nameStart2 := strings.LastIndex(beforeName, "\"")
        if nameStart2 >= 0 {
                name := line[nameStart2+1 : nameStart]
                return name, pid
        }
        return procNameFromPID(pid), pid
}

func extractProcessFromProcPID(line string) string {
        return ""
}

func procNameFromPID(pid int) string {
        if pid <= 0 {
                return ""
        }
        data, err := os.ReadFile(fmt.Sprintf("/proc/%d/comm", pid))
        if err != nil {
                return ""
        }
        return strings.TrimSpace(string(data))
}

// readProcNetTCP is a fallback for systems without ss
func readProcNetTCP(proto string) []PortEntry {
        file := "/proc/net/tcp"
        if proto == "udp" {
                file = "/proc/net/udp"
        }
        data, err := os.ReadFile(file)
        if err != nil {
                return nil
        }
        var entries []PortEntry
        lines := strings.Split(string(data), "\n")
        for i, line := range lines {
                if i == 0 || strings.TrimSpace(line) == "" {
                        continue
                }
                fields := strings.Fields(line)
                if len(fields) < 4 {
                        continue
                }
                // field[1] = local_address (hex IP:port)
                // field[3] = state (hex)
                localHex := fields[1]
                state := fields[3]
                if state != "0A" { // 0A = LISTEN
                        continue
                }
                parts := strings.Split(localHex, ":")
                if len(parts) != 2 {
                        continue
                }
                portHex := parts[1]
                portNum, err := strconv.ParseInt(portHex, 16, 32)
                if err != nil {
                        continue
                }
                ipHex := parts[0]
                addr := hexToIP(ipHex)
                entries = append(entries, PortEntry{
                        Port:        int(portNum),
                        Protocol:    proto,
                        State:       "LISTEN",
                        BindAddress: addr,
                        ServiceName: portServiceName(int(portNum), ""),
                        PortType:    portType(int(portNum), ""),
                        RiskLevel:   portRisk(int(portNum), addr, portType(int(portNum), "")),
                        Description: portDescription(int(portNum)),
                })
        }
        return entries
}

func hexToIP(hex string) string {
        if len(hex) != 8 {
                return "0.0.0.0"
        }
        // Little-endian
        b0, _ := strconv.ParseUint(hex[6:8], 16, 8)
        b1, _ := strconv.ParseUint(hex[4:6], 16, 8)
        b2, _ := strconv.ParseUint(hex[2:4], 16, 8)
        b3, _ := strconv.ParseUint(hex[0:2], 16, 8)
        ip := net.IPv4(byte(b0), byte(b1), byte(b2), byte(b3))
        return ip.String()
}

func collectConnections() []ConnectionEntry {
        out, err := exec.Command("ss", "-tnpH").Output()
        if err != nil {
                return collectConnectionsFallback()
        }
        var conns []ConnectionEntry
        scanner := bufio.NewScanner(strings.NewReader(string(out)))
        for scanner.Scan() {
                line := scanner.Text()
                if line == "" {
                        continue
                }
                c := parseSsConnectionLine(line)
                if c != nil {
                        conns = append(conns, *c)
                }
        }
        return conns
}

func parseSsConnectionLine(line string) *ConnectionEntry {
        fields := strings.Fields(line)
        // ss -tnpH: State Recv-Q Send-Q Local Peer Process
        if len(fields) < 5 {
                return nil
        }

        state := fields[0]
        localAddrPort := fields[3]
        peerAddrPort := fields[4]

        lAddr, lPortStr := splitAddrPort(localAddrPort)
        rAddr, rPortStr := splitAddrPort(peerAddrPort)
        lPort, _ := strconv.Atoi(lPortStr)
        rPort, _ := strconv.Atoi(rPortStr)

        procName, pid := extractProcessFromSS(line)

        return &ConnectionEntry{
                LocalAddr:   lAddr,
                LocalPort:   lPort,
                RemoteAddr:  rAddr,
                RemotePort:  rPort,
                State:       normalizeState(state),
                ProcessName: procName,
                ProcessPID:  pid,
                Protocol:    "tcp",
        }
}

func collectConnectionsFallback() []ConnectionEntry {
        data, err := os.ReadFile("/proc/net/tcp")
        if err != nil {
                return nil
        }
        var conns []ConnectionEntry
        lines := strings.Split(string(data), "\n")
        for i, line := range lines {
                if i == 0 || strings.TrimSpace(line) == "" {
                        continue
                }
                fields := strings.Fields(line)
                if len(fields) < 4 {
                        continue
                }
                stateHex := fields[3]
                if stateHex == "0A" { // LISTEN — skip
                        continue
                }
                localHex := fields[1]
                remoteHex := fields[2]
                lparts := strings.Split(localHex, ":")
                rparts := strings.Split(remoteHex, ":")
                if len(lparts) != 2 || len(rparts) != 2 {
                        continue
                }
                lPort, _ := strconv.ParseInt(lparts[1], 16, 32)
                rPort, _ := strconv.ParseInt(rparts[1], 16, 32)
                lAddr := hexToIP(lparts[0])
                rAddr := hexToIP(rparts[0])
                state := hexState(stateHex)
                conns = append(conns, ConnectionEntry{
                        LocalAddr:  lAddr,
                        LocalPort:  int(lPort),
                        RemoteAddr: rAddr,
                        RemotePort: int(rPort),
                        State:      state,
                        Protocol:   "tcp",
                })
        }
        return conns
}

func hexState(h string) string {
        states := map[string]string{
                "01": "ESTABLISHED", "02": "SYN_SENT", "03": "SYN_RECV",
                "04": "FIN_WAIT1", "05": "FIN_WAIT2", "06": "TIME_WAIT",
                "07": "CLOSE", "08": "CLOSE_WAIT", "09": "LAST_ACK",
                "0A": "LISTEN", "0B": "CLOSING",
        }
        if s, ok := states[strings.ToUpper(h)]; ok {
                return s
        }
        return h
}

func buildPortSummary(ports []PortEntry, conns []ConnectionEntry) PortSummary {
        summary := PortSummary{
                RiskBreakdown: map[string]int{"critical": 0, "high": 0, "medium": 0, "low": 0, "info": 0},
                PortsByType:   map[string]int{},
                PublicPorts:   []int{},
                PrivatePorts:  []int{},
        }
        summary.TotalListening = len(ports)
        summary.TotalEstablished = len(conns)

        procMap := map[string]*ProcessPort{}

        for _, p := range ports {
                if p.Protocol == "tcp" {
                        summary.TotalTCP++
                } else {
                        summary.TotalUDP++
                }
                if _, ok := summary.RiskBreakdown[p.RiskLevel]; ok {
                        summary.RiskBreakdown[p.RiskLevel]++
                }
                summary.PortsByType[p.PortType]++

                isPublic := p.BindAddress == "0.0.0.0" || p.BindAddress == "::" || p.BindAddress == "*"
                if isPublic {
                        summary.PublicPorts = append(summary.PublicPorts, p.Port)
                } else {
                        summary.PrivatePorts = append(summary.PrivatePorts, p.Port)
                }

                key := p.ProcessName
                if key == "" {
                        key = "unknown"
                }
                if _, ok := procMap[key]; !ok {
                        procMap[key] = &ProcessPort{ProcessName: key, PID: p.ProcessPID}
                }
                procMap[key].PortCount++
                procMap[key].Ports = append(procMap[key].Ports, p.Port)
        }

        for _, pp := range procMap {
                summary.TopProcesses = append(summary.TopProcesses, *pp)
        }
        sort.Slice(summary.TopProcesses, func(i, j int) bool {
                return summary.TopProcesses[i].PortCount > summary.TopProcesses[j].PortCount
        })
        if len(summary.TopProcesses) > 10 {
                summary.TopProcesses = summary.TopProcesses[:10]
        }
        return summary
}

// ─────────────────────────────────────────────────────────────────────────────
// iptables helpers
// ─────────────────────────────────────────────────────────────────────────────

func applyIPTablesRule(action, port, protocol, source string) error {
        var cmdArgs []string
        if action == "allow" {
                if source == "any" || source == "" {
                        cmdArgs = []string{"-I", "INPUT", "-p", protocol, "--dport", port, "-j", "ACCEPT"}
                } else {
                        cmdArgs = []string{"-I", "INPUT", "-s", source, "-p", protocol, "--dport", port, "-j", "ACCEPT"}
                }
        } else {
                if source == "any" || source == "" {
                        cmdArgs = []string{"-I", "INPUT", "-p", protocol, "--dport", port, "-j", "DROP"}
                } else {
                        cmdArgs = []string{"-I", "INPUT", "-s", source, "-p", protocol, "--dport", port, "-j", "DROP"}
                }
        }
        out, err := exec.Command("iptables", cmdArgs...).CombinedOutput()
        if err != nil {
                return fmt.Errorf("iptables: %v — %s", err, string(out))
        }
        return nil
}

func removeIPTablesRule(action, port, protocol, source string) {
        jumpTarget := "ACCEPT"
        if action == "block" || action == "deny" {
                jumpTarget = "DROP"
        }
        var cmdArgs []string
        if source == "any" || source == "" {
                cmdArgs = []string{"-D", "INPUT", "-p", protocol, "--dport", port, "-j", jumpTarget}
        } else {
                cmdArgs = []string{"-D", "INPUT", "-s", source, "-p", protocol, "--dport", port, "-j", jumpTarget}
        }
        exec.Command("iptables", cmdArgs...).Run() //nolint:errcheck
}

func applyUFWRule(action, port, protocol, source string) {
        portProto := fmt.Sprintf("%s/%s", port, protocol)
        if action == "allow" {
                if source == "any" || source == "" {
                        exec.Command("ufw", "allow", portProto).Run() //nolint:errcheck
                } else {
                        exec.Command("ufw", "allow", "from", source, "to", "any", "port", port, "proto", protocol).Run() //nolint:errcheck
                }
        } else {
                if source == "any" || source == "" {
                        exec.Command("ufw", "deny", portProto).Run() //nolint:errcheck
                } else {
                        exec.Command("ufw", "deny", "from", source, "to", "any", "port", port, "proto", protocol).Run() //nolint:errcheck
                }
        }
}

func removeUFWRule(action, port, protocol, source string) {
        portProto := fmt.Sprintf("%s/%s", port, protocol)
        if action == "allow" {
                if source == "any" || source == "" {
                        exec.Command("ufw", "delete", "allow", portProto).Run() //nolint:errcheck
                }
        } else {
                if source == "any" || source == "" {
                        exec.Command("ufw", "delete", "deny", portProto).Run() //nolint:errcheck
                }
        }
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP Handlers
// ─────────────────────────────────────────────────────────────────────────────

func (s *Server) handlePortsSummary(w http.ResponseWriter, r *http.Request) {
        ports := collectListeningPorts()
        conns := collectConnections()
        summary := buildPortSummary(ports, conns)
        writeJSON(w, summary)
}

func (s *Server) handlePortsListening(w http.ResponseWriter, r *http.Request) {
        ports := collectListeningPorts()
        writeJSON(w, ports)
}

func (s *Server) handlePortsConnections(w http.ResponseWriter, r *http.Request) {
        conns := collectConnections()
        writeJSON(w, conns)
}

func (s *Server) handlePortsRuleList(w http.ResponseWriter, r *http.Request) {
        s.ensurePortRulesTable()
        rows, err := s.db.SQL.Query(`SELECT id, port, protocol, action, source, comment, created_at, enabled FROM port_rules ORDER BY created_at DESC`)
        if err != nil {
                http.Error(w, "internal server error", 500)
                return
        }
        defer rows.Close()
        var rules []PortRule
        for rows.Next() {
                var rule PortRule
                var enabled int
                if err := rows.Scan(&rule.ID, &rule.Port, &rule.Protocol, &rule.Action, &rule.Source, &rule.Comment, &rule.CreatedAt, &enabled); err != nil {
                        continue
                }
                rule.Enabled = enabled == 1
                rules = append(rules, rule)
        }
        if rules == nil {
                rules = []PortRule{}
        }
        writeJSON(w, rules)
}

func (s *Server) handlePortsRuleCreate(w http.ResponseWriter, r *http.Request) {
        s.ensurePortRulesTable()
        var inp PortRuleInput
        if err := json.NewDecoder(r.Body).Decode(&inp); err != nil {
                http.Error(w, "invalid JSON", 400)
                return
        }
        if inp.Port <= 0 || inp.Port > 65535 {
                http.Error(w, "port out of range", 400)
                return
        }
        if inp.Protocol == "" {
                inp.Protocol = "tcp"
        }
        if inp.Action != "allow" && inp.Action != "block" {
                http.Error(w, "action must be 'allow' or 'block'", 400)
                return
        }
        if inp.Source == "" {
                inp.Source = "any"
        }

        id := genPortRuleID()
        now := time.Now().UTC().Format(time.RFC3339)

        _, err := s.db.SQL.Exec(`INSERT INTO port_rules (id,port,protocol,action,source,comment,created_at,enabled) VALUES (?,?,?,?,?,?,?,1)`,
                id, inp.Port, inp.Protocol, inp.Action, inp.Source, inp.Comment, now)
        if err != nil {
                http.Error(w, "internal server error", 500)
                return
        }

        // Apply to firewall
        portStr := strconv.Itoa(inp.Port)
        if aerr := applyIPTablesRule(inp.Action, portStr, inp.Protocol, inp.Source); aerr != nil {
                log.Printf("[ports] iptables error (non-fatal): %v", aerr)
        }
        applyUFWRule(inp.Action, portStr, inp.Protocol, inp.Source)

        writeJSON(w, map[string]interface{}{"ok": true, "id": id})
}

func (s *Server) handlePortsRuleDelete(w http.ResponseWriter, r *http.Request) {
        s.ensurePortRulesTable()
        id := r.PathValue("id")

        var rule PortRule
        var enabled int
        err := s.db.SQL.QueryRow(`SELECT id,port,protocol,action,source,comment,created_at,enabled FROM port_rules WHERE id=?`, id).
                Scan(&rule.ID, &rule.Port, &rule.Protocol, &rule.Action, &rule.Source, &rule.Comment, &rule.CreatedAt, &enabled)
        if err == sql.ErrNoRows {
                http.Error(w, "not found", 404)
                return
        }
        if err != nil {
                http.Error(w, "internal server error", 500)
                return
        }

        s.db.SQL.Exec(`DELETE FROM port_rules WHERE id=?`, id) //nolint:errcheck

        // Remove from firewall
        portStr := strconv.Itoa(rule.Port)
        removeIPTablesRule(rule.Action, portStr, rule.Protocol, rule.Source)
        removeUFWRule(rule.Action, portStr, rule.Protocol, rule.Source)

        writeJSON(w, map[string]bool{"ok": true})
}

func (s *Server) handlePortsRuleToggle(w http.ResponseWriter, r *http.Request) {
        s.ensurePortRulesTable()
        id := r.PathValue("id")

        var rule PortRule
        var enabled int
        err := s.db.SQL.QueryRow(`SELECT id,port,protocol,action,source,comment,created_at,enabled FROM port_rules WHERE id=?`, id).
                Scan(&rule.ID, &rule.Port, &rule.Protocol, &rule.Action, &rule.Source, &rule.Comment, &rule.CreatedAt, &enabled)
        if err == sql.ErrNoRows {
                http.Error(w, "not found", 404)
                return
        }
        if err != nil {
                http.Error(w, "internal server error", 500)
                return
        }

        newEnabled := 1
        if enabled == 1 {
                newEnabled = 0
        }
        s.db.SQL.Exec(`UPDATE port_rules SET enabled=? WHERE id=?`, newEnabled, id) //nolint:errcheck

        portStr := strconv.Itoa(rule.Port)
        if newEnabled == 1 {
                applyIPTablesRule(rule.Action, portStr, rule.Protocol, rule.Source)  //nolint:errcheck
                applyUFWRule(rule.Action, portStr, rule.Protocol, rule.Source)
        } else {
                removeIPTablesRule(rule.Action, portStr, rule.Protocol, rule.Source)
                removeUFWRule(rule.Action, portStr, rule.Protocol, rule.Source)
        }

        writeJSON(w, map[string]interface{}{"ok": true, "enabled": newEnabled == 1})
}

func (s *Server) handlePortsScan(w http.ResponseWriter, r *http.Request) {
        type ScanRequest struct {
                Target    string `json:"target"`
                PortRange string `json:"port_range"`
        }
        var req ScanRequest
        json.NewDecoder(r.Body).Decode(&req) //nolint:errcheck
        if req.Target == "" {
                req.Target = "127.0.0.1"
        }
        if req.PortRange == "" {
                req.PortRange = "1-10000"
        }

        type ScanResult struct {
                Port        int    `json:"port"`
                Protocol    string `json:"protocol"`
                State       string `json:"state"`
                ServiceName string `json:"service_name"`
        }

        var results []ScanResult

        // Try nmap first
        nmapOut, err := exec.Command("nmap", "-T4", "-p", req.PortRange, "--open", "-n", req.Target).Output()
        if err == nil {
                scanner := bufio.NewScanner(strings.NewReader(string(nmapOut)))
                for scanner.Scan() {
                        line := scanner.Text()
                        // parse "80/tcp open http"
                        fields := strings.Fields(line)
                        if len(fields) < 3 {
                                continue
                        }
                        if fields[1] != "open" {
                                continue
                        }
                        pp := strings.Split(fields[0], "/")
                        if len(pp) != 2 {
                                continue
                        }
                        port, err := strconv.Atoi(pp[0])
                        if err != nil {
                                continue
                        }
                        svcName := ""
                        if len(fields) >= 3 {
                                svcName = fields[2]
                        }
                        if svcName == "" {
                                svcName = portServiceName(port, "")
                        }
                        results = append(results, ScanResult{
                                Port:        port,
                                Protocol:    pp[1],
                                State:       "open",
                                ServiceName: svcName,
                        })
                }
        } else {
                // Fallback: use listening ports data
                ports := collectListeningPorts()
                for _, p := range ports {
                        results = append(results, ScanResult{
                                Port:        p.Port,
                                Protocol:    p.Protocol,
                                State:       "open",
                                ServiceName: p.ServiceName,
                        })
                }
        }

        if results == nil {
                results = []ScanResult{}
        }
        writeJSON(w, map[string]interface{}{"results": results, "target": req.Target, "scanned_at": time.Now().UTC().Format(time.RFC3339)})
}

func (s *Server) handlePortsProcesses(w http.ResponseWriter, r *http.Request) {
        ports := collectListeningPorts()
        conns := collectConnections()

        procMap := map[string]*ProcessPort{}
        for _, p := range ports {
                key := p.ProcessName
                if key == "" {
                        key = "kernel"
                }
                if _, ok := procMap[key]; !ok {
                        procMap[key] = &ProcessPort{ProcessName: key, PID: p.ProcessPID}
                }
                procMap[key].PortCount++
                procMap[key].Ports = append(procMap[key].Ports, p.Port)
        }
        for _, c := range conns {
                key := c.ProcessName
                if key == "" {
                        continue
                }
                if _, ok := procMap[key]; !ok {
                        procMap[key] = &ProcessPort{ProcessName: key, PID: c.ProcessPID}
                }
        }

        var list []ProcessPort
        for _, pp := range procMap {
                list = append(list, *pp)
        }
        sort.Slice(list, func(i, j int) bool {
                return list[i].PortCount > list[j].PortCount
        })
        if list == nil {
                list = []ProcessPort{}
        }
        writeJSON(w, list)
}
