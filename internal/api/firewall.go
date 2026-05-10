// Package api — Advanced Firewall backend service.
// Provides full CRUD for UFW rules, NAT/port-forwarding, Fail2ban jails & banned IPs,
// real-time log streaming via WebSocket, packet-hit simulation, and background agents.
package api

import (
        "context"
        "crypto/rand"
        "database/sql"
        "encoding/hex"
        "encoding/json"
        "fmt"
        "log"
        "net/http"
        "os/exec"
        "regexp"
        "strconv"
        "strings"
        "sync"
        "sync/atomic"
        "time"

        "github.com/gorilla/websocket"
)

// ─────────────────────────────────────────────────────────────────────────────
// Domain types (mirrors the frontend firewallData.ts interfaces)
// ─────────────────────────────────────────────────────────────────────────────

type FWRule struct {
        ID           string `json:"id"`
        Order        int    `json:"order"`
        Direction    string `json:"direction"`
        Protocol     string `json:"protocol"`
        Port         string `json:"port"`
        PortLabel    string `json:"portLabel"`
        SourceIP     string `json:"sourceIp"`
        DestIP       string `json:"destIp"`
        Iface        string `json:"iface"`
        Action       string `json:"action"`
        Logging      string `json:"logging"`
        Comment      string `json:"comment"`
        Created      string `json:"created"`
        Hits         int64  `json:"hits"`
        ServiceColor string `json:"serviceColor,omitempty"`
}

type FWRuleInput struct {
        Direction    string `json:"direction"`
        Protocol     string `json:"protocol"`
        Port         string `json:"port"`
        PortLabel    string `json:"portLabel"`
        SourceIP     string `json:"sourceIp"`
        DestIP       string `json:"destIp"`
        Iface        string `json:"iface"`
        Action       string `json:"action"`
        Logging      string `json:"logging"`
        Comment      string `json:"comment"`
        ServiceColor string `json:"serviceColor"`
}

type FWNATRule struct {
        ID         string `json:"id"`
        PublicPort int    `json:"publicPort"`
        Proto      string `json:"proto"`
        DestIP     string `json:"destIp"`
        DestPort   int    `json:"destPort"`
        Comment    string `json:"comment"`
        Enabled    bool   `json:"enabled"`
}

type FWAppProfile struct {
        ID      string `json:"id"`
        Name    string `json:"name"`
        Ports   string `json:"ports"`
        Proto   string `json:"proto"`
        Service string `json:"service"`
        Enabled bool   `json:"enabled"`
        Color   string `json:"color"`
}

type FWJail struct {
        Name        string `json:"name"`
        Status      string `json:"status"`
        Banned      int    `json:"banned"`
        Failed      int    `json:"failed"`
        TotalFailed int    `json:"totalFailed"`
        Filter      string `json:"filter"`
}

type FWBannedIP struct {
        IP       string `json:"ip"`
        Jail     string `json:"jail"`
        Since    string `json:"since"`
        Attempts int    `json:"attempts"`
        Country  string `json:"country"`
}

type FWLogEntry struct {
        ID      string `json:"id"`
        Ts      string `json:"ts"`
        Type    string `json:"type"`
        Iface   string `json:"iface"`
        SrcIP   string `json:"srcIp"`
        DstIP   string `json:"dstIp"`
        SrcPort int    `json:"srcPort"`
        DstPort int    `json:"dstPort"`
        Proto   string `json:"proto"`
        Rule    string `json:"rule,omitempty"`
}

type FWStatus struct {
        Backend        string `json:"backend"`
        Status         string `json:"status"`
        IPv6           bool   `json:"ipv6"`
        DefaultIn      string `json:"defaultIn"`
        DefaultOut     string `json:"defaultOut"`
        DefaultFwd     string `json:"defaultFwd"`
        ActiveRules    int    `json:"activeRules"`
        PacketsAllowed int64  `json:"packetsAllowed"`
        PacketsBlocked int64  `json:"packetsBlocked"`
        LastLog        string `json:"lastLog"`
}

type FWStats struct {
        TotalRules     int                `json:"totalRules"`
        AllowRules     int                `json:"allowRules"`
        DenyRules      int                `json:"denyRules"`
        LimitRules     int                `json:"limitRules"`
        NatRules       int                `json:"natRules"`
        BannedIPs      int                `json:"bannedIPs"`
        PacketsAllowed int64              `json:"packetsAllowed"`
        PacketsBlocked int64              `json:"packetsBlocked"`
        PacketsLimited int64              `json:"packetsLimited"`
        TopBlockedIPs  []TopIP            `json:"topBlockedIPs"`
        LogsByType     map[string]int     `json:"logsByType"`
        HitsTimeline   []HitsTimepoint    `json:"hitsTimeline"`
}

type TopIP struct {
        IP    string `json:"ip"`
        Hits  int    `json:"hits"`
        Jail  string `json:"jail,omitempty"`
}

type HitsTimepoint struct {
        Ts      string `json:"ts"`
        Allowed int64  `json:"allowed"`
        Blocked int64  `json:"blocked"`
}

// ─────────────────────────────────────────────────────────────────────────────
// Global packet counters (atomic, updated by background hit simulator)
// ─────────────────────────────────────────────────────────────────────────────

var (
        fwPacketsAllowed atomic.Int64
        fwPacketsBlocked atomic.Int64
        fwPacketsLimited atomic.Int64
        fwLastLogTime    atomic.Value // stores string
)

// ─────────────────────────────────────────────────────────────────────────────
// Live log WebSocket hub
// ─────────────────────────────────────────────────────────────────────────────

type fwLogHub struct {
        mu      sync.RWMutex
        clients map[chan FWLogEntry]struct{}
}

var globalFWHub = &fwLogHub{
        clients: make(map[chan FWLogEntry]struct{}),
}

func (h *fwLogHub) subscribe() chan FWLogEntry {
        ch := make(chan FWLogEntry, 128)
        h.mu.Lock()
        h.clients[ch] = struct{}{}
        h.mu.Unlock()
        return ch
}

func (h *fwLogHub) unsubscribe(ch chan FWLogEntry) {
        h.mu.Lock()
        delete(h.clients, ch)
        close(ch)
        h.mu.Unlock()
}

func (h *fwLogHub) broadcast(e FWLogEntry) {
        h.mu.RLock()
        defer h.mu.RUnlock()
        for ch := range h.clients {
                select {
                case ch <- e:
                default:
                }
        }
}

// ─────────────────────────────────────────────────────────────────────────────
// ID helpers
// ─────────────────────────────────────────────────────────────────────────────

func newID(prefix string) string {
        b := make([]byte, 6)
        if _, err := rand.Read(b); err == nil {
                return prefix + hex.EncodeToString(b)
        }
        return fmt.Sprintf("%s%d", prefix, time.Now().UnixNano())
}

// ─────────────────────────────────────────────────────────────────────────────
// UFW integration helpers
// ─────────────────────────────────────────────────────────────────────────────

func ufwAvailable() bool {
        _, err := exec.LookPath("ufw")
        return err == nil
}

// ── nftables / iptables fallback helpers ─────────────────────────────────────

func nftAvailable() bool {
        _, err := exec.LookPath("nft")
        return err == nil
}

func nftEnabled() bool {
        if !nftAvailable() {
                return false
        }
        out, err := exec.Command("nft", "list", "ruleset").Output()
        if err != nil {
                return false
        }
        return len(strings.TrimSpace(string(out))) > 0
}

func iptablesAvailable() bool {
        _, err := exec.LookPath("iptables")
        return err == nil
}

func iptablesEnabled() bool {
        if !iptablesAvailable() {
                return false
        }
        out, err := exec.Command("iptables", "-L", "-n").Output()
        if err != nil {
                return false
        }
        // If there are DROP or REJECT rules, consider it active
        return strings.Contains(string(out), "DROP") || strings.Contains(string(out), "REJECT")
}

func detectFirewallBackend() string {
        if ufwAvailable() {
                return ufwVersion()
        }
        if nftAvailable() {
                out, _ := exec.Command("nft", "--version").Output()
                v := strings.TrimSpace(string(out))
                if fields := strings.Fields(v); len(fields) >= 2 {
                        return "nftables " + fields[1]
                }
                return "nftables"
        }
        if iptablesAvailable() {
                out, _ := exec.Command("iptables", "--version").Output()
                v := strings.TrimSpace(string(out))
                if v != "" {
                        return v
                }
                return "iptables"
        }
        return "none"
}

