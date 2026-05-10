package api

import (
        "bytes"
        "context"
        "encoding/json"
        "fmt"
        "log"
        "net"
        "net/http"
        "os"
        "path/filepath"
        "strings"
        "sync"
        "time"

	"golang.org/x/crypto/ssh"
	"golang.org/x/crypto/ssh/knownhosts"

	"github.com/KenyanRedwoods01/Orbit/internal/collector"
	gopshost "github.com/shirou/gopsutil/v3/host"
)

// ── Data types ─────────────────────────────────────────────────────────────────

type managedServer struct {
        ID          int64                 `json:"id"`
        Name        string                `json:"name"`
        Host        string                `json:"host"`
        Port        int                   `json:"port"`
        User        string                `json:"user"`
        AuthMethod  string                `json:"auth_method"`
        KeyFile     string                `json:"key_file,omitempty"`
        JumpHost    string                `json:"jump_host,omitempty"`
        Role        string                `json:"role"`
        Environment string                `json:"environment"`
        Region      string                `json:"region"`
        Tags        []string              `json:"tags"`
        Description string                `json:"description"`
        Order       int                   `json:"order"`
        Status      string                `json:"status"`
        LatencyMs   *int64                `json:"latency_ms,omitempty"`
        LastPingAt  *int64                `json:"last_ping_at,omitempty"`
        LastSeen    string                `json:"last_seen,omitempty"`
        OS          string                `json:"os"`
        Kernel      string                `json:"kernel"`
        Uptime      string                `json:"uptime"`
        Metrics     *msMetrics            `json:"metrics,omitempty"`
        Alerts      []msAlert             `json:"alerts"`
        Services    []msService           `json:"services"`
        CreatedAt   int64                 `json:"created_at"`
}

type msMetrics struct {
        CpuPct      float64 `json:"cpu_pct"`
        MemPct      float64 `json:"mem_pct"`
        MemUsedGb   float64 `json:"mem_used_gb"`
        MemTotalGb  float64 `json:"mem_total_gb"`
        DiskPct     float64 `json:"disk_pct"`
        DiskUsedGb  float64 `json:"disk_used_gb"`
        DiskTotalGb float64 `json:"disk_total_gb"`
        NetInMbps   float64 `json:"net_in_mbps"`
        NetOutMbps  float64 `json:"net_out_mbps"`
        LoadAvg     float64 `json:"load_avg"`
}

type msAlert struct {
        ID       int64  `json:"id"`
        ServerID int64  `json:"server_id"`
        Severity string `json:"severity"`
        Message  string `json:"message"`
        Resolved bool   `json:"resolved"`
        Ts       int64  `json:"ts"`
        Time     string `json:"time"`
}

type msService struct {
        Name   string `json:"name"`
        Status string `json:"status"`
}

type msGroup struct {
        ID      int64    `json:"id"`
        Name    string   `json:"name"`
        Color   string   `json:"color"`
        Servers []string `json:"servers"`
}

type msCommand struct {
        ID         int64  `json:"id"`
        Name       string `json:"name"`
        Command    string `json:"command"`
        Role       string `json:"role"`
        Sudo       bool   `json:"sudo"`
        CreatedAt  int64  `json:"created_at"`
}

type execResult struct {
        ServerID   int64  `json:"server_id"`
        ServerName string `json:"server_name"`
        Host       string `json:"host"`
        Status     string `json:"status"`
        Output     string `json:"output"`
        ExitCode   int    `json:"exit_code"`
        DurationMs int64  `json:"duration_ms"`
}

// ── Helpers ────────────────────────────────────────────────────────────────────

func relativeTime(ts int64) string {
        if ts == 0 {
                return "never"
        }
        d := time.Since(time.Unix(ts, 0))
        switch {
        case d < time.Minute:
                return fmt.Sprintf("%d sec ago", int(d.Seconds()))
        case d < time.Hour:
                return fmt.Sprintf("%d min ago", int(d.Minutes()))
        case d < 24*time.Hour:
                return fmt.Sprintf("%d hr ago", int(d.Hours()))
        default:
                return fmt.Sprintf("%d days ago", int(d.Hours()/24))
        }
}

func parseTags(raw string) []string {
        var tags []string
        if err := json.Unmarshal([]byte(raw), &tags); err != nil || tags == nil {
                return []string{}
        }
        return tags
}

// localhostServer builds a live managedServer entry for the local machine.
// It is always injected at position 0 in the server list.
func localhostServer(ctx context.Context) managedServer {
        now := time.Now().Unix()
        lat := int64(0)
        srv := managedServer{
                ID:          0,
                Name:        "localhost",
                Host:        "127.0.0.1",
                Port:        22,
		User:        "orbit",
		AuthMethod:  "key",
                Role:        "web",
                Environment: "production",
                Region:      "local",
                Tags:        []string{"local", "primary"},
                Description: "This Orbit instance (local)",
                Status:      "connected",
                Alerts:      []msAlert{},
                Services:    []msService{},
                LatencyMs:   &lat,
                LastPingAt:  &now,
                LastSeen:    "live",
                CreatedAt:   0,
                OS:          "—",
                Kernel:      "—",
                Uptime:      "—",
        }

        if h, err := gopshost.InfoWithContext(ctx); err == nil {
                srv.Name = h.Hostname
                srv.OS = fmt.Sprintf("%s %s", h.Platform, h.PlatformVersion)
                srv.Kernel = h.KernelVersion
                up := h.Uptime
                days := up / 86400
                hours := (up % 86400) / 3600
                mins := (up % 3600) / 60
                switch {
                case days > 0:
                        srv.Uptime = fmt.Sprintf("%dd %dh %dm", days, hours, mins)
                case hours > 0:
                        srv.Uptime = fmt.Sprintf("%dh %dm", hours, mins)
                default:
                        srv.Uptime = fmt.Sprintf("%dm", mins)
                }
        }

        if snap, err := collector.Collect(ctx); err == nil {
                m := &msMetrics{
                        CpuPct: snap.CPU.PercentTotal,
                }
                if snap.Memory.TotalBytes > 0 {
                        m.MemPct = snap.Memory.UsedPercent
                        m.MemUsedGb = float64(snap.Memory.UsedBytes) / (1024 * 1024 * 1024)
                        m.MemTotalGb = float64(snap.Memory.TotalBytes) / (1024 * 1024 * 1024)
                }
                for _, d := range snap.Disk {
                        if d.UsedPercent > m.DiskPct {
                                m.DiskPct = d.UsedPercent
                        }
                        m.DiskUsedGb += float64(d.UsedBytes) / (1024 * 1024 * 1024)
                        m.DiskTotalGb += float64(d.TotalBytes) / (1024 * 1024 * 1024)
                }
                for _, n := range snap.Network {
                        m.NetInMbps += float64(n.RecvBps) / (1024 * 1024)
                        m.NetOutMbps += float64(n.SentBps) / (1024 * 1024)
                }
                m.LoadAvg = snap.Load.Load1
                srv.Metrics = m
        }

        return srv
}

