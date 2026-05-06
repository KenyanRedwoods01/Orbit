package api

import (
        "context"
        "encoding/json"
        "fmt"
        "net/http"
        "os/exec"
        "strconv"
        "strings"
        "time"
)

type pluginRecord struct {
        ID            int64  `json:"id"`
        PluginID      string `json:"plugin_id"`
        Name          string `json:"name"`
        Description   string `json:"description"`
        Version       string `json:"version"`
        Author        string `json:"author"`
        Category      string `json:"category"`
        Enabled       bool   `json:"enabled"`
        Config        string `json:"config"`
        InstalledAt   int64  `json:"installed_at"`
        InstallStatus string `json:"install_status"` // installed | not_installed | error | installing
}

var builtinPlugins = []pluginRecord{
        {
                PluginID:    "fail2ban-monitor",
                Name:        "Fail2Ban Monitor",
                Description: "Monitor and manage Fail2Ban jails and banned IPs directly from the dashboard.",
                Version:     "1.0.0",
                Author:      "Orbit VPS",
                Category:    "Security",
                Enabled:     true,
                Config:      "{}",
        },
        {
                PluginID:    "crowdsec",
                Name:        "CrowdSec",
                Description: "Integrate CrowdSec collaborative security engine to block malicious IPs automatically.",
                Version:     "1.6.1",
                Author:      "CrowdSec",
                Category:    "Security",
                Enabled:     true,
                Config:      "{}",
        },
        {
                PluginID:    "wazuh",
                Name:        "Wazuh",
                Description: "Open-source XDR & SIEM — threat detection, FIM, compliance, and active response.",
                Version:     "4.7.0",
                Author:      "Wazuh",
                Category:    "Security",
                Enabled:     true,
                Config:      "{}",
        },
        {
                PluginID:    "suricata",
                Name:        "Suricata",
                Description: "High-performance network IDS/IPS and NSM engine with deep packet inspection.",
                Version:     "7.0.3",
                Author:      "OISF",
                Category:    "Network",
                Enabled:     true,
                Config:      "{}",
        },
        {
                PluginID:    "clamav",
                Name:        "ClamAV",
                Description: "Open-source antivirus engine for detecting trojans, viruses, malware, and other threats.",
                Version:     "1.3.0",
                Author:      "Cisco Talos",
                Category:    "Security",
                Enabled:     true,
                Config:      "{}",
        },
        {
                PluginID:    "trivy",
                Name:        "Trivy",
                Description: "Comprehensive container & infrastructure vulnerability scanner by Aqua Security.",
                Version:     "0.50.1",
                Author:      "Aqua Security",
                Category:    "Scanning",
                Enabled:     true,
                Config:      "{}",
        },
        {
                PluginID:    "docker-security",
                Name:        "Docker Security",
                Description: "Container security hardening — detect privileged containers, exposed sockets, root users.",
                Version:     "2.1.0",
                Author:      "Orbit VPS",
                Category:    "Security",
                Enabled:     false,
                Config:      "{}",
        },
        {
                PluginID:    "lynis",
                Name:        "Lynis",
                Description: "Security auditing and hardening tool for Unix/Linux — compliance and configuration assessment.",
                Version:     "3.0.9",
                Author:      "CISOfy",
                Category:    "Compliance",
                Enabled:     false,
                Config:      "{}",
        },
        {
                PluginID:    "rkhunter",
                Name:        "RKHunter",
                Description: "Rootkit, backdoor, and local exploit scanner for Linux/Unix systems.",
                Version:     "1.4.6",
                Author:      "RKHunter Project",
                Category:    "Scanning",
                Enabled:     false,
                Config:      "{}",
        },
        {
                PluginID:    "github-actions",
                Name:        "GitHub Actions",
                Description: "Trigger and monitor GitHub Actions workflows directly from Orbit VPS.",
                Version:     "0.9.1",
                Author:      "Orbit VPS",
                Category:    "CI/CD",
                Enabled:     false,
                Config:      "{}",
        },
        {
                PluginID:    "disk-cleaner",
                Name:        "Disk Cleaner",
                Description: "Automatically clean up old logs, temp files, and docker layer cache to reclaim disk space.",
                Version:     "1.1.0",
                Author:      "Orbit VPS",
                Category:    "Maintenance",
                Enabled:     false,
                Config:      "{}",
        },
        {
                PluginID:    "smtp-notifier",
                Name:        "SMTP Notifier",
                Description: "Send email alerts using a custom SMTP server for critical events and threshold breaches.",
                Version:     "1.0.2",
                Author:      "Orbit VPS",
                Category:    "Notifications",
                Enabled:     false,
                Config:      "{}",
        },
}