func detectFirewallEnabled() bool {
        if ufwAvailable() {
                return ufwEnabled()
        }
        if nftEnabled() {
                return true
        }
        return iptablesEnabled()
}

func ufwEnabled() bool {
        if !ufwAvailable() {
                return false
        }
        out, err := exec.Command("ufw", "status").Output()
        if err != nil {
                return false
        }
        return strings.Contains(strings.ToLower(string(out)), "status: active")
}

func ufwVersion() string {
        if !ufwAvailable() {
                return "UFW (simulated)"
        }
        out, err := exec.Command("ufw", "version").Output()
        if err != nil {
                return "UFW"
        }
        lines := strings.Split(strings.TrimSpace(string(out)), "\n")
        if len(lines) > 0 {
                return strings.TrimSpace(lines[0])
        }
        return "UFW"
}

func ufwIPv6Enabled() bool {
        out, err := exec.Command("ufw", "status", "verbose").Output()
        if err != nil {
                return true
        }
        return strings.Contains(strings.ToLower(string(out)), "ipv6: yes")
}

func ufwDefaultPolicies(db *sql.DB) (inP, outP, fwdP string) {
        inP, outP, fwdP = "deny", "allow", "deny"
        // Try real UFW first
        if ufwAvailable() {
                out, err := exec.Command("ufw", "status", "verbose").Output()
                if err == nil {
                        for _, line := range strings.Split(string(out), "\n") {
                                lower := strings.ToLower(line)
                                if !strings.HasPrefix(lower, "default:") {
                                        continue
                                }
                                parts := strings.SplitN(line, ":", 2)
                                if len(parts) < 2 {
                                        continue
                                }
                                for _, tok := range strings.Split(parts[1], ",") {
                                        tok = strings.TrimSpace(strings.ToLower(tok))
                                        if strings.Contains(tok, "incoming") {
                                                if strings.HasPrefix(tok, "allow") {
                                                        inP = "allow"
                                                } else {
                                                        inP = "deny"
                                                }
                                        } else if strings.Contains(tok, "outgoing") {
                                                if strings.HasPrefix(tok, "allow") {
                                                        outP = "allow"
                                                } else {
                                                        outP = "deny"
                                                }
                                        } else if strings.Contains(tok, "routed") || strings.Contains(tok, "forward") {
                                                if strings.HasPrefix(tok, "allow") {
                                                        fwdP = "allow"
                                                } else {
                                                        fwdP = "deny"
                                                }
                                        }
                                }
                        }
                        return
                }
        }
        // Fall back to DB-stored state
        if db != nil {
                db.QueryRow(`SELECT value FROM fw_state WHERE key='default_in'`).Scan(&inP)   //nolint:errcheck
                db.QueryRow(`SELECT value FROM fw_state WHERE key='default_out'`).Scan(&outP) //nolint:errcheck
                db.QueryRow(`SELECT value FROM fw_state WHERE key='default_fwd'`).Scan(&fwdP) //nolint:errcheck
        }
        return
}

func ufwApplyRule(rule FWRule) error {
        if !ufwAvailable() {
                return nil // simulated
        }
        args := buildUFWArgs(rule)
        out, err := exec.Command("ufw", args...).CombinedOutput()
        if err != nil {
                return fmt.Errorf("ufw %s: %s", strings.Join(args, " "), string(out))
        }
        return nil
}

func ufwDeleteRule(order int) error {
        if !ufwAvailable() {
                return nil
        }
        out, err := exec.Command("ufw", "--force", "delete", strconv.Itoa(order)).CombinedOutput()
        if err != nil {
                return fmt.Errorf("ufw delete %d: %s", order, string(out))
        }
        return nil
}

func buildUFWArgs(rule FWRule) []string {
        args := []string{rule.Action}
        if rule.Direction == "in" {
                args = append(args, "in")
        } else if rule.Direction == "out" {
                args = append(args, "out")
        }
        if rule.Iface != "" && rule.Iface != "any" {
                args = append(args, "on", rule.Iface)
        }
        if rule.SourceIP != "" && rule.SourceIP != "anywhere" && rule.SourceIP != "any" {
                args = append(args, "from", rule.SourceIP)
        }
        if rule.DestIP != "" && rule.DestIP != "anywhere" && rule.DestIP != "any" {
                args = append(args, "to", rule.DestIP)
        } else if rule.Port != "" {
                args = append(args, "to", "any")
        }
        if rule.Port != "" {
                args = append(args, "port", rule.Port)
        }
        if rule.Protocol != "" && rule.Protocol != "both" && rule.Protocol != "any" {
                args = append(args, "proto", rule.Protocol)
        }
	if rule.Comment != "" {
		// Strip dangerous characters from comment to prevent command injection
		safeComment := strings.Map(func(r rune) rune {
			if r > 127 || r == '\'' || r == '"' || r == ';' || r == '|' || r == '`' || r == '$' || r == '\\' {
				return -1
			}
			return r
		}, rule.Comment)
		safeComment = strings.TrimSpace(safeComment)
		if safeComment != "" {
			args = append(args, "comment", safeComment)
		}
	}
	return args
}

func buildUFWCommand(rule FWRule) string {
        return "ufw " + strings.Join(buildUFWArgs(rule), " ")
}

// ─────────────────────────────────────────────────────────────────────────────
// Fail2ban integration helpers
// ─────────────────────────────────────────────────────────────────────────────

var f2bBannedRe = regexp.MustCompile(`Currently banned:\s+(\d+)`)
var f2bFailedRe = regexp.MustCompile(`Currently failed:\s+(\d+)`)
var f2bTotalRe = regexp.MustCompile(`Total failed:\s+(\d+)`)
var f2bIPRe = regexp.MustCompile(`Banned IP list:\s+(.*)`)

func f2bAvailable() bool {
        _, err := exec.LookPath("fail2ban-client")
        return err == nil
}

func f2bListJails() []string {
        if !f2bAvailable() {
                return nil
        }
        out, err := exec.Command("fail2ban-client", "status").Output()
        if err != nil {
                return nil
        }
        var names []string
        for _, line := range strings.Split(string(out), "\n") {
                if strings.Contains(line, "Jail list:") {
                        parts := strings.SplitN(line, ":", 2)
                        if len(parts) == 2 {
                                for _, j := range strings.Split(parts[1], ",") {
                                        if name := strings.TrimSpace(j); name != "" {
                                                names = append(names, name)
                                        }
                                }
                        }
                }
        }
        return names
}

func f2bJailStatus(name string) (banned, failed, total int, ips []string) {
        out, err := exec.Command("fail2ban-client", "status", name).Output()
        if err != nil {
                return
        }
        body := string(out)
        if m := f2bBannedRe.FindStringSubmatch(body); len(m) > 1 {
                banned, _ = strconv.Atoi(m[1])
        }
        if m := f2bFailedRe.FindStringSubmatch(body); len(m) > 1 {
                failed, _ = strconv.Atoi(m[1])
        }
        if m := f2bTotalRe.FindStringSubmatch(body); len(m) > 1 {
                total, _ = strconv.Atoi(m[1])
        }
        if m := f2bIPRe.FindStringSubmatch(body); len(m) > 1 {
                for _, ip := range strings.Fields(m[1]) {
                        if ip != "" {
                                ips = append(ips, ip)
                        }
                }
        }
        return
}

func f2bBanIP(ip, jail string) error {
        // Defence-in-depth: validate even though callers should already validate
        if err := validateIP(ip); err != nil {
                return err
        }
        if err := validateJailName(jail); err != nil {
                return err
        }
        if !f2bAvailable() {
                return nil
        }
        out, err := exec.Command("fail2ban-client", "set", jail, "banip", ip).CombinedOutput()
        if err != nil {
                return fmt.Errorf("fail2ban-client ban %s: %s", ip, string(out))
        }
        return nil
}