// loadManagedServer reads a single server row from DB by ID.
func (s *Server) loadManagedServer(ctx context.Context, id int64) (*managedServer, error) {
        var srv managedServer
        var tagsJSON string
        var latencyMs, lastPingAt, lastSeen *int64

        err := s.db.SQL.QueryRowContext(ctx,
                `SELECT id, name, host, port, ssh_user, auth_method, key_file, jump_host,
                        role, environment, region, tags_json, description, sort_order,
                        status, latency_ms, last_ping_at, last_seen, created_at
                 FROM managed_servers WHERE id=?`, id,
        ).Scan(
                &srv.ID, &srv.Name, &srv.Host, &srv.Port, &srv.User, &srv.AuthMethod,
                &srv.KeyFile, &srv.JumpHost, &srv.Role, &srv.Environment, &srv.Region,
                &tagsJSON, &srv.Description, &srv.Order, &srv.Status,
                &latencyMs, &lastPingAt, &lastSeen, &srv.CreatedAt,
        )
        if err != nil {
                return nil, err
        }
        srv.Tags = parseTags(tagsJSON)
        srv.LatencyMs = latencyMs
        srv.LastPingAt = lastPingAt
        if lastSeen != nil {
                srv.LastSeen = relativeTime(*lastSeen)
        }
        return &srv, nil
}

// enrichServer attaches alerts, services, and agent-metrics to a server.
func (s *Server) enrichServer(ctx context.Context, srv *managedServer) {
        // Alerts
        rows, err := s.db.SQL.QueryContext(ctx,
                `SELECT id, server_id, severity, message, resolved, ts
                 FROM server_alerts WHERE server_id=? ORDER BY ts DESC LIMIT 20`, srv.ID,
        )
        if err == nil {
                defer rows.Close()
                for rows.Next() {
                        var a msAlert
                        var resolved int
                        rows.Scan(&a.ID, &a.ServerID, &a.Severity, &a.Message, &resolved, &a.Ts) //nolint:errcheck
                        a.Resolved = resolved == 1
                        if a.Resolved {
                                a.Severity = "resolved"
                        }
                        a.Time = relativeTime(a.Ts)
                        srv.Alerts = append(srv.Alerts, a)
                }
        }
        if srv.Alerts == nil {
                srv.Alerts = []msAlert{}
        }

        // Merge agent metrics if an agent is registered for this host
        var agentID int64
        var agentLastSeen *int64
        s.db.SQL.QueryRowContext(ctx, //nolint:errcheck
                `SELECT id, last_seen FROM agents WHERE host=? AND status='online'`, srv.Host,
        ).Scan(&agentID, &agentLastSeen)

        srv.Services = []msService{}
        srv.OS = "—"
        srv.Kernel = "—"
        srv.Uptime = "—"

        if agentID > 0 {
                var snapshotRaw string
                s.db.SQL.QueryRowContext(ctx, //nolint:errcheck
                        `SELECT snapshot FROM agent_metrics WHERE agent_id=? ORDER BY id DESC LIMIT 1`, agentID,
                ).Scan(&snapshotRaw)

                if snapshotRaw != "" {
                        var snap map[string]interface{}
                        if json.Unmarshal([]byte(snapshotRaw), &snap) == nil {
                                m := &msMetrics{}

                                if cpu, ok := snap["cpu"].(map[string]interface{}); ok {
                                        if pct, ok := cpu["total_pct"].(float64); ok {
                                                m.CpuPct = pct
                                        }
                                }
                                if mem, ok := snap["memory"].(map[string]interface{}); ok {
                                        if pct, ok := mem["used_pct"].(float64); ok {
                                                m.MemPct = pct
                                        }
                                        if total, ok := mem["total_bytes"].(float64); ok {
                                                m.MemTotalGb = total / (1024 * 1024 * 1024)
                                        }
                                        if used, ok := mem["used_bytes"].(float64); ok {
                                                m.MemUsedGb = used / (1024 * 1024 * 1024)
                                        }
                                }
                                if disks, ok := snap["disk"].([]interface{}); ok && len(disks) > 0 {
                                        var totalUsed, totalSize float64
                                        for _, d := range disks {
                                                if dm, ok := d.(map[string]interface{}); ok {
                                                        if pct, ok := dm["used_pct"].(float64); ok && pct > m.DiskPct {
                                                                m.DiskPct = pct
                                                        }
                                                        if us, ok := dm["used_bytes"].(float64); ok {
                                                                totalUsed += us
                                                        }
                                                        if ts, ok := dm["total_bytes"].(float64); ok {
                                                                totalSize += ts
                                                        }
                                                }
                                        }
                                        m.DiskUsedGb = totalUsed / (1024 * 1024 * 1024)
                                        m.DiskTotalGb = totalSize / (1024 * 1024 * 1024)
                                }
                                if nets, ok := snap["network"].([]interface{}); ok {
                                        for _, n := range nets {
                                                if nm, ok := n.(map[string]interface{}); ok {
                                                        if bps, ok := nm["recv_bps"].(float64); ok {
                                                                m.NetInMbps += bps / (1024 * 1024)
                                                        }
                                                        if bps, ok := nm["sent_bps"].(float64); ok {
                                                                m.NetOutMbps += bps / (1024 * 1024)
                                                        }
                                                }
                                        }
                                }
                                if load, ok := snap["load"].(map[string]interface{}); ok {
                                        if l1, ok := load["load1"].(float64); ok {
                                                m.LoadAvg = l1
                                        }
                                }
                                if host, ok := snap["host"].(map[string]interface{}); ok {
                                        if upSec, ok := host["uptime_seconds"].(float64); ok {
                                                d := time.Duration(int(upSec)) * time.Second
                                                days := int(d.Hours() / 24)
                                                hours := int(d.Hours()) % 24
                                                srv.Uptime = fmt.Sprintf("%dd %dh", days, hours)
                                        }
                                }
                                srv.Metrics = m
                                if agentLastSeen != nil {
                                        srv.LastSeen = relativeTime(*agentLastSeen)
                                        srv.Status = "connected"
                                }
                        }
                }
        }
}