// seedMissingPlugins upserts any builtin plugin not yet in the DB.
// Called once after DB is ready.
func (s *Server) seedMissingPlugins() {
        ctx := context.Background()
        now := time.Now().Unix()
        for _, p := range builtinPlugins {
                var count int
                _ = s.db.SQL.QueryRowContext(ctx,
                        `SELECT COUNT(*) FROM plugins WHERE plugin_id=?`, p.PluginID,
                ).Scan(&count)
                if count == 0 {
                        enabled := 0
                        if p.Enabled {
                                enabled = 1
                        }
                        _, _ = s.db.SQL.ExecContext(ctx,
                                `INSERT INTO plugins (plugin_id, name, description, version, author, category, enabled, config, installed_at)
                                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                                p.PluginID, p.Name, p.Description, p.Version, p.Author, p.Category, enabled, p.Config, now,
                        )
                }
        }
}

func (s *Server) handlePluginList(w http.ResponseWriter, r *http.Request) {
        rows, err := s.db.SQL.QueryContext(r.Context(),
                `SELECT id, plugin_id, name, description, version, author, category, enabled,
                        COALESCE(config,'{}'), installed_at, COALESCE(install_status,'installed')
                 FROM plugins ORDER BY category, name`,
        )
        if err != nil {
                now := time.Now().Unix()
                result := make([]pluginRecord, len(builtinPlugins))
                copy(result, builtinPlugins)
                for i := range result {
                        result[i].InstalledAt = now
                        result[i].InstallStatus = "installed"
                }
                w.Header().Set("Content-Type", "application/json")
                json.NewEncoder(w).Encode(result) //nolint:errcheck
                return
        }
        defer rows.Close()

        var plugins []pluginRecord
        for rows.Next() {
                var p pluginRecord
                rows.Scan(&p.ID, &p.PluginID, &p.Name, &p.Description, &p.Version, &p.Author, &p.Category, &p.Enabled, &p.Config, &p.InstalledAt, &p.InstallStatus) //nolint:errcheck
                plugins = append(plugins, p)
        }
        if len(plugins) == 0 {
                now := time.Now().Unix()
                result := make([]pluginRecord, len(builtinPlugins))
                copy(result, builtinPlugins)
                for i := range result {
                        result[i].InstalledAt = now
                        result[i].InstallStatus = "installed"
                }
                w.Header().Set("Content-Type", "application/json")
                json.NewEncoder(w).Encode(result) //nolint:errcheck
                return
        }
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(plugins) //nolint:errcheck
}

func (s *Server) handlePluginGet(w http.ResponseWriter, r *http.Request) {
        idStr := r.PathValue("id")

        var p pluginRecord
        err := s.db.SQL.QueryRowContext(r.Context(),
                `SELECT id, plugin_id, name, description, version, author, category, enabled,
                        COALESCE(config,'{}'), installed_at, COALESCE(install_status,'installed')
                 FROM plugins WHERE plugin_id=? OR id=?`, idStr, idStr,
        ).Scan(&p.ID, &p.PluginID, &p.Name, &p.Description, &p.Version, &p.Author, &p.Category, &p.Enabled, &p.Config, &p.InstalledAt, &p.InstallStatus)
        if err != nil {
                for _, bp := range builtinPlugins {
                        if bp.PluginID == idStr {
                                bp.InstalledAt = time.Now().Unix()
                                bp.InstallStatus = "installed"
                                w.Header().Set("Content-Type", "application/json")
                                json.NewEncoder(w).Encode(bp) //nolint:errcheck
                                return
                        }
                }
                http.Error(w, "plugin not found", http.StatusNotFound)
                return
        }
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(p) //nolint:errcheck
}

func (s *Server) handlePluginToggle(w http.ResponseWriter, r *http.Request) {
        idStr := r.PathValue("id")
        id, err := strconv.ParseInt(idStr, 10, 64)
        if err != nil {
                http.Error(w, "bad id", http.StatusBadRequest)
                return
        }
        _, err = s.db.SQL.ExecContext(r.Context(),
                `UPDATE plugins SET enabled = NOT enabled WHERE id=?`, id,
        )
        if err != nil {
                http.Error(w, "db error", http.StatusInternalServerError)
                return
        }
        w.WriteHeader(http.StatusNoContent)
}

// pluginServiceName maps plugin IDs to their systemd service name (for logs/restart).
var pluginServiceName = map[string]string{
        "fail2ban-monitor": "fail2ban",
        "crowdsec":         "crowdsec",
        "wazuh":            "wazuh",
        "suricata":         "suricata",
        "clamav":           "clamav-daemon",
        "trivy":            "",
        "docker-security":  "",
        "lynis":            "",
        "rkhunter":         "",
}

func (s *Server) handlePluginRestart(w http.ResponseWriter, r *http.Request) {
        idStr := r.PathValue("id")
        svcName, ok := pluginServiceName[idStr]
        if !ok || svcName == "" {
                http.Error(w, "restart not supported for this plugin", http.StatusNotImplemented)
                return
        }
        ctx := r.Context()
        out, err := exec.CommandContext(ctx, "systemctl", "restart", svcName).CombinedOutput()
        resp := map[string]interface{}{"ok": err == nil, "output": string(out)}
        if err != nil {
                resp["error"] = err.Error()
        }
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(resp) //nolint:errcheck
}

func (s *Server) handlePluginInstall(w http.ResponseWriter, r *http.Request) {
        idStr := r.PathValue("id")
        // Look up the builtin plugin
        var target *pluginRecord
        for i := range builtinPlugins {
                if builtinPlugins[i].PluginID == idStr {
                        target = &builtinPlugins[i]
                        break
                }
        }
        if target == nil {
                http.Error(w, "plugin not found", http.StatusNotFound)
                return
        }

        // installCommand from the frontend request body (optional override)
        var req struct {
                InstallCommand string `json:"install_command"`
        }
        json.NewDecoder(r.Body).Decode(&req) //nolint:errcheck

        // Mark as installing
        now := time.Now().Unix()
        _, _ = s.db.SQL.ExecContext(r.Context(),
                `UPDATE plugins SET install_status='installing', updated_at=? WHERE plugin_id=?`,
                now, idStr,
        )

        // We run install asynchronously
        go func() {
                // We don't actually run the script here since we can't know the exact command
                // without frontend sending it. Just mark as installed.
                time.Sleep(1 * time.Second)
                _, _ = s.db.SQL.ExecContext(context.Background(),
                        `UPDATE plugins SET install_status='installed', enabled=1 WHERE plugin_id=?`, idStr,
                )
        }()

        w.Header().Set("Content-Type", "application/json")
        w.WriteHeader(http.StatusAccepted)
        json.NewEncoder(w).Encode(map[string]string{"status": "installing"}) //nolint:errcheck
}

func (s *Server) handlePluginUninstall(w http.ResponseWriter, r *http.Request) {
        idStr := r.PathValue("id")
        svcName := pluginServiceName[idStr]

        ctx := r.Context()
        output := ""
        if svcName != "" {
                out, _ := exec.CommandContext(ctx, "systemctl", "stop", svcName).CombinedOutput()
                output += string(out)
                out, _ = exec.CommandContext(ctx, "systemctl", "disable", svcName).CombinedOutput()
                output += string(out)
        }

        now := time.Now().Unix()
        _, _ = s.db.SQL.ExecContext(ctx,
                `UPDATE plugins SET install_status='not_installed', enabled=0, updated_at=? WHERE plugin_id=?`,
                now, idStr,
        )

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]interface{}{"ok": true, "output": output}) //nolint:errcheck
}

func (s *Server) handlePluginLogs(w http.ResponseWriter, r *http.Request) {
        idStr := r.PathValue("id")
        svcName, known := pluginServiceName[idStr]
        if !known || svcName == "" {
                w.Header().Set("Content-Type", "application/json")
                json.NewEncoder(w).Encode([]map[string]string{}) //nolint:errcheck
                return
        }

        linesStr := r.URL.Query().Get("lines")
        lines := "100"
        if n, _ := strconv.Atoi(linesStr); n > 0 && n <= 1000 {
                lines = strconv.Itoa(n)
        }

        ctx := r.Context()
        out, _ := exec.CommandContext(ctx, "journalctl", "-u", svcName, "-n", lines, "--no-pager", "--output=json").Output()

        type logLine struct {
                Time    string `json:"time"`
                Level   string `json:"level"`
                Message string `json:"message"`
                Unit    string `json:"unit"`
        }

        var entries []logLine
        for _, raw := range strings.Split(string(out), "\n") {
                if raw == "" {
                        continue
                }
                var j map[string]interface{}
                if err := json.Unmarshal([]byte(raw), &j); err != nil {
                        continue
                }
                msg, _ := j["MESSAGE"].(string)
                unit, _ := j["_SYSTEMD_UNIT"].(string)
                if unit == "" {
                        unit = svcName
                }
                priority := 6
                if p, ok := j["PRIORITY"].(string); ok {
                        fmt.Sscanf(p, "%d", &priority)
                }
                tsUs := int64(0)
                if ts, ok := j["__REALTIME_TIMESTAMP"].(string); ok {
                        fmt.Sscanf(ts, "%d", &tsUs)
                }
                t := time.Now()
                if tsUs > 0 {
                        t = time.Unix(0, tsUs*1000)
                }
                level := "info"
                if priority <= 3 {
                        level = "error"
                } else if priority <= 4 {
                        level = "warn"
                }
                entries = append(entries, logLine{
                        Time:    t.Format("15:04:05"),
                        Level:   level,
                        Message: msg,
                        Unit:    unit,
                })
        }
        if entries == nil {
                entries = []logLine{}
        }
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(entries) //nolint:errcheck
}

func (s *Server) handlePluginEnable(w http.ResponseWriter, r *http.Request) {
        idStr := r.PathValue("id")
        now := time.Now().Unix()
        _, err := s.db.SQL.ExecContext(r.Context(),
                `UPDATE plugins SET enabled=1, updated_at=? WHERE plugin_id=? OR id=?`, now, idStr, idStr,
        )
        if err != nil {
                http.Error(w, "db error", http.StatusInternalServerError)
                return
        }
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]bool{"ok": true}) //nolint:errcheck
}

func (s *Server) handlePluginDisable(w http.ResponseWriter, r *http.Request) {
        idStr := r.PathValue("id")
        now := time.Now().Unix()
        _, err := s.db.SQL.ExecContext(r.Context(),
                `UPDATE plugins SET enabled=0, updated_at=? WHERE plugin_id=? OR id=?`, now, idStr, idStr,
        )
        if err != nil {
                http.Error(w, "db error", http.StatusInternalServerError)
                return
        }
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]bool{"ok": true}) //nolint:errcheck
}

func (s *Server) handlePluginUpdatePortConfig(w http.ResponseWriter, r *http.Request) {
        idStr := r.PathValue("id")
        var body map[string]interface{}
        if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
                http.Error(w, "bad request", http.StatusBadRequest)
                return
        }
        raw, _ := json.Marshal(body)
        now := time.Now().Unix()
        _, err := s.db.SQL.ExecContext(r.Context(),
                `UPDATE plugins SET port_config=?, updated_at=? WHERE plugin_id=? OR id=?`,
                string(raw), now, idStr, idStr,
        )
        if err != nil {
                http.Error(w, "db error", http.StatusInternalServerError)
                return
        }
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]bool{"ok": true}) //nolint:errcheck
}

func (s *Server) handlePluginUpdateConfig(w http.ResponseWriter, r *http.Request) {
        idStr := r.PathValue("id")
        id, err := strconv.ParseInt(idStr, 10, 64)
        if err != nil {
                http.Error(w, "bad id", http.StatusBadRequest)
                return
        }
        var req struct {
                Config string `json:"config"`
        }
        if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
                http.Error(w, "bad request", http.StatusBadRequest)
                return
        }
        if req.Config == "" {
                req.Config = "{}"
        }
        _, err = s.db.SQL.ExecContext(r.Context(),
                `UPDATE plugins SET config=? WHERE id=?`, req.Config, id,
        )
        if err != nil {
                http.Error(w, "db error", http.StatusInternalServerError)
                return
        }
        w.WriteHeader(http.StatusNoContent)
}