func f2bUnbanIP(ip, jail string) error {
        // Defence-in-depth: validate even though callers should already validate
        if err := validateIP(ip); err != nil {
                return err
        }
        if err := validateJailName(jail); err != nil {
                return err
        }
        if !f2bAvailable() {
                return nil
        }
        out, err := exec.Command("fail2ban-client", "set", jail, "unbanip", ip).CombinedOutput()
        if err != nil {
                return fmt.Errorf("fail2ban-client unban %s: %s", ip, string(out))
        }
        return nil
}

// ─────────────────────────────────────────────────────────────────────────────
// initFirewallState ensures default policy keys exist — no mock data is inserted.
// ─────────────────────────────────────────────────────────────────────────────

func (s *Server) fwSeedIfEmpty(ctx context.Context) {
        // Only write the four policy defaults; never insert fake rules/profiles/logs.
        s.db.SQL.ExecContext(ctx, `INSERT OR IGNORE INTO fw_state (key,value) VALUES ('default_in','deny')`)   //nolint:errcheck
        s.db.SQL.ExecContext(ctx, `INSERT OR IGNORE INTO fw_state (key,value) VALUES ('default_out','allow')`) //nolint:errcheck
        s.db.SQL.ExecContext(ctx, `INSERT OR IGNORE INTO fw_state (key,value) VALUES ('default_fwd','deny')`)  //nolint:errcheck
        s.db.SQL.ExecContext(ctx, `INSERT OR IGNORE INTO fw_state (key,value) VALUES ('enabled','false')`)     //nolint:errcheck
        log.Println("[firewall] default policy state ensured")
}

var logIDCounter atomic.Int64

// ─────────────────────────────────────────────────────────────────────────────
// Background agent: fail2ban jail syncer
// Syncs real fail2ban state into the DB every 30 seconds
// ─────────────────────────────────────────────────────────────────────────────

func (s *Server) runFirewallF2BSyncer(ctx context.Context) {
        ticker := time.NewTicker(30 * time.Second)
        defer ticker.Stop()
        for {
                select {
                case <-ctx.Done():
                        return
                case <-ticker.C:
                        if !f2bAvailable() {
                                continue
                        }
                        names := f2bListJails()
                        for _, name := range names {
                                banned, failed, total, _ := f2bJailStatus(name)
                                s.db.SQL.ExecContext(ctx, //nolint:errcheck
                                        `INSERT INTO fw_jails (name,status,banned,failed,total_failed,filter) VALUES (?,?,?,?,?,?)
                     ON CONFLICT(name) DO UPDATE SET status='active',banned=excluded.banned,failed=excluded.failed,total_failed=excluded.total_failed`,
                                        name, "active", banned, failed, total, name,
                                )
                        }
                }
        }
}

// ─────────────────────────────────────────────────────────────────────────────
// Startup: seed + launch background agents
// Called once from Server.Run
// ─────────────────────────────────────────────────────────────────────────────

func (s *Server) startFirewallAgents(ctx context.Context) {
        s.fwSeedIfEmpty(ctx)
        go s.runFirewallF2BSyncer(ctx)
}

// ─────────────────────────────────────────────────────────────────────────────
// DB helpers
// ─────────────────────────────────────────────────────────────────────────────

func (s *Server) fwListRules(ctx context.Context) ([]FWRule, error) {
        rows, err := s.db.SQL.QueryContext(ctx,
                `SELECT id,ord,direction,protocol,port,port_label,source_ip,dest_ip,iface,action,logging,comment,hits,service_color,created_at
         FROM fw_rules ORDER BY ord ASC, created_at ASC`,
        )
        if err != nil {
                return nil, err
        }
        defer rows.Close()
        var rules []FWRule
        for rows.Next() {
                var r FWRule
                var createdAt int64
                var color string
                rows.Scan(&r.ID, &r.Order, &r.Direction, &r.Protocol, &r.Port, &r.PortLabel, //nolint:errcheck
                        &r.SourceIP, &r.DestIP, &r.Iface, &r.Action, &r.Logging, &r.Comment, &r.Hits, &color, &createdAt)
                r.Created = time.Unix(createdAt, 0).Format("2006-01-02")
                if color != "" {
                        r.ServiceColor = color
                }
                rules = append(rules, r)
        }
        if rules == nil {
                rules = []FWRule{}
        }
        return rules, nil
}

func (s *Server) fwGetRule(ctx context.Context, id string) (FWRule, error) {
        var r FWRule
        var createdAt int64
        var color string
        err := s.db.SQL.QueryRowContext(ctx,
                `SELECT id,ord,direction,protocol,port,port_label,source_ip,dest_ip,iface,action,logging,comment,hits,service_color,created_at
         FROM fw_rules WHERE id=?`, id,
        ).Scan(&r.ID, &r.Order, &r.Direction, &r.Protocol, &r.Port, &r.PortLabel,
                &r.SourceIP, &r.DestIP, &r.Iface, &r.Action, &r.Logging, &r.Comment, &r.Hits, &color, &createdAt)
        if err != nil {
                return FWRule{}, err
        }
        r.Created = time.Unix(createdAt, 0).Format("2006-01-02")
        if color != "" {
                r.ServiceColor = color
        }
        return r, nil
}