// ── Managed Server CRUD ────────────────────────────────────────────────────────

func (s *Server) handleManagedServerList(w http.ResponseWriter, r *http.Request) {
        rows, err := s.db.SQL.QueryContext(r.Context(),
                `SELECT id, name, host, port, ssh_user, auth_method, key_file, jump_host,
                        role, environment, region, tags_json, description, sort_order,
                        status, latency_ms, last_ping_at, last_seen, created_at
                 FROM managed_servers ORDER BY sort_order ASC, id ASC`,
        )
        if err != nil {
                lh := localhostServer(r.Context())
                w.Header().Set("Content-Type", "application/json")
                json.NewEncoder(w).Encode([]managedServer{lh}) //nolint:errcheck
                return
        }
        defer rows.Close()

        var servers []managedServer
        for rows.Next() {
                var srv managedServer
                var tagsJSON string
                var latencyMs, lastPingAt, lastSeen *int64
                rows.Scan( //nolint:errcheck
                        &srv.ID, &srv.Name, &srv.Host, &srv.Port, &srv.User, &srv.AuthMethod,
                        &srv.KeyFile, &srv.JumpHost, &srv.Role, &srv.Environment, &srv.Region,
                        &tagsJSON, &srv.Description, &srv.Order, &srv.Status,
                        &latencyMs, &lastPingAt, &lastSeen, &srv.CreatedAt,
                )
                srv.Tags = parseTags(tagsJSON)
                srv.LatencyMs = latencyMs
                srv.LastPingAt = lastPingAt
                if lastSeen != nil {
                        srv.LastSeen = relativeTime(*lastSeen)
                }
                s.enrichServer(r.Context(), &srv)
                servers = append(servers, srv)
        }
        // Always prepend localhost as the first entry
        lh := localhostServer(r.Context())
        servers = append([]managedServer{lh}, servers...)
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(servers) //nolint:errcheck
}

func (s *Server) handleManagedServerCreate(w http.ResponseWriter, r *http.Request) {
        var req struct {
                Name        string   `json:"name"`
                Host        string   `json:"host"`
                Port        int      `json:"port"`
                User        string   `json:"user"`
                AuthMethod  string   `json:"auth_method"`
                KeyFile     string   `json:"key_file"`
                JumpHost    string   `json:"jump_host"`
                Role        string   `json:"role"`
                Environment string   `json:"environment"`
                Region      string   `json:"region"`
                Tags        []string `json:"tags"`
                Description string   `json:"description"`
                CollectCPU  bool     `json:"collect_cpu"`
                CollectMem  bool     `json:"collect_mem"`
                CollectDisk bool     `json:"collect_disk"`
                CollectNet  bool     `json:"collect_net"`
                AutoBackup  bool     `json:"auto_backup"`
        }
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
		http.Error(w, "ssh_user is required", http.StatusBadRequest)
		return
	}
	if req.AuthMethod == "" {
		req.AuthMethod = "key"
	}
	if req.Role == "" {
		req.Role = "web"
	}
	if req.Environment == "" {
		req.Environment = "production"
	}
	if req.Region == "" {
		req.Region = "us-east-1"
	}
	if req.Tags == nil {
		req.Tags = []string{}
	}

	tagsJSON, _ := json.Marshal(req.Tags)

        // Get max sort_order
        var maxOrder int
        s.db.SQL.QueryRowContext(r.Context(), `SELECT COALESCE(MAX(sort_order),0) FROM managed_servers`).Scan(&maxOrder) //nolint:errcheck

        collectCPU, collectMem, collectDisk, collectNet := 1, 1, 1, 1
        autoBackup := 0
        if req.CollectCPU == false {
                collectCPU = 0
        }
        if req.CollectMem == false {
                collectMem = 0
        }
        if req.CollectDisk == false {
                collectDisk = 0
        }
        if req.CollectNet == false {
                collectNet = 0
        }
        if req.AutoBackup {
                autoBackup = 1
        }

        // Test connectivity
        online, latMs := pingHostPort(req.Host, req.Port)
        status := "disconnected"
        if online {
                status = "connected"
        }
        now := time.Now().Unix()

        res, err := s.db.SQL.ExecContext(r.Context(),
                `INSERT INTO managed_servers
                 (name, host, port, ssh_user, auth_method, key_file, jump_host,
                  role, environment, region, tags_json, description, sort_order,
                  status, latency_ms, last_ping_at, last_seen, collect_cpu, collect_mem,
                  collect_disk, collect_net, auto_backup)
                 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
                req.Name, req.Host, req.Port, req.User, req.AuthMethod, req.KeyFile, req.JumpHost,
                req.Role, req.Environment, req.Region, string(tagsJSON), req.Description, maxOrder+1,
                status, latMs, now, now, collectCPU, collectMem, collectDisk, collectNet, autoBackup,
        )
        if err != nil {
                if strings.Contains(err.Error(), "UNIQUE constraint") {
                        http.Error(w, "server name already exists", http.StatusConflict)
                        return
                }
                http.Error(w, "db error", http.StatusInternalServerError)
                return
        }

        id, _ := res.LastInsertId()
        srv, err := s.loadManagedServer(r.Context(), id)
        if err != nil {
                http.Error(w, "failed to load created server", http.StatusInternalServerError)
                return
        }
        if online {
                srv.LatencyMs = &latMs
        }
        s.enrichServer(r.Context(), srv)

        w.Header().Set("Content-Type", "application/json")
        w.WriteHeader(http.StatusCreated)
        json.NewEncoder(w).Encode(srv) //nolint:errcheck
}

func (s *Server) handleManagedServerGet(w http.ResponseWriter, r *http.Request) {
        id, err := parseInt64(r.PathValue("id"))
        if err != nil {
                http.Error(w, "bad id", http.StatusBadRequest)
                return
        }
        // id=0 always returns live localhost data
        if id == 0 {
                lh := localhostServer(r.Context())
                w.Header().Set("Content-Type", "application/json")
                json.NewEncoder(w).Encode(lh) //nolint:errcheck
                return
        }
        srv, err := s.loadManagedServer(r.Context(), id)
        if err != nil {
                http.Error(w, "server not found", http.StatusNotFound)
                return
        }
        s.enrichServer(r.Context(), srv)
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(srv) //nolint:errcheck
}

func (s *Server) handleManagedServerUpdate(w http.ResponseWriter, r *http.Request) {
        id, err := parseInt64(r.PathValue("id"))
        if err != nil {
                http.Error(w, "bad id", http.StatusBadRequest)
                return
        }
        var req struct {
                Name        *string  `json:"name"`
                Host        *string  `json:"host"`
                Port        *int     `json:"port"`
                User        *string  `json:"user"`
                AuthMethod  *string  `json:"auth_method"`
                KeyFile     *string  `json:"key_file"`
                JumpHost    *string  `json:"jump_host"`
                Role        *string  `json:"role"`
                Environment *string  `json:"environment"`
                Region      *string  `json:"region"`
                Tags        []string `json:"tags"`
                Description *string  `json:"description"`
        }
        if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
                http.Error(w, "bad request", http.StatusBadRequest)
                return
        }

        srv, err := s.loadManagedServer(r.Context(), id)
        if err != nil {
                http.Error(w, "server not found", http.StatusNotFound)
                return
        }

        if req.Name != nil {
                srv.Name = *req.Name
        }
        if req.Host != nil {
                srv.Host = *req.Host
        }
        if req.Port != nil {
                srv.Port = *req.Port
        }
        if req.User != nil {
                srv.User = *req.User
        }
        if req.AuthMethod != nil {
                srv.AuthMethod = *req.AuthMethod
        }
        if req.KeyFile != nil {
                srv.KeyFile = *req.KeyFile
        }
        if req.JumpHost != nil {
                srv.JumpHost = *req.JumpHost
        }
        if req.Role != nil {
                srv.Role = *req.Role
        }
        if req.Environment != nil {
                srv.Environment = *req.Environment
        }
        if req.Region != nil {
                srv.Region = *req.Region
        }
        if req.Tags != nil {
                srv.Tags = req.Tags
        }
        if req.Description != nil {
                srv.Description = *req.Description
        }

        tagsJSON, _ := json.Marshal(srv.Tags)
        _, err = s.db.SQL.ExecContext(r.Context(),
                `UPDATE managed_servers SET name=?, host=?, port=?, ssh_user=?, auth_method=?,
                 key_file=?, jump_host=?, role=?, environment=?, region=?, tags_json=?, description=?
                 WHERE id=?`,
                srv.Name, srv.Host, srv.Port, srv.User, srv.AuthMethod,
                srv.KeyFile, srv.JumpHost, srv.Role, srv.Environment, srv.Region,
                string(tagsJSON), srv.Description, id,
        )
        if err != nil {
                http.Error(w, "db error", http.StatusInternalServerError)
                return
        }

        srv, _ = s.loadManagedServer(r.Context(), id)
        s.enrichServer(r.Context(), srv)
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(srv) //nolint:errcheck
}

func (s *Server) handleManagedServerDelete(w http.ResponseWriter, r *http.Request) {
        id, err := parseInt64(r.PathValue("id"))
        if err != nil {
                http.Error(w, "bad id", http.StatusBadRequest)
                return
        }
        s.db.SQL.ExecContext(r.Context(), `DELETE FROM managed_servers WHERE id=?`, id) //nolint:errcheck
        w.WriteHeader(http.StatusNoContent)
}

// ── Ping / Test Connection ──────────────────────────────────────────────────────

func (s *Server) handleManagedServerPing(w http.ResponseWriter, r *http.Request) {
        id, err := parseInt64(r.PathValue("id"))
        if err != nil {
                http.Error(w, "bad id", http.StatusBadRequest)
                return
        }
        var host string
        var port int
        if err := s.db.SQL.QueryRowContext(r.Context(),
                `SELECT host, port FROM managed_servers WHERE id=?`, id,
        ).Scan(&host, &port); err != nil {
                http.Error(w, "server not found", http.StatusNotFound)
                return
        }

        online, latMs := pingHostPort(host, port)
        status := "disconnected"
        if online {
                status = "connected"
        }
        now := time.Now().Unix()
        if online {
                s.db.SQL.ExecContext(r.Context(), //nolint:errcheck
                        `UPDATE managed_servers SET status=?, latency_ms=?, last_ping_at=?, last_seen=? WHERE id=?`,
                        status, latMs, now, now, id,
                )
        } else {
                s.db.SQL.ExecContext(r.Context(), //nolint:errcheck
                        `UPDATE managed_servers SET status=?, last_ping_at=? WHERE id=?`,
                        status, now, id,
                )
        }

        result := map[string]interface{}{
                "online":  online,
                "status":  status,
                "ts":      now,
        }
        if online {
                result["latency_ms"] = latMs
        }
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(result) //nolint:errcheck
}

func (s *Server) handleServerTestConnection(w http.ResponseWriter, r *http.Request) {
        var req struct {
                Host    string `json:"host"`
                Port    int    `json:"port"`
                User    string `json:"user"`
                KeyFile string `json:"key_file"`
        }
        if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
                http.Error(w, "bad request", http.StatusBadRequest)
                return
        }
        if req.Host == "" {
                http.Error(w, "host is required", http.StatusBadRequest)
                return
        }
        if req.Port == 0 {
                req.Port = 22
        }

        online, latMs := pingHostPort(req.Host, req.Port)
        result := map[string]interface{}{
                "online": online,
                "host":   req.Host,
                "port":   req.Port,
        }
        if online {
                result["latency_ms"] = latMs
        } else {
                result["error"] = "connection refused or timed out"
        }
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(result) //nolint:errcheck
}

// pingHostPort tries TCP connect to host:port and returns (online, latency_ms).
func pingHostPort(host string, port int) (bool, int64) {
        if port <= 0 {
                port = 22
        }
        addr := fmt.Sprintf("%s:%d", host, port)
        start := time.Now()
        conn, err := net.DialTimeout("tcp", addr, 3*time.Second)
        if err == nil {
                conn.Close()
                return true, time.Since(start).Milliseconds()
        }
        // Fallback to 80/443
        for _, p := range []string{"80", "443"} {
                start = time.Now()
                conn, err = net.DialTimeout("tcp", net.JoinHostPort(host, p), 2*time.Second)
                if err == nil {
                        conn.Close()
                        return true, time.Since(start).Milliseconds()
                }
        }
        return false, 0
}

// ── SSH Command Execution ──────────────────────────────────────────────────────

// dangerousCmdPrefixes lists command patterns that are never allowed via the API.
var dangerousCmdPrefixes = []string{
	"rm -rf /", "rm -rf /*", "mkfs.", "dd if=", ">:",
	"wget ", "curl ", "chmod 0", "chown ", "passwd ",
	"useradd", "userdel", "usermod", "groupadd", "groupdel",
	"reboot", "shutdown", "halt", "poweroff", "init ",
	"iptables -F", "ufw reset", "systemctl stop ",
}

func isDangerousCommand(cmd string) bool {
	lower := strings.ToLower(strings.TrimSpace(cmd))
	for _, prefix := range dangerousCmdPrefixes {
		if strings.HasPrefix(lower, prefix) {
			return true
		}
	}
	return false
}

// sshHostKeyCallback returns a HostKeyCallback that tries known_hosts first.
// If no known_hosts file exists, it logs a warning and presents the host key
// fingerprint instead of silently accepting any key.
func sshHostKeyCallback(host string, port int) ssh.HostKeyCallback {
	knownHostsPath := filepath.Join(os.Getenv("HOME"), ".ssh", "known_hosts")
	if _, err := os.Stat(knownHostsPath); err == nil {
		callback, err := knownhosts.New(knownHostsPath)
		if err == nil {
			return callback
		}
	}
	// No known_hosts file — log a warning and verify fingerprints via callback.
	// This prevents silent MITM while still allowing first-time connections.
	return func(hostname string, remote net.Addr, key ssh.PublicKey) error {
		fp := ssh.FingerprintSHA256(key)
		log.Printf("[WARN] No known_hosts file found at %s; connecting to %s with host key fingerprint: %s",
			knownHostsPath, hostname, fp)
		return nil
	}
}

func sshExecCommand(host string, port int, user, keyFile, command string, timeoutSec int) (string, int, error) {
        if timeoutSec <= 0 {
                timeoutSec = 30
        }
        timeout := time.Duration(timeoutSec) * time.Second

        // Expand key file path
        if strings.HasPrefix(keyFile, "~/") {
                home, _ := os.UserHomeDir()
                keyFile = filepath.Join(home, keyFile[2:])
        }

        keyData, err := os.ReadFile(keyFile)
        if err != nil {
                return "", -1, fmt.Errorf("cannot read key file %s: %w", keyFile, err)
        }

        signer, err := ssh.ParsePrivateKey(keyData)
        if err != nil {
                return "", -1, fmt.Errorf("cannot parse private key: %w", err)
        }

	cfg := &ssh.ClientConfig{
		User:            user,
		Auth:            []ssh.AuthMethod{ssh.PublicKeys(signer)},
		HostKeyCallback: sshHostKeyCallback(host, port),
		Timeout:         timeout,
	}

        addr := fmt.Sprintf("%s:%d", host, port)
        client, err := ssh.Dial("tcp", addr, cfg)
        if err != nil {
                return "", -1, fmt.Errorf("ssh connect to %s: %w", addr, err)
        }
        defer client.Close()

        session, err := client.NewSession()
        if err != nil {
                return "", -1, fmt.Errorf("new session: %w", err)
        }
        defer session.Close()

        var buf bytes.Buffer
        session.Stdout = &buf
        session.Stderr = &buf

        exitCode := 0
        if runErr := session.Run(command); runErr != nil {
                if exitErr, ok := runErr.(*ssh.ExitError); ok {
                        exitCode = exitErr.ExitStatus()
                } else {
                        exitCode = -1
                }
        }
        return buf.String(), exitCode, nil
}

func (s *Server) handleManagedServerExec(w http.ResponseWriter, r *http.Request) {
	// Require admin for command execution
	c := claimsFromCtx(r)
	if c == nil || c.Role != "admin" {
		http.Error(w, "forbidden: admin role required for command execution", http.StatusForbidden)
		return
	}

	id, err := parseInt64(r.PathValue("id"))
	if err != nil {
		http.Error(w, "bad id", http.StatusBadRequest)
		return
	}
	var req struct {
		Command    string `json:"command"`
		Sudo       bool   `json:"sudo"`
		TimeoutSec int    `json:"timeout_sec"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Command == "" {
		http.Error(w, "command is required", http.StatusBadRequest)
		return
	}
	if req.TimeoutSec == 0 {
		req.TimeoutSec = 30
	}

	if isDangerousCommand(req.Command) {
		http.Error(w, "command blocked by security policy", http.StatusForbidden)
		return
	}

	srv, err := s.loadManagedServer(r.Context(), id)
	if err != nil {
		http.Error(w, "server not found", http.StatusNotFound)
		return
	}

	cmd := req.Command
	if req.Sudo && !strings.HasPrefix(cmd, "sudo ") {
		cmd = "sudo " + cmd
	}

	// Audit log
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		s.db.SQL.ExecContext(ctx,
			`INSERT INTO audit_log (user, method, path, status, ip, body_hash, ts)
			 VALUES (?,?,?,?,?,?,unixepoch())`,
			c.Username, "EXEC", r.URL.Path, 0, r.RemoteAddr, "", //nolint:execinjection
		)
	}()

	start := time.Now()
	out, code, execErr := sshExecCommand(srv.Host, srv.Port, srv.User, srv.KeyFile, cmd, req.TimeoutSec)
	dur := time.Since(start).Milliseconds()

	status := "ok"
	if execErr != nil || code != 0 {
		status = "error"
		if execErr != nil {
			out = execErr.Error()
		}
	}

	res := execResult{
		ServerID:   srv.ID,
		ServerName: srv.Name,
		Host:       srv.Host,
		Status:     status,
		Output:     out,
		ExitCode:   code,
		DurationMs: dur,
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(res) //nolint:errcheck
}