func (s *Server) fwMaxOrder(ctx context.Context) int {
        var max int
        s.db.SQL.QueryRowContext(ctx, `SELECT COALESCE(MAX(ord),0) FROM fw_rules`).Scan(&max) //nolint:errcheck
        return max
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP Handlers — Firewall Status & Control
// ─────────────────────────────────────────────────────────────────────────────

func (s *Server) handleFirewallStatus(w http.ResponseWriter, r *http.Request) {
        ctx := r.Context()

        // Firewall status — detect actual backend (UFW / nftables / iptables)
        isEnabled := detectFirewallEnabled()
        if !ufwAvailable() && !nftAvailable() && !iptablesAvailable() {
                // No known firewall binary: fall back to stored DB state
                var val string
                s.db.SQL.QueryRowContext(ctx, `SELECT value FROM fw_state WHERE key='enabled'`).Scan(&val) //nolint:errcheck
                isEnabled = val != "false"
        }

        defaultIn, defaultOut, defaultFwd := ufwDefaultPolicies(s.db.SQL)

        var count int
        s.db.SQL.QueryRowContext(ctx, `SELECT COUNT(*) FROM fw_rules`).Scan(&count) //nolint:errcheck

        lastLog := ""
        if v := fwLastLogTime.Load(); v != nil {
                lastLog, _ = v.(string)
        }
        if lastLog == "" {
                s.db.SQL.QueryRowContext(ctx, `SELECT ts FROM fw_logs ORDER BY created_at DESC LIMIT 1`).Scan(&lastLog) //nolint:errcheck
        }

        status := FWStatus{
                Backend:        detectFirewallBackend(),
                Status:         map[bool]string{true: "active", false: "inactive"}[isEnabled],
                IPv6:           ufwIPv6Enabled(),
                DefaultIn:      defaultIn,
                DefaultOut:     defaultOut,
                DefaultFwd:     defaultFwd,
                ActiveRules:    count,
                PacketsAllowed: fwPacketsAllowed.Load(),
                PacketsBlocked: fwPacketsBlocked.Load(),
                LastLog:        lastLog,
        }
        writeJSON(w, status)
}

func (s *Server) handleFirewallEnable(w http.ResponseWriter, r *http.Request) {
        if ufwAvailable() {
                out, err := exec.Command("ufw", "--force", "enable").CombinedOutput()
                if err != nil {
                        http.Error(w, "ufw enable failed", http.StatusInternalServerError)
                        return
                }
        }
        s.db.SQL.ExecContext(r.Context(), `INSERT OR REPLACE INTO fw_state (key,value) VALUES ('enabled','true')`) //nolint:errcheck
        w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleFirewallDisable(w http.ResponseWriter, r *http.Request) {
        if ufwAvailable() {
                out, err := exec.Command("ufw", "--force", "disable").CombinedOutput()
                if err != nil {
                        http.Error(w, "ufw disable failed", http.StatusInternalServerError)
                        return
                }
        }
        s.db.SQL.ExecContext(r.Context(), `INSERT OR REPLACE INTO fw_state (key,value) VALUES ('enabled','false')`) //nolint:errcheck
        w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleFirewallReset(w http.ResponseWriter, r *http.Request) {
        if ufwAvailable() {
                exec.Command("ufw", "--force", "reset").Run() //nolint:errcheck
        }
        s.db.SQL.ExecContext(r.Context(), `DELETE FROM fw_rules`)     //nolint:errcheck
        s.db.SQL.ExecContext(r.Context(), `DELETE FROM fw_nat_rules`) //nolint:errcheck
        w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleFirewallSetDefault(w http.ResponseWriter, r *http.Request) {
        var req struct {
                Policy    string `json:"policy"`
                Direction string `json:"direction"`
        }
        if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
                http.Error(w, "bad request", http.StatusBadRequest)
                return
        }
        if req.Policy == "" {
                req.Policy = "deny"
        }
        if req.Direction == "" {
                req.Direction = "incoming"
        }
        if err := validateFWPolicy(req.Policy); err != nil {
                http.Error(w, "invalid policy", http.StatusBadRequest)
                return
        }
        if err := validateFWDirection(req.Direction); err != nil {
                http.Error(w, "invalid direction", http.StatusBadRequest)
                return
        }
        if ufwAvailable() {
                out, err := exec.Command("ufw", "default", req.Policy, req.Direction).CombinedOutput()
                if err != nil {
                        _ = out
                        http.Error(w, "ufw default failed", http.StatusInternalServerError)
                        return
                }
        }
        key := map[string]string{"incoming": "default_in", "outgoing": "default_out", "routed": "default_fwd"}[req.Direction]
        if key == "" {
                key = "default_in"
        }
        s.db.SQL.ExecContext(r.Context(), `INSERT OR REPLACE INTO fw_state (key,value) VALUES (?,?)`, key, req.Policy) //nolint:errcheck
        w.WriteHeader(http.StatusNoContent)
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP Handlers — Firewall Rules CRUD
// ─────────────────────────────────────────────────────────────────────────────

func (s *Server) handleFirewallRules(w http.ResponseWriter, r *http.Request) {
        rules, err := s.fwListRules(r.Context())
        if err != nil {
                http.Error(w, "db error", http.StatusInternalServerError)
                return
        }
        writeJSON(w, rules)
}

func (s *Server) handleFirewallGetRule(w http.ResponseWriter, r *http.Request) {
        id := r.PathValue("id")
        rule, err := s.fwGetRule(r.Context(), id)
        if err == sql.ErrNoRows {
                http.Error(w, "not found", http.StatusNotFound)
                return
        }
        if err != nil {
                http.Error(w, "db error", http.StatusInternalServerError)
                return
        }
        writeJSON(w, rule)
}

func (s *Server) handleFirewallAddRule(w http.ResponseWriter, r *http.Request) {
        var inp FWRuleInput
        if err := json.NewDecoder(r.Body).Decode(&inp); err != nil {
                http.Error(w, "bad request", http.StatusBadRequest)
                return
        }
        // Validate action
        validActions := map[string]bool{"allow": true, "deny": true, "reject": true, "limit": true}
        if !validActions[inp.Action] {
                inp.Action = "allow"
        }
        // Validate network values before persisting to DB / passing to UFW
        if err := validateIPOrCIDR(inp.SourceIP); err != nil && inp.SourceIP != "" {
                http.Error(w, "invalid source IP or CIDR", http.StatusBadRequest)
                return
        }
        if err := validateIPOrCIDR(inp.DestIP); err != nil && inp.DestIP != "" {
                http.Error(w, "invalid destination IP or CIDR", http.StatusBadRequest)
                return
        }
        if err := validateFWProtocol(inp.Protocol); err != nil {
                http.Error(w, "invalid protocol", http.StatusBadRequest)
                return
        }
        if err := validatePortSpec(inp.Port); err != nil {
                http.Error(w, "invalid port specification", http.StatusBadRequest)
                return
        }
        if inp.Direction == "" {
                inp.Direction = "in"
        }
        if inp.Protocol == "" {
                inp.Protocol = "tcp"
        }
        if inp.Iface == "" {
                inp.Iface = "any"
        }
        if inp.Logging == "" {
                inp.Logging = "off"
        }
        if inp.SourceIP == "" {
                inp.SourceIP = "anywhere"
        }
        if inp.DestIP == "" {
                inp.DestIP = "any"
        }
        if inp.PortLabel == "" {
                inp.PortLabel = inp.Port
        }

        id := newID("r-")
        order := s.fwMaxOrder(r.Context()) + 1
        rule := FWRule{
                ID: id, Order: order, Direction: inp.Direction, Protocol: inp.Protocol,
                Port: inp.Port, PortLabel: inp.PortLabel, SourceIP: inp.SourceIP,
                DestIP: inp.DestIP, Iface: inp.Iface, Action: inp.Action,
                Logging: inp.Logging, Comment: inp.Comment, ServiceColor: inp.ServiceColor,
                Created: time.Now().Format("2006-01-02"), Hits: 0,
        }

        _, err := s.db.SQL.ExecContext(r.Context(),
                `INSERT INTO fw_rules (id,ord,direction,protocol,port,port_label,source_ip,dest_ip,iface,action,logging,comment,hits,service_color) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,0,?)`,
                id, order, rule.Direction, rule.Protocol, rule.Port, rule.PortLabel,
                rule.SourceIP, rule.DestIP, rule.Iface, rule.Action, rule.Logging, rule.Comment, rule.ServiceColor,
        )
        if err != nil {
                http.Error(w, "database error", http.StatusInternalServerError)
                return
        }

        // Apply to UFW in background (best-effort)
        go ufwApplyRule(rule) //nolint:errcheck

        w.WriteHeader(http.StatusCreated)
        writeJSON(w, rule)
}

func (s *Server) handleFirewallUpdateRule(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var inp FWRuleInput
	if err := json.NewDecoder(r.Body).Decode(&inp); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	if inp.Direction == "" {
		inp.Direction = "in"
	}
	if inp.Protocol == "" {
		inp.Protocol = "tcp"
	}
	if inp.Iface == "" {
		inp.Iface = "any"
	}
	if inp.Logging == "" {
		inp.Logging = "off"
	}
	if inp.PortLabel == "" {
		inp.PortLabel = inp.Port
	}

	// Validate network values before persisting
	if err := validateIPOrCIDR(inp.SourceIP); err != nil && inp.SourceIP != "" {
		http.Error(w, "invalid source IP or CIDR", http.StatusBadRequest)
		return
	}
	if err := validateIPOrCIDR(inp.DestIP); err != nil && inp.DestIP != "" {
		http.Error(w, "invalid destination IP or CIDR", http.StatusBadRequest)
		return
	}
	if err := validateFWProtocol(inp.Protocol); err != nil {
		http.Error(w, "invalid protocol", http.StatusBadRequest)
		return
	}
	if inp.Port != "" && inp.Port != "any" {
		if err := validatePortSpec(inp.Port); err != nil {
			http.Error(w, "invalid port specification", http.StatusBadRequest)
			return
		}
	}

	res, err := s.db.SQL.ExecContext(r.Context(),
		`UPDATE fw_rules SET direction=?,protocol=?,port=?,port_label=?,source_ip=?,dest_ip=?,iface=?,action=?,logging=?,comment=?,service_color=? WHERE id=?`,
		inp.Direction, inp.Protocol, inp.Port, inp.PortLabel, inp.SourceIP, inp.DestIP,
		inp.Iface, inp.Action, inp.Logging, inp.Comment, inp.ServiceColor, id,
	)
        if err != nil {
                http.Error(w, "db error", http.StatusInternalServerError)
                return
        }
        n, _ := res.RowsAffected()
        if n == 0 {
                http.Error(w, "not found", http.StatusNotFound)
                return
        }
        rule, _ := s.fwGetRule(r.Context(), id)
        writeJSON(w, rule)
}

func (s *Server) handleFirewallDeleteRule(w http.ResponseWriter, r *http.Request) {
        id := r.PathValue("id")
        // Get rule order for UFW delete
        var order int
        s.db.SQL.QueryRowContext(r.Context(), `SELECT ord FROM fw_rules WHERE id=?`, id).Scan(&order) //nolint:errcheck

        res, err := s.db.SQL.ExecContext(r.Context(), `DELETE FROM fw_rules WHERE id=?`, id)
        if err != nil {
                http.Error(w, "db error", http.StatusInternalServerError)
                return
        }
        n, _ := res.RowsAffected()
        if n == 0 {
                http.Error(w, "not found", http.StatusNotFound)
                return
        }
        go ufwDeleteRule(order) //nolint:errcheck
        w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleFirewallReorderRules(w http.ResponseWriter, r *http.Request) {
        var req struct {
                IDs []string `json:"ids"`
        }
        if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
                http.Error(w, "bad request", http.StatusBadRequest)
                return
        }
        tx, err := s.db.SQL.BeginTx(r.Context(), nil)
        if err != nil {
                http.Error(w, "tx error", http.StatusInternalServerError)
                return
        }
        defer tx.Rollback() //nolint:errcheck
        for i, id := range req.IDs {
                tx.ExecContext(r.Context(), `UPDATE fw_rules SET ord=? WHERE id=?`, i+1, id) //nolint:errcheck
        }
        if err := tx.Commit(); err != nil {
                http.Error(w, "commit error", http.StatusInternalServerError)
                return
        }
        w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleFirewallExportRules(w http.ResponseWriter, r *http.Request) {
        rules, err := s.fwListRules(r.Context())
        if err != nil {
                http.Error(w, "db error", http.StatusInternalServerError)
                return
        }
        w.Header().Set("Content-Disposition", "attachment; filename=firewall-rules.json")
        w.Header().Set("Content-Type", "application/json")
        enc := json.NewEncoder(w)
        enc.SetIndent("", "  ")
        enc.Encode(map[string]interface{}{ //nolint:errcheck
                "exported_at": time.Now().Format(time.RFC3339),
                "version":     "1",
                "rules":       rules,
        })
}

func (s *Server) handleFirewallImportRules(w http.ResponseWriter, r *http.Request) {
        var body struct {
                Rules []FWRuleInput `json:"rules"`
        }
        if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
                http.Error(w, "bad request", http.StatusBadRequest)
                return
        }
        ctx := r.Context()
        order := s.fwMaxOrder(ctx)
        var created []FWRule
        for _, inp := range body.Rules {
                // Validate all import fields
                if err := validateFWDirection(inp.Direction); err != nil {
                        http.Error(w, fmt.Sprintf("rule %q: invalid direction: %v", inp.Port, err), http.StatusBadRequest)
                        return
                }
                if err := validateFWProtocol(inp.Protocol); err != nil {
                        http.Error(w, fmt.Sprintf("rule %q: invalid protocol: %v", inp.Port, err), http.StatusBadRequest)
                        return
                }
                if err := validateFWPolicy(inp.Action); err != nil {
                        http.Error(w, fmt.Sprintf("rule %q: invalid action: %v", inp.Port, err), http.StatusBadRequest)
                        return
                }
                if err := validatePortSpec(inp.Port); err != nil {
                        http.Error(w, fmt.Sprintf("rule %q: invalid port: %v", inp.Port, err), http.StatusBadRequest)
                        return
                }
                if err := validateIPOrCIDR(inp.SourceIP); err != nil {
                        http.Error(w, fmt.Sprintf("rule %q: invalid source: %v", inp.Port, err), http.StatusBadRequest)
                        return
                }
                if err := validateIPOrCIDR(inp.DestIP); err != nil {
                        http.Error(w, fmt.Sprintf("rule %q: invalid dest: %v", inp.Port, err), http.StatusBadRequest)
                        return
                }
                if inp.Direction == "" {
                        inp.Direction = "in"
                }
                if inp.Protocol == "" {
                        inp.Protocol = "tcp"
                }
                if inp.Iface == "" {
                        inp.Iface = "any"
                }
                if inp.Logging == "" {
                        inp.Logging = "off"
                }
                if inp.Action == "" {
                        inp.Action = "allow"
                }
                order++
                id := newID("r-")
                rule := FWRule{
                        ID: id, Order: order, Direction: inp.Direction, Protocol: inp.Protocol,
                        Port: inp.Port, PortLabel: inp.PortLabel, SourceIP: inp.SourceIP,
                        DestIP: inp.DestIP, Iface: inp.Iface, Action: inp.Action,
                        Logging: inp.Logging, Comment: inp.Comment, ServiceColor: inp.ServiceColor,
                        Created: time.Now().Format("2006-01-02"), Hits: 0,
                }
                _, err := s.db.SQL.ExecContext(ctx,
                        `INSERT INTO fw_rules (id,ord,direction,protocol,port,port_label,source_ip,dest_ip,iface,action,logging,comment,hits,service_color) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,0,?)`,
                        id, order, rule.Direction, rule.Protocol, rule.Port, rule.PortLabel,
                        rule.SourceIP, rule.DestIP, rule.Iface, rule.Action, rule.Logging, rule.Comment, rule.ServiceColor,
                )
                if err == nil {
                        created = append(created, rule)
                }
        }
        if created == nil {
                created = []FWRule{}
        }
        w.WriteHeader(http.StatusCreated)
        writeJSON(w, created)
}

func (s *Server) handleFirewallRuleHits(w http.ResponseWriter, r *http.Request) {
        id := r.PathValue("id")
        var hits int64
        err := s.db.SQL.QueryRowContext(r.Context(), `SELECT hits FROM fw_rules WHERE id=?`, id).Scan(&hits)
        if err == sql.ErrNoRows {
                http.Error(w, "not found", http.StatusNotFound)
                return
        }
        writeJSON(w, map[string]int64{"id": 0, "hits": hits})
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP Handlers — App Profiles
// ─────────────────────────────────────────────────────────────────────────────

func (s *Server) handleFirewallProfiles(w http.ResponseWriter, r *http.Request) {
        rows, err := s.db.SQL.QueryContext(r.Context(),
                `SELECT id,name,ports,proto,service,enabled,color FROM fw_app_profiles ORDER BY name`,
        )
        if err != nil {
                http.Error(w, "db error", http.StatusInternalServerError)
                return
        }
        defer rows.Close()
        var profiles []FWAppProfile
        for rows.Next() {
                var p FWAppProfile
                var en int
                rows.Scan(&p.ID, &p.Name, &p.Ports, &p.Proto, &p.Service, &en, &p.Color) //nolint:errcheck
                p.Enabled = en == 1
                profiles = append(profiles, p)
        }
        if profiles == nil {
                profiles = []FWAppProfile{}
        }
        writeJSON(w, profiles)
}

func (s *Server) handleFirewallCreateProfile(w http.ResponseWriter, r *http.Request) {
        var inp struct {
                Name    string `json:"name"`
                Ports   string `json:"ports"`
                Proto   string `json:"proto"`
                Service string `json:"service"`
                Enabled bool   `json:"enabled"`
                Color   string `json:"color"`
        }
        if err := json.NewDecoder(r.Body).Decode(&inp); err != nil {
                http.Error(w, "bad request", http.StatusBadRequest)
                return
        }
        if inp.Name == "" {
                http.Error(w, "name required", http.StatusBadRequest)
                return
        }
        if inp.Proto == "" {
                inp.Proto = "tcp"
        }
        if inp.Color == "" {
                inp.Color = "#4a9eff"
        }
        id := newID("ap-")
        en := 0
        if inp.Enabled {
                en = 1
        }
        _, err := s.db.SQL.ExecContext(r.Context(),
                `INSERT INTO fw_app_profiles (id,name,ports,proto,service,enabled,color) VALUES (?,?,?,?,?,?,?)`,
                id, inp.Name, inp.Ports, inp.Proto, inp.Service, en, inp.Color,
        )
        if err != nil {
                http.Error(w, "database error", http.StatusInternalServerError)
                return
        }
        p := FWAppProfile{ID: id, Name: inp.Name, Ports: inp.Ports, Proto: inp.Proto, Service: inp.Service, Enabled: inp.Enabled, Color: inp.Color}
        w.WriteHeader(http.StatusCreated)
        writeJSON(w, p)
}

func (s *Server) handleFirewallUpdateProfile(w http.ResponseWriter, r *http.Request) {
        id := r.PathValue("id")
        var inp struct {
                Name    string `json:"name"`
                Ports   string `json:"ports"`
                Proto   string `json:"proto"`
                Service string `json:"service"`
                Enabled bool   `json:"enabled"`
                Color   string `json:"color"`
        }
        if err := json.NewDecoder(r.Body).Decode(&inp); err != nil {
                http.Error(w, "bad request", http.StatusBadRequest)
                return
        }
        en := 0
        if inp.Enabled {
                en = 1
        }
        res, err := s.db.SQL.ExecContext(r.Context(),
                `UPDATE fw_app_profiles SET name=?,ports=?,proto=?,service=?,enabled=?,color=? WHERE id=?`,
                inp.Name, inp.Ports, inp.Proto, inp.Service, en, inp.Color, id,
        )
        if err != nil {
                http.Error(w, "db error", http.StatusInternalServerError)
                return
        }
        n, _ := res.RowsAffected()
        if n == 0 {
                http.Error(w, "not found", http.StatusNotFound)
                return
        }
        writeJSON(w, FWAppProfile{ID: id, Name: inp.Name, Ports: inp.Ports, Proto: inp.Proto, Service: inp.Service, Enabled: inp.Enabled, Color: inp.Color})
}

func (s *Server) handleFirewallDeleteProfile(w http.ResponseWriter, r *http.Request) {
        id := r.PathValue("id")
        res, err := s.db.SQL.ExecContext(r.Context(), `DELETE FROM fw_app_profiles WHERE id=?`, id)
        if err != nil {
                http.Error(w, "db error", http.StatusInternalServerError)
                return
        }
        n, _ := res.RowsAffected()
        if n == 0 {
                http.Error(w, "not found", http.StatusNotFound)
                return
        }
        w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleFirewallToggleProfile(w http.ResponseWriter, r *http.Request) {
        id := r.PathValue("id")
        var en int
        s.db.SQL.QueryRowContext(r.Context(), `SELECT enabled FROM fw_app_profiles WHERE id=?`, id).Scan(&en) //nolint:errcheck
        newEn := 1
        if en == 1 {
                newEn = 0
        }
        res, err := s.db.SQL.ExecContext(r.Context(), `UPDATE fw_app_profiles SET enabled=? WHERE id=?`, newEn, id)
        if err != nil {
                http.Error(w, "db error", http.StatusInternalServerError)
                return
        }
        n, _ := res.RowsAffected()
        if n == 0 {
                http.Error(w, "not found", http.StatusNotFound)
                return
        }
        writeJSON(w, map[string]interface{}{"id": id, "enabled": newEn == 1})
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP Handlers — NAT / Port Forwarding
// ─────────────────────────────────────────────────────────────────────────────

func (s *Server) handleFirewallNATList(w http.ResponseWriter, r *http.Request) {
        rows, err := s.db.SQL.QueryContext(r.Context(),
                `SELECT id,public_port,proto,dest_ip,dest_port,comment,enabled FROM fw_nat_rules ORDER BY public_port`,
        )
        if err != nil {
                http.Error(w, "db error", http.StatusInternalServerError)
                return
        }
        defer rows.Close()
        var nats []FWNATRule
        for rows.Next() {
                var n FWNATRule
                var en int
                rows.Scan(&n.ID, &n.PublicPort, &n.Proto, &n.DestIP, &n.DestPort, &n.Comment, &en) //nolint:errcheck
                n.Enabled = en == 1
                nats = append(nats, n)
        }
        if nats == nil {
                nats = []FWNATRule{}
        }
        writeJSON(w, nats)
}

func (s *Server) handleFirewallNATCreate(w http.ResponseWriter, r *http.Request) {
        var inp struct {
                PublicPort int    `json:"publicPort"`
                Proto      string `json:"proto"`
                DestIP     string `json:"destIp"`
                DestPort   int    `json:"destPort"`
                Comment    string `json:"comment"`
                Enabled    bool   `json:"enabled"`
        }
        if err := json.NewDecoder(r.Body).Decode(&inp); err != nil {
                http.Error(w, "bad request", http.StatusBadRequest)
                return
        }
        if inp.PublicPort == 0 || inp.DestIP == "" || inp.DestPort == 0 {
                http.Error(w, "publicPort, destIp and destPort required", http.StatusBadRequest)
                return
        }
        if err := validateIP(inp.DestIP); err != nil {
                http.Error(w, "invalid destIp: "+err.Error(), http.StatusBadRequest)
                return
        }
        if inp.Proto == "" {
                inp.Proto = "tcp"
        }
        if err := validateFWProtocol(inp.Proto); err != nil {
                http.Error(w, err.Error(), http.StatusBadRequest)
                return
        }
        id := newID("nat-")
        en := 0
        if inp.Enabled {
                en = 1
        }
        _, err := s.db.SQL.ExecContext(r.Context(),
                `INSERT INTO fw_nat_rules (id,public_port,proto,dest_ip,dest_port,comment,enabled) VALUES (?,?,?,?,?,?,?)`,
                id, inp.PublicPort, inp.Proto, inp.DestIP, inp.DestPort, inp.Comment, en,
        )
        if err != nil {
                http.Error(w, "database error", http.StatusInternalServerError)
                return
        }
        nat := FWNATRule{ID: id, PublicPort: inp.PublicPort, Proto: inp.Proto, DestIP: inp.DestIP, DestPort: inp.DestPort, Comment: inp.Comment, Enabled: inp.Enabled}
        w.WriteHeader(http.StatusCreated)
        writeJSON(w, nat)
}

func (s *Server) handleFirewallNATUpdate(w http.ResponseWriter, r *http.Request) {
        id := r.PathValue("id")
        var inp struct {
                PublicPort int    `json:"publicPort"`
                Proto      string `json:"proto"`
                DestIP     string `json:"destIp"`
                DestPort   int    `json:"destPort"`
                Comment    string `json:"comment"`
                Enabled    bool   `json:"enabled"`
        }
        if err := json.NewDecoder(r.Body).Decode(&inp); err != nil {
                http.Error(w, "bad request", http.StatusBadRequest)
                return
        }
        if err := validateIP(inp.DestIP); err != nil {
                http.Error(w, "invalid destIp: "+err.Error(), http.StatusBadRequest)
                return
        }
        if err := validateFWProtocol(inp.Proto); err != nil {
                http.Error(w, err.Error(), http.StatusBadRequest)
                return
        }
        en := 0
        if inp.Enabled {
                en = 1
        }
        res, err := s.db.SQL.ExecContext(r.Context(),
                `UPDATE fw_nat_rules SET public_port=?,proto=?,dest_ip=?,dest_port=?,comment=?,enabled=? WHERE id=?`,
                inp.PublicPort, inp.Proto, inp.DestIP, inp.DestPort, inp.Comment, en, id,
        )
        if err != nil {
                http.Error(w, "db error", http.StatusInternalServerError)
                return
        }
        n, _ := res.RowsAffected()
        if n == 0 {
                http.Error(w, "not found", http.StatusNotFound)
                return
        }
        writeJSON(w, FWNATRule{ID: id, PublicPort: inp.PublicPort, Proto: inp.Proto, DestIP: inp.DestIP, DestPort: inp.DestPort, Comment: inp.Comment, Enabled: inp.Enabled})
}

func (s *Server) handleFirewallNATDelete(w http.ResponseWriter, r *http.Request) {
        id := r.PathValue("id")
        res, err := s.db.SQL.ExecContext(r.Context(), `DELETE FROM fw_nat_rules WHERE id=?`, id)
        if err != nil {
                http.Error(w, "db error", http.StatusInternalServerError)
                return
        }
        n, _ := res.RowsAffected()
        if n == 0 {
                http.Error(w, "not found", http.StatusNotFound)
                return
        }
        w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleFirewallNATToggle(w http.ResponseWriter, r *http.Request) {
        id := r.PathValue("id")
        var en int
        s.db.SQL.QueryRowContext(r.Context(), `SELECT enabled FROM fw_nat_rules WHERE id=?`, id).Scan(&en) //nolint:errcheck
        newEn := 1
        if en == 1 {
                newEn = 0
        }
        res, err := s.db.SQL.ExecContext(r.Context(), `UPDATE fw_nat_rules SET enabled=? WHERE id=?`, newEn, id)
        if err != nil {
                http.Error(w, "db error", http.StatusInternalServerError)
                return
        }
        n, _ := res.RowsAffected()
        if n == 0 {
                http.Error(w, "not found", http.StatusNotFound)
                return
        }
        writeJSON(w, map[string]interface{}{"id": id, "enabled": newEn == 1})
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP Handlers — Fail2ban
// ─────────────────────────────────────────────────────────────────────────────

func (s *Server) handleFirewallF2BJails(w http.ResponseWriter, r *http.Request) {
        // Try live fail2ban first
        if f2bAvailable() {
                names := f2bListJails()
                var jails []FWJail
                for _, name := range names {
                        banned, failed, total, _ := f2bJailStatus(name)
                        jails = append(jails, FWJail{Name: name, Status: "active", Banned: banned, Failed: failed, TotalFailed: total, Filter: name})
                }
                if jails != nil {
                        writeJSON(w, jails)
                        return
                }
        }
        // Fall back to DB
        rows, err := s.db.SQL.QueryContext(r.Context(),
                `SELECT name,status,banned,failed,total_failed,filter FROM fw_jails ORDER BY name`,
        )
        if err != nil {
                http.Error(w, "db error", http.StatusInternalServerError)
                return
        }
        defer rows.Close()
        var jails []FWJail
        for rows.Next() {
                var j FWJail
                rows.Scan(&j.Name, &j.Status, &j.Banned, &j.Failed, &j.TotalFailed, &j.Filter) //nolint:errcheck
                jails = append(jails, j)
        }
        if jails == nil {
                jails = []FWJail{}
        }
        writeJSON(w, jails)
}

func (s *Server) handleFirewallF2BToggleJail(w http.ResponseWriter, r *http.Request) {
        name := r.PathValue("name")
        var status string
        s.db.SQL.QueryRowContext(r.Context(), `SELECT status FROM fw_jails WHERE name=?`, name).Scan(&status) //nolint:errcheck

        newStatus := "active"
        if status == "active" {
                newStatus = "inactive"
        }
        if f2bAvailable() {
                action := map[string]string{"active": "start", "inactive": "stop"}[newStatus]
                exec.Command("fail2ban-client", action, name).Run() //nolint:errcheck
        }
        s.db.SQL.ExecContext(r.Context(), `UPDATE fw_jails SET status=? WHERE name=?`, newStatus, name) //nolint:errcheck
        writeJSON(w, map[string]string{"name": name, "status": newStatus})
}

func (s *Server) handleFirewallF2BBanned(w http.ResponseWriter, r *http.Request) {
        rows, err := s.db.SQL.QueryContext(r.Context(),
                `SELECT ip,jail,since,attempts,country FROM fw_banned_ips ORDER BY since DESC`,
        )
        if err != nil {
                http.Error(w, "db error", http.StatusInternalServerError)
                return
        }
        defer rows.Close()
        var banned []FWBannedIP
        for rows.Next() {
                var b FWBannedIP
                rows.Scan(&b.IP, &b.Jail, &b.Since, &b.Attempts, &b.Country) //nolint:errcheck
                banned = append(banned, b)
        }
        if banned == nil {
                banned = []FWBannedIP{}
        }
        writeJSON(w, banned)
}

func (s *Server) handleFirewallF2BBan(w http.ResponseWriter, r *http.Request) {
        var inp struct {
                IP      string `json:"ip"`
                Jail    string `json:"jail"`
                Country string `json:"country"`
        }
        if err := json.NewDecoder(r.Body).Decode(&inp); err != nil {
                http.Error(w, "bad request", http.StatusBadRequest)
                return
        }
        if inp.IP == "" {
                http.Error(w, "ip required", http.StatusBadRequest)
                return
        }
        if err := validateIP(inp.IP); err != nil {
                http.Error(w, "invalid IP address", http.StatusBadRequest)
                return
        }
        if inp.Jail == "" {
                inp.Jail = "sshd"
        }
        if err := validateJailName(inp.Jail); err != nil {
                http.Error(w, "invalid jail name", http.StatusBadRequest)
                return
        }
        since := time.Now().Format("2006-01-02 15:04")
        _, err := s.db.SQL.ExecContext(r.Context(),
                `INSERT OR REPLACE INTO fw_banned_ips (ip,jail,since,attempts,country) VALUES (?,?,?,1,?)`,
                inp.IP, inp.Jail, since, inp.Country,
        )
        if err != nil {
                http.Error(w, "db error", http.StatusInternalServerError)
                return
        }
        // Increment jail banned count
        s.db.SQL.ExecContext(r.Context(), `UPDATE fw_jails SET banned=banned+1 WHERE name=?`, inp.Jail) //nolint:errcheck
        // Try real fail2ban
        go f2bBanIP(inp.IP, inp.Jail) //nolint:errcheck
        b := FWBannedIP{IP: inp.IP, Jail: inp.Jail, Since: since, Attempts: 1, Country: inp.Country}
        w.WriteHeader(http.StatusCreated)
        writeJSON(w, b)
}

func (s *Server) handleFirewallF2BUnban(w http.ResponseWriter, r *http.Request) {
        ip := r.PathValue("ip")
        if err := validateIP(ip); err != nil {
                http.Error(w, "invalid IP address", http.StatusBadRequest)
                return
        }
        jail := r.URL.Query().Get("jail")
        if jail != "" {
                if err := validateJailName(jail); err != nil {
                        http.Error(w, "invalid jail name", http.StatusBadRequest)
                        return
                }
        }
        if jail == "" {
                s.db.SQL.QueryRowContext(r.Context(), `SELECT jail FROM fw_banned_ips WHERE ip=? LIMIT 1`, ip).Scan(&jail) //nolint:errcheck
        }
        res, err := s.db.SQL.ExecContext(r.Context(), `DELETE FROM fw_banned_ips WHERE ip=?`, ip)
        if err != nil {
                http.Error(w, "db error", http.StatusInternalServerError)
                return
        }
        n, _ := res.RowsAffected()
        if n == 0 {
                http.Error(w, "not found", http.StatusNotFound)
                return
        }
        // Decrement jail banned count
        if jail != "" {
                s.db.SQL.ExecContext(r.Context(), `UPDATE fw_jails SET banned=MAX(0,banned-1) WHERE name=?`, jail) //nolint:errcheck
                go f2bUnbanIP(ip, jail) //nolint:errcheck
        }
        w.WriteHeader(http.StatusNoContent)
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP Handlers — Firewall Logs
// ─────────────────────────────────────────────────────────────────────────────

func (s *Server) handleFirewallLogs(w http.ResponseWriter, r *http.Request) {
        q := r.URL.Query()
        logType := q.Get("type")     // BLOCK|ALLOW|LIMIT
        src := q.Get("src")          // filter by srcIp
        dst := q.Get("dst")          // filter by dstIp
        limitStr := q.Get("limit")
        offsetStr := q.Get("offset")

        limit := 100
        offset := 0
        if v, err := strconv.Atoi(limitStr); err == nil && v > 0 && v <= 1000 {
                limit = v
        }
        if v, err := strconv.Atoi(offsetStr); err == nil && v >= 0 {
                offset = v
        }

        query := `SELECT id,ts,type,iface,src_ip,dst_ip,src_port,dst_port,proto,rule_id FROM fw_logs WHERE 1=1`
        args := []interface{}{}
        if logType != "" {
                query += ` AND type=?`
                args = append(args, logType)
        }
        if src != "" {
                query += ` AND src_ip LIKE ?`
                args = append(args, "%"+src+"%")
        }
        if dst != "" {
                query += ` AND (dst_ip LIKE ? OR CAST(dst_port AS TEXT) LIKE ?)`
                args = append(args, "%"+dst+"%", "%"+dst+"%")
        }
        query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`
        args = append(args, limit, offset)

        rows, err := s.db.SQL.QueryContext(r.Context(), query, args...)
        if err != nil {
                http.Error(w, "db error", http.StatusInternalServerError)
                return
        }
        defer rows.Close()
        var logs []FWLogEntry
        for rows.Next() {
                var e FWLogEntry
                rows.Scan(&e.ID, &e.Ts, &e.Type, &e.Iface, &e.SrcIP, &e.DstIP, &e.SrcPort, &e.DstPort, &e.Proto, &e.Rule) //nolint:errcheck
                logs = append(logs, e)
        }
        if logs == nil {
                logs = []FWLogEntry{}
        }
        writeJSON(w, logs)
}

func (s *Server) handleFirewallClearLogs(w http.ResponseWriter, r *http.Request) {
        s.db.SQL.ExecContext(r.Context(), `DELETE FROM fw_logs`) //nolint:errcheck
        fwLastLogTime.Store("")
        w.WriteHeader(http.StatusNoContent)
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP Handlers — Stats
// ─────────────────────────────────────────────────────────────────────────────

func (s *Server) handleFirewallStats(w http.ResponseWriter, r *http.Request) {
        ctx := r.Context()

        var totalRules, allowRules, denyRules, limitRules int
        s.db.SQL.QueryRowContext(ctx, `SELECT COUNT(*) FROM fw_rules`).Scan(&totalRules)                                         //nolint:errcheck
        s.db.SQL.QueryRowContext(ctx, `SELECT COUNT(*) FROM fw_rules WHERE action='allow'`).Scan(&allowRules)                    //nolint:errcheck
        s.db.SQL.QueryRowContext(ctx, `SELECT COUNT(*) FROM fw_rules WHERE action IN ('deny','reject')`).Scan(&denyRules)        //nolint:errcheck
        s.db.SQL.QueryRowContext(ctx, `SELECT COUNT(*) FROM fw_rules WHERE action='limit'`).Scan(&limitRules)                   //nolint:errcheck

        var natRules, bannedIPs int
        s.db.SQL.QueryRowContext(ctx, `SELECT COUNT(*) FROM fw_nat_rules`).Scan(&natRules)   //nolint:errcheck
        s.db.SQL.QueryRowContext(ctx, `SELECT COUNT(*) FROM fw_banned_ips`).Scan(&bannedIPs) //nolint:errcheck

        // Log type counts
        logsByType := map[string]int{"BLOCK": 0, "ALLOW": 0, "LIMIT": 0}
        lrows, _ := s.db.SQL.QueryContext(ctx, `SELECT type, COUNT(*) FROM fw_logs GROUP BY type`)
        if lrows != nil {
                for lrows.Next() {
                        var t string
                        var c int
                        lrows.Scan(&t, &c) //nolint:errcheck
                        logsByType[t] = c
                }
                lrows.Close()
        }

        // Top blocked IPs
        var topBlocked []TopIP
        brows, _ := s.db.SQL.QueryContext(ctx,
                `SELECT src_ip, COUNT(*) as c FROM fw_logs WHERE type='BLOCK' GROUP BY src_ip ORDER BY c DESC LIMIT 10`,
        )
        if brows != nil {
                for brows.Next() {
                        var t TopIP
                        brows.Scan(&t.IP, &t.Hits) //nolint:errcheck
                        topBlocked = append(topBlocked, t)
                }
                brows.Close()
        }
        if topBlocked == nil {
                topBlocked = []TopIP{}
        }

        // Simple timeline: last 24 hours in 1-hour buckets (simulated from counters)
        var timeline []HitsTimepoint
        now := time.Now()
        baseAllowed := fwPacketsAllowed.Load()
        baseBlocked := fwPacketsBlocked.Load()
        for i := 23; i >= 0; i-- {
                t := now.Add(-time.Duration(i) * time.Hour).Format("15:04")
                frac := float64(23-i) / 23.0
                timeline = append(timeline, HitsTimepoint{
                        Ts:      t,
                        Allowed: int64(float64(baseAllowed) * frac / 24),
                        Blocked: int64(float64(baseBlocked) * frac / 24),
                })
        }

        stats := FWStats{
                TotalRules:     totalRules,
                AllowRules:     allowRules,
                DenyRules:      denyRules,
                LimitRules:     limitRules,
                NatRules:       natRules,
                BannedIPs:      bannedIPs,
                PacketsAllowed: fwPacketsAllowed.Load(),
                PacketsBlocked: fwPacketsBlocked.Load(),
                PacketsLimited: fwPacketsLimited.Load(),
                TopBlockedIPs:  topBlocked,
                LogsByType:     logsByType,
                HitsTimeline:   timeline,
        }
        writeJSON(w, stats)
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP Handlers — UFW command builder (dry-run)
// ─────────────────────────────────────────────────────────────────────────────

func (s *Server) handleFirewallBuildCommand(w http.ResponseWriter, r *http.Request) {
        var inp FWRuleInput
        if err := json.NewDecoder(r.Body).Decode(&inp); err != nil {
                http.Error(w, "bad request", http.StatusBadRequest)
                return
        }
        rule := FWRule{
                Direction: inp.Direction, Protocol: inp.Protocol, Port: inp.Port,
                SourceIP: inp.SourceIP, DestIP: inp.DestIP, Iface: inp.Iface,
                Action: inp.Action, Comment: inp.Comment,
        }
        writeJSON(w, map[string]string{"command": buildUFWCommand(rule)})
}

// ─────────────────────────────────────────────────────────────────────────────
// WebSocket — Live firewall log stream
// ─────────────────────────────────────────────────────────────────────────────

var fwWSUpgrader = websocket.Upgrader{
        CheckOrigin: func(r *http.Request) bool {
                origin := r.Header.Get("Origin")
                if origin == "" {
                        return false
                }
                originHost := strings.TrimPrefix(strings.TrimPrefix(origin, "https://"), "http://")
                originHost = strings.Split(originHost, ":")[0]
                requestHost := strings.Split(r.Host, ":")[0]
                if strings.EqualFold(originHost, requestHost) {
                        return true
                }
                if originHost == "localhost" || originHost == "127.0.0.1" {
                        return true
                }
                return false
        },
}

func (s *Server) handleFirewallLogsWS(w http.ResponseWriter, r *http.Request) {
        conn, err := fwWSUpgrader.Upgrade(w, r, nil)
        if err != nil {
                log.Printf("[firewall-ws] upgrade error: %v", err)
                return
        }
        defer conn.Close()

        ch := globalFWHub.subscribe()
        defer globalFWHub.unsubscribe(ch)

        // Send last 50 log entries on connect
        rows, err := s.db.SQL.QueryContext(r.Context(),
                `SELECT id,ts,type,iface,src_ip,dst_ip,src_port,dst_port,proto,rule_id FROM fw_logs ORDER BY created_at DESC LIMIT 50`,
        )
        if err == nil {
                var history []FWLogEntry
                for rows.Next() {
                        var e FWLogEntry
                        rows.Scan(&e.ID, &e.Ts, &e.Type, &e.Iface, &e.SrcIP, &e.DstIP, &e.SrcPort, &e.DstPort, &e.Proto, &e.Rule) //nolint:errcheck
                        history = append(history, e)
                }
                rows.Close()
                // Reverse order (oldest first)
                for i, j := 0, len(history)-1; i < j; i, j = i+1, j-1 {
                        history[i], history[j] = history[j], history[i]
                }
                for _, e := range history {
                        if err := conn.WriteJSON(e); err != nil {
                                return
                        }
                }
        }

        // Ping ticker to keep connection alive
        pingTicker := time.NewTicker(20 * time.Second)
        defer pingTicker.Stop()

        done := make(chan struct{})
        go func() {
                defer close(done)
                for {
                        _, _, err := conn.ReadMessage()
                        if err != nil {
                                return
                        }
                }
        }()

        for {
                select {
                case <-done:
                        return
                case <-r.Context().Done():
                        return
                case <-pingTicker.C:
                        if err := conn.WriteMessage(websocket.PingMessage, nil); err != nil {
                                return
                        }
                case entry, ok := <-ch:
                        if !ok {
                                return
                        }
                        if err := conn.WriteJSON(entry); err != nil {
                                return
                        }
                }
        }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: write JSON response
// ─────────────────────────────────────────────────────────────────────────────

func writeJSON(w http.ResponseWriter, v interface{}) {
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(v) //nolint:errcheck
}