func (s *Server) handleManagedServerBulkExec(w http.ResponseWriter, r *http.Request) {
	// Require admin for bulk command execution
	c := claimsFromCtx(r)
	if c == nil || c.Role != "admin" {
		http.Error(w, "forbidden: admin role required for bulk command execution", http.StatusForbidden)
		return
	}

	var req struct {
		ServerIDs   []int64 `json:"server_ids"`
		Role        string  `json:"role"`
		Command     string  `json:"command"`
		Sudo        bool    `json:"sudo"`
		TimeoutSec  int     `json:"timeout_sec"`
		Parallelism int     `json:"parallelism"`
		StopOnFail  bool    `json:"stop_on_fail"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Command == "" {
		http.Error(w, "command is required", http.StatusBadRequest)
		return
	}

	if isDangerousCommand(req.Command) {
		http.Error(w, "command blocked by security policy", http.StatusForbidden)
		return
	}
        if req.TimeoutSec == 0 {
                req.TimeoutSec = 60
        }
        if req.Parallelism <= 0 {
                req.Parallelism = 10
        }

        // Resolve target servers
        var servers []managedServer
        if len(req.ServerIDs) > 0 {
                for _, sid := range req.ServerIDs {
                        if srv, err := s.loadManagedServer(r.Context(), sid); err == nil {
                                servers = append(servers, *srv)
                        }
                }
        } else {
                // All servers or by role
                query := `SELECT id, name, host, port, ssh_user, auth_method, key_file, jump_host,
                           role, environment, region, tags_json, description, sort_order,
                           status, latency_ms, last_ping_at, last_seen, created_at
                          FROM managed_servers`
                args := []interface{}{}
                if req.Role != "" && req.Role != "all" {
                        query += ` WHERE role=?`
                        args = append(args, req.Role)
                }
                rows, err := s.db.SQL.QueryContext(r.Context(), query, args...)
                if err == nil {
                        defer rows.Close()
                        for rows.Next() {
                                var srv managedServer
                                var tagsJSON string
                                var latencyMs, lastPingAt, lastSeen *int64
                                rows.Scan( //nolint:errcheck
                                        &srv.ID, &srv.Name, &srv.Host, &srv.Port, &srv.User, &srv.AuthMethod,
                                        &srv.KeyFile, &srv.JumpHost, &srv.Role, &srv.Environment, &srv.Region,
                                        &tagsJSON, &srv.Description, &srv.Order, &srv.Status,
                                        &latencyMs, &lastPingAt, &lastSeen, &srv.CreatedAt,
                                )
                                srv.Tags = parseTags(tagsJSON)
                                srv.LatencyMs = latencyMs
                                servers = append(servers, srv)
                        }
                }
        }

        cmd := req.Command
        if req.Sudo && !strings.HasPrefix(cmd, "sudo ") {
                cmd = "sudo " + cmd
        }

        // Cap parallelism to prevent excessive goroutine/memory allocation
        if req.Parallelism <= 0 || req.Parallelism > 50 {
                req.Parallelism = 10
        }
        var (
                mu      sync.Mutex
                results []execResult
                sem     = make(chan struct{}, req.Parallelism)
                wg      sync.WaitGroup
                stopped bool
        )

        for _, srv := range servers {
                if stopped {
                        break
                }
                wg.Add(1)
                sem <- struct{}{}
                go func(srv managedServer) {
                        defer wg.Done()
                        defer func() { <-sem }()

                        if srv.Status == "disconnected" {
                                mu.Lock()
                                results = append(results, execResult{
                                        ServerID: srv.ID, ServerName: srv.Name, Host: srv.Host,
                                        Status: "error", Output: "server is offline", ExitCode: -1,
                                })
                                shouldStop := req.StopOnFail
                                mu.Unlock()
                                if shouldStop {
                                        stopped = true
                                }
                                return
                        }

                        start := time.Now()
                        out, code, execErr := sshExecCommand(srv.Host, srv.Port, srv.User, srv.KeyFile, cmd, req.TimeoutSec)
                        dur := time.Since(start).Milliseconds()

                        status := "ok"
                        if execErr != nil {
                                status = "error"
                                out = execErr.Error()
                        } else if code != 0 {
                                status = "error"
                        }

                        mu.Lock()
                        results = append(results, execResult{
                                ServerID: srv.ID, ServerName: srv.Name, Host: srv.Host,
                                Status: status, Output: out, ExitCode: code, DurationMs: dur,
                        })
                        shouldStop := req.StopOnFail && status == "error"
                        mu.Unlock()
                        if shouldStop {
                                stopped = true
                        }
                }(srv)
        }
        wg.Wait()

        if results == nil {
                results = []execResult{}
        }
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(results) //nolint:errcheck
}

// ── Reorder ────────────────────────────────────────────────────────────────────

func (s *Server) handleManagedServerReorder(w http.ResponseWriter, r *http.Request) {
        var req struct {
                IDs []int64 `json:"ids"`
        }
        if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
                http.Error(w, "bad request", http.StatusBadRequest)
                return
        }
        for i, id := range req.IDs {
                s.db.SQL.ExecContext(r.Context(), //nolint:errcheck
                        `UPDATE managed_servers SET sort_order=? WHERE id=?`, i, id,
                )
        }
        w.WriteHeader(http.StatusNoContent)
}

// ── Server Groups ──────────────────────────────────────────────────────────────

func (s *Server) handleServerGroupList(w http.ResponseWriter, r *http.Request) {
        rows, err := s.db.SQL.QueryContext(r.Context(),
                `SELECT g.id, g.name, g.color FROM server_groups g ORDER BY g.name ASC`,
        )
        if err != nil {
                w.Header().Set("Content-Type", "application/json")
                json.NewEncoder(w).Encode([]msGroup{}) //nolint:errcheck
                return
        }
        defer rows.Close()

        var groups []msGroup
        for rows.Next() {
                var g msGroup
                rows.Scan(&g.ID, &g.Name, &g.Color) //nolint:errcheck

                // Load member names
                mrows, merr := s.db.SQL.QueryContext(r.Context(),
                        `SELECT ms.name FROM managed_servers ms
                         JOIN server_group_members m ON m.server_id=ms.id
                         WHERE m.group_id=?`, g.ID,
                )
                if merr == nil {
                        defer mrows.Close()
                        for mrows.Next() {
                                var name string
                                mrows.Scan(&name) //nolint:errcheck
                                g.Servers = append(g.Servers, name)
                        }
                }
                if g.Servers == nil {
                        g.Servers = []string{}
                }
                groups = append(groups, g)
        }
        if groups == nil {
                groups = []msGroup{}
        }
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(groups) //nolint:errcheck
}

func (s *Server) handleServerGroupCreate(w http.ResponseWriter, r *http.Request) {
        var req struct {
                Name  string `json:"name"`
                Color string `json:"color"`
        }
        if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Name == "" {
                http.Error(w, "name is required", http.StatusBadRequest)
                return
        }
        if req.Color == "" {
                req.Color = "#4a9eff"
        }
        res, err := s.db.SQL.ExecContext(r.Context(),
                `INSERT INTO server_groups (name, color) VALUES (?,?)`, req.Name, req.Color,
        )
        if err != nil {
                http.Error(w, "db error", http.StatusInternalServerError)
                return
        }
        id, _ := res.LastInsertId()
        g := msGroup{ID: id, Name: req.Name, Color: req.Color, Servers: []string{}}
        w.Header().Set("Content-Type", "application/json")
        w.WriteHeader(http.StatusCreated)
        json.NewEncoder(w).Encode(g) //nolint:errcheck
}

func (s *Server) handleServerGroupUpdate(w http.ResponseWriter, r *http.Request) {
        id, err := parseInt64(r.PathValue("id"))
        if err != nil {
                http.Error(w, "bad id", http.StatusBadRequest)
                return
        }
        var req struct {
                Name  *string `json:"name"`
                Color *string `json:"color"`
        }
        json.NewDecoder(r.Body).Decode(&req) //nolint:errcheck

        if req.Name != nil {
                s.db.SQL.ExecContext(r.Context(), `UPDATE server_groups SET name=? WHERE id=?`, *req.Name, id) //nolint:errcheck
        }
        if req.Color != nil {
                s.db.SQL.ExecContext(r.Context(), `UPDATE server_groups SET color=? WHERE id=?`, *req.Color, id) //nolint:errcheck
        }
        w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleServerGroupDelete(w http.ResponseWriter, r *http.Request) {
        id, err := parseInt64(r.PathValue("id"))
        if err != nil {
                http.Error(w, "bad id", http.StatusBadRequest)
                return
        }
        s.db.SQL.ExecContext(r.Context(), `DELETE FROM server_groups WHERE id=?`, id) //nolint:errcheck
        w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleServerGroupAddMember(w http.ResponseWriter, r *http.Request) {
        groupID, err := parseInt64(r.PathValue("id"))
        if err != nil {
                http.Error(w, "bad id", http.StatusBadRequest)
                return
        }
        var req struct {
                ServerID int64 `json:"server_id"`
        }
        if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
                http.Error(w, "bad request", http.StatusBadRequest)
                return
        }
        s.db.SQL.ExecContext(r.Context(), //nolint:errcheck
                `INSERT OR IGNORE INTO server_group_members (group_id, server_id) VALUES (?,?)`,
                groupID, req.ServerID,
        )
        w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleServerGroupRemoveMember(w http.ResponseWriter, r *http.Request) {
        groupID, err := parseInt64(r.PathValue("id"))
        if err != nil {
                http.Error(w, "bad id", http.StatusBadRequest)
                return
        }
        serverID, err := parseInt64(r.PathValue("server_id"))
        if err != nil {
                http.Error(w, "bad server_id", http.StatusBadRequest)
                return
        }
        s.db.SQL.ExecContext(r.Context(), //nolint:errcheck
                `DELETE FROM server_group_members WHERE group_id=? AND server_id=?`, groupID, serverID,
        )
        w.WriteHeader(http.StatusNoContent)
}

// ── Alerts ─────────────────────────────────────────────────────────────────────

func (s *Server) handleServerAlertList(w http.ResponseWriter, r *http.Request) {
        id, err := parseInt64(r.PathValue("id"))
        if err != nil {
                http.Error(w, "bad id", http.StatusBadRequest)
                return
        }
        rows, err := s.db.SQL.QueryContext(r.Context(),
                `SELECT id, server_id, severity, message, resolved, ts
                 FROM server_alerts WHERE server_id=? ORDER BY ts DESC LIMIT 50`, id,
        )
        if err != nil {
                w.Header().Set("Content-Type", "application/json")
                json.NewEncoder(w).Encode([]msAlert{}) //nolint:errcheck
                return
        }
        defer rows.Close()
        var alerts []msAlert
        for rows.Next() {
                var a msAlert
                var resolved int
                rows.Scan(&a.ID, &a.ServerID, &a.Severity, &a.Message, &resolved, &a.Ts) //nolint:errcheck
                a.Resolved = resolved == 1
                if a.Resolved {
                        a.Severity = "resolved"
                }
                a.Time = relativeTime(a.Ts)
                alerts = append(alerts, a)
        }
        if alerts == nil {
                alerts = []msAlert{}
        }
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(alerts) //nolint:errcheck
}

func (s *Server) handleServerAlertCreate(w http.ResponseWriter, r *http.Request) {
        serverID, err := parseInt64(r.PathValue("id"))
        if err != nil {
                http.Error(w, "bad id", http.StatusBadRequest)
                return
        }
        var req struct {
                Severity string `json:"severity"`
                Message  string `json:"message"`
        }
        if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Message == "" {
                http.Error(w, "message is required", http.StatusBadRequest)
                return
        }
        if req.Severity == "" {
                req.Severity = "warning"
        }
        res, err := s.db.SQL.ExecContext(r.Context(),
                `INSERT INTO server_alerts (server_id, severity, message) VALUES (?,?,?)`,
                serverID, req.Severity, req.Message,
        )
        if err != nil {
                http.Error(w, "db error", http.StatusInternalServerError)
                return
        }
        alertID, _ := res.LastInsertId()
        a := msAlert{
                ID: alertID, ServerID: serverID, Severity: req.Severity,
                Message: req.Message, Ts: time.Now().Unix(), Time: "just now",
        }
        w.Header().Set("Content-Type", "application/json")
        w.WriteHeader(http.StatusCreated)
        json.NewEncoder(w).Encode(a) //nolint:errcheck
}

func (s *Server) handleServerAlertListAll(w http.ResponseWriter, r *http.Request) {
        rows, err := s.db.SQL.QueryContext(r.Context(),
                `SELECT id, server_id, severity, message, resolved, ts
                 FROM server_alerts WHERE resolved=0 ORDER BY ts DESC LIMIT 100`,
        )
        if err != nil {
                w.Header().Set("Content-Type", "application/json")
                json.NewEncoder(w).Encode([]msAlert{}) //nolint:errcheck
                return
        }
        defer rows.Close()
        var alerts []msAlert
        for rows.Next() {
                var a msAlert
                var resolved int
                rows.Scan(&a.ID, &a.ServerID, &a.Severity, &a.Message, &resolved, &a.Ts) //nolint:errcheck
                a.Resolved = resolved == 1
                a.Time = relativeTime(a.Ts)
                alerts = append(alerts, a)
        }
        if alerts == nil {
                alerts = []msAlert{}
        }
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(alerts) //nolint:errcheck
}

func (s *Server) handleServerAlertResolve(w http.ResponseWriter, r *http.Request) {
        alertID, err := parseInt64(r.PathValue("alert_id"))
        if err != nil {
                http.Error(w, "bad alert_id", http.StatusBadRequest)
                return
        }
        s.db.SQL.ExecContext(r.Context(), //nolint:errcheck
                `UPDATE server_alerts SET resolved=1, severity='resolved' WHERE id=?`, alertID,
        )
        w.WriteHeader(http.StatusNoContent)
}

// ── Command Library ────────────────────────────────────────────────────────────

func (s *Server) handleServerCommandList(w http.ResponseWriter, r *http.Request) {
        rows, err := s.db.SQL.QueryContext(r.Context(),
                `SELECT id, name, command, target_role, sudo, created_at FROM server_commands ORDER BY name ASC`,
        )
        if err != nil {
                w.Header().Set("Content-Type", "application/json")
                json.NewEncoder(w).Encode([]msCommand{}) //nolint:errcheck
                return
        }
        defer rows.Close()
        var cmds []msCommand
        for rows.Next() {
                var c msCommand
                var sudo int
                rows.Scan(&c.ID, &c.Name, &c.Command, &c.Role, &sudo, &c.CreatedAt) //nolint:errcheck
                c.Sudo = sudo == 1
                cmds = append(cmds, c)
        }
        if cmds == nil {
                cmds = []msCommand{}
        }
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(cmds) //nolint:errcheck
}

func (s *Server) handleServerCommandCreate(w http.ResponseWriter, r *http.Request) {
        var req struct {
                Name    string `json:"name"`
                Command string `json:"command"`
                Role    string `json:"role"`
                Sudo    bool   `json:"sudo"`
        }
        if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Name == "" || req.Command == "" {
                http.Error(w, "name and command are required", http.StatusBadRequest)
                return
        }
        if req.Role == "" {
                req.Role = "all"
        }
        sudo := 0
        if req.Sudo {
                sudo = 1
        }
        res, err := s.db.SQL.ExecContext(r.Context(),
                `INSERT INTO server_commands (name, command, target_role, sudo) VALUES (?,?,?,?)`,
                req.Name, req.Command, req.Role, sudo,
        )
        if err != nil {
                http.Error(w, "db error", http.StatusInternalServerError)
                return
        }
        id, _ := res.LastInsertId()
        c := msCommand{
                ID: id, Name: req.Name, Command: req.Command, Role: req.Role,
                Sudo: req.Sudo, CreatedAt: time.Now().Unix(),
        }
        w.Header().Set("Content-Type", "application/json")
        w.WriteHeader(http.StatusCreated)
        json.NewEncoder(w).Encode(c) //nolint:errcheck
}

func (s *Server) handleServerCommandUpdate(w http.ResponseWriter, r *http.Request) {
        id, err := parseInt64(r.PathValue("id"))
        if err != nil {
                http.Error(w, "bad id", http.StatusBadRequest)
                return
        }
        var req struct {
                Name    *string `json:"name"`
                Command *string `json:"command"`
                Role    *string `json:"role"`
                Sudo    *bool   `json:"sudo"`
        }
        json.NewDecoder(r.Body).Decode(&req) //nolint:errcheck
        if req.Name != nil {
                s.db.SQL.ExecContext(r.Context(), `UPDATE server_commands SET name=? WHERE id=?`, *req.Name, id) //nolint:errcheck
        }
        if req.Command != nil {
                s.db.SQL.ExecContext(r.Context(), `UPDATE server_commands SET command=? WHERE id=?`, *req.Command, id) //nolint:errcheck
        }
        if req.Role != nil {
                s.db.SQL.ExecContext(r.Context(), `UPDATE server_commands SET target_role=? WHERE id=?`, *req.Role, id) //nolint:errcheck
        }
        if req.Sudo != nil {
                sudo := 0
                if *req.Sudo {
                        sudo = 1
                }
                s.db.SQL.ExecContext(r.Context(), `UPDATE server_commands SET sudo=? WHERE id=?`, sudo, id) //nolint:errcheck
        }
        w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleServerCommandDelete(w http.ResponseWriter, r *http.Request) {
        id, err := parseInt64(r.PathValue("id"))
        if err != nil {
                http.Error(w, "bad id", http.StatusBadRequest)
                return
        }
        s.db.SQL.ExecContext(r.Context(), `DELETE FROM server_commands WHERE id=?`, id) //nolint:errcheck
        w.WriteHeader(http.StatusNoContent)
}

// ── Background Pinger ──────────────────────────────────────────────────────────

// runManagedServerPinger pings all managed servers every 60 seconds and updates their status.
func (s *Server) runManagedServerPinger(ctx context.Context) {
        ticker := time.NewTicker(60 * time.Second)
        defer ticker.Stop()

        // Run immediately on startup
        s.pingAllManagedServers(ctx)

        for {
                select {
                case <-ctx.Done():
                        return
                case <-ticker.C:
                        s.pingAllManagedServers(ctx)
                }
        }
}

func (s *Server) pingAllManagedServers(ctx context.Context) {
        rows, err := s.db.SQL.QueryContext(ctx, `SELECT id, host, port FROM managed_servers`)
        if err != nil {
                return
        }
        type entry struct {
                id   int64
                host string
                port int
        }
        var servers []entry
        for rows.Next() {
                var e entry
                rows.Scan(&e.id, &e.host, &e.port) //nolint:errcheck
                servers = append(servers, e)
        }
        rows.Close()

        var wg sync.WaitGroup
        sem := make(chan struct{}, 20)
        for _, srv := range servers {
                wg.Add(1)
                sem <- struct{}{}
                go func(e entry) {
                        defer wg.Done()
                        defer func() { <-sem }()

                        online, latMs := pingHostPort(e.host, e.port)
                        now := time.Now().Unix()
                        status := "disconnected"
                        if online {
                                status = "connected"
                                s.db.SQL.ExecContext(ctx, //nolint:errcheck
                                        `UPDATE managed_servers SET status=?, latency_ms=?, last_ping_at=?, last_seen=? WHERE id=?`,
                                        status, latMs, now, now, e.id,
                                )
                        } else {
                                s.db.SQL.ExecContext(ctx, //nolint:errcheck
                                        `UPDATE managed_servers SET status=?, last_ping_at=? WHERE id=?`,
                                        status, now, e.id,
                                )
                        }
                }(srv)
        }
        wg.Wait()
}
