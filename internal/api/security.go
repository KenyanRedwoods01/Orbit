package api

import (
        "encoding/json"
        "fmt"
        "net/http"
        "os/exec"
        "strings"
        "time"
)

type securityFinding struct {
        ID          string `json:"id"`
        Title       string `json:"title"`
        Description string `json:"description"`
        Severity    string `json:"severity"`
        Category    string `json:"category"`
        Remediation string `json:"remediation,omitempty"`
}

type securityAuditResult struct {
        Score     float64           `json:"score"`
        Grade     string            `json:"grade"`
        Findings  []securityFinding `json:"findings"`
        ScannedAt string            `json:"scanned_at"`
}

func (s *Server) handleSecurityAudit(w http.ResponseWriter, r *http.Request) {
        var findings []securityFinding

        findings = append(findings, auditSSHFindings()...)
        findings = append(findings, auditPortFindings()...)
        findings = append(findings, auditLoginFindings()...)
        findings = append(findings, auditUpdateFindings()...)
        findings = append(findings, auditFilePermFindings()...)

        if findings == nil {
                findings = []securityFinding{}
        }

        score := 100.0
        for _, f := range findings {
                switch f.Severity {
                case "critical":
                        score -= 25
                case "high":
                        score -= 15
                case "medium":
                        score -= 8
                case "low":
                        score -= 3
                }
        }
        if score < 0 {
                score = 0
        }

        grade := "A"
        switch {
        case score < 40:
                grade = "F"
        case score < 55:
                grade = "D"
        case score < 70:
                grade = "C"
        case score < 85:
                grade = "B"
        }

        audit := securityAuditResult{
                Score:     score,
                Grade:     grade,
                Findings:  findings,
                ScannedAt: time.Now().UTC().Format(time.RFC3339),
        }
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(audit) //nolint:errcheck
}

func readSSHConfig() map[string]string {
        cfg := map[string]string{
                "permitrootlogin":       "unknown",
                "passwordauthentication": "unknown",
                "pubkeyauthentication":  "yes",
                "port":                  "22",
                "x11forwarding":         "no",
                "maxauthtries":          "6",
                "permitemptypasswords":  "no",
        }
        data, err := exec.Command("sshd", "-T").Output()
        if err != nil {
                return cfg
        }
        for _, line := range strings.Split(string(data), "\n") {
                parts := strings.Fields(line)
                if len(parts) < 2 {
                        continue
                }
                cfg[strings.ToLower(parts[0])] = parts[1]
        }
        return cfg
}

func auditSSHFindings() []securityFinding {
        cfg := readSSHConfig()
        var findings []securityFinding

        if v := cfg["permitrootlogin"]; v == "yes" {
                findings = append(findings, securityFinding{
                        ID:          "ssh-root-login",
                        Title:       "SSH Root Login Enabled",
                        Description: "Direct root login via SSH is permitted, which is a significant security risk.",
                        Severity:    "high",
                        Category:    "SSH Configuration",
                        Remediation: "Set PermitRootLogin to 'no' or 'prohibit-password' in /etc/ssh/sshd_config",
                })
        }

        if v := cfg["passwordauthentication"]; v == "yes" {
                findings = append(findings, securityFinding{
                        ID:          "ssh-password-auth",
                        Title:       "SSH Password Authentication Enabled",
                        Description: "Password-based SSH authentication is enabled. Key-based authentication is more secure.",
                        Severity:    "medium",
                        Category:    "SSH Configuration",
                        Remediation: "Set PasswordAuthentication to 'no' in /etc/ssh/sshd_config and use SSH keys.",
                })
        }

        if v := cfg["permitemptypasswords"]; v == "yes" {
                findings = append(findings, securityFinding{
                        ID:          "ssh-empty-passwords",
                        Title:       "SSH Empty Passwords Permitted",
                        Description: "SSH allows login with empty passwords, which is a critical vulnerability.",
                        Severity:    "critical",
                        Category:    "SSH Configuration",
                        Remediation: "Set PermitEmptyPasswords to 'no' in /etc/ssh/sshd_config.",
                })
        }

        if v := cfg["x11forwarding"]; v == "yes" {
                findings = append(findings, securityFinding{
                        ID:          "ssh-x11-forwarding",
                        Title:       "SSH X11 Forwarding Enabled",
                        Description: "X11 forwarding allows attackers to intercept X11 sessions if exploited.",
                        Severity:    "low",
                        Category:    "SSH Configuration",
                        Remediation: "Set X11Forwarding to 'no' in /etc/ssh/sshd_config unless required.",
                })
        }

        if v := cfg["port"]; v == "22" {
                findings = append(findings, securityFinding{
                        ID:          "ssh-default-port",
                        Title:       "SSH Using Default Port 22",
                        Description: "Using the default SSH port (22) makes the server an easy target for automated brute-force attacks.",
                        Severity:    "info",
                        Category:    "SSH Configuration",
                        Remediation: "Consider changing SSH to a non-standard port in /etc/ssh/sshd_config.",
                })
        }

        var maxTries int
        fmt.Sscanf(cfg["maxauthtries"], "%d", &maxTries)
        if maxTries > 4 {
                findings = append(findings, securityFinding{
                        ID:          "ssh-max-auth-tries",
                        Title:       "SSH MaxAuthTries Too High",
                        Description: fmt.Sprintf("MaxAuthTries is set to %d. Higher values increase brute-force risk.", maxTries),
                        Severity:    "low",
                        Category:    "SSH Configuration",
                        Remediation: "Set MaxAuthTries to 3 or lower in /etc/ssh/sshd_config.",
                })
        }

        return findings
}

func auditPortFindings() []securityFinding {
        out, err := exec.Command("ss", "-tlnup").Output()
        if err != nil {
                return nil
        }
        var findings []securityFinding
        portCount := 0
        dangerPorts := map[string]string{
                "21":   "FTP (unencrypted file transfer)",
                "23":   "Telnet (unencrypted remote access)",
                "3306": "MySQL exposed publicly",
                "5432": "PostgreSQL exposed publicly",
                "6379": "Redis exposed without authentication",
                "27017": "MongoDB exposed publicly",
        }
        listenPorts := map[string]bool{}
        for _, line := range strings.Split(string(out), "\n") {
                line = strings.TrimSpace(line)
                if line == "" || strings.HasPrefix(line, "Netid") {
                        continue
                }
                fields := strings.Fields(line)
                if len(fields) < 5 {
                        continue
                }
                addr := fields[4]
                lastColon := strings.LastIndex(addr, ":")
                if lastColon < 0 {
                        continue
                }
                port := addr[lastColon+1:]
                if !listenPorts[port] {
                        listenPorts[port] = true
                        portCount++
                }
        }
        for port, desc := range dangerPorts {
                if listenPorts[port] {
                        findings = append(findings, securityFinding{
                                ID:          "open-port-" + port,
                                Title:       fmt.Sprintf("Insecure Port %s Open", port),
                                Description: fmt.Sprintf("Port %s is open: %s. Consider restricting access.", port, desc),
                                Severity:    "medium",
                                Category:    "Network Security",
                                Remediation: fmt.Sprintf("Restrict access to port %s via firewall rules or disable the service if not needed.", port),
                        })
                }
        }
        if portCount > 15 {
                findings = append(findings, securityFinding{
                        ID:          "open-ports-high-count",
                        Title:       fmt.Sprintf("High Number of Open Ports (%d)", portCount),
                        Description: "A large number of open ports increases the attack surface.",
                        Severity:    "low",
                        Category:    "Network Security",
                        Remediation: "Review and close any ports that are not needed using a firewall.",
                })
        }
        return findings
}

func auditLoginFindings() []securityFinding {
        out, err := exec.Command("sh", "-c",
                `grep -c "Failed password" /var/log/auth.log 2>/dev/null || echo 0`,
        ).Output()
        if err != nil {
                return nil
        }
        count := 0
        fmt.Sscanf(strings.TrimSpace(string(out)), "%d", &count)

        if count > 100 {
                return []securityFinding{{
                        ID:          "failed-logins-critical",
                        Title:       fmt.Sprintf("High Failed Login Attempts (%d)", count),
                        Description: fmt.Sprintf("%d failed SSH login attempts detected. This may indicate a brute-force attack.", count),
                        Severity:    "high",
                        Category:    "Access Control",
                        Remediation: "Consider installing fail2ban to automatically block IPs with repeated failed logins.",
                }}
        }
        if count > 20 {
                return []securityFinding{{
                        ID:          "failed-logins-medium",
                        Title:       fmt.Sprintf("Elevated Failed Login Attempts (%d)", count),
                        Description: fmt.Sprintf("%d failed SSH login attempts detected.", count),
                        Severity:    "medium",
                        Category:    "Access Control",
                        Remediation: "Monitor login activity and consider installing fail2ban.",
                }}
        }
        return nil
}

func auditUpdateFindings() []securityFinding {
        out, err := exec.Command("sh", "-c",
                `apt-get -s upgrade 2>/dev/null | grep -E "^[0-9]+ upgraded" | head -1`,
        ).Output()
        if err != nil {
                return nil
        }
        line := strings.TrimSpace(string(out))
        if line == "" {
                return nil
        }
        var total, security int
        fmt.Sscanf(line, "%d upgraded", &total)

        secOut, _ := exec.Command("sh", "-c",
                `apt-get -s upgrade 2>/dev/null | grep -i "security" | wc -l`,
        ).Output()
        fmt.Sscanf(strings.TrimSpace(string(secOut)), "%d", &security)

        var findings []securityFinding
        if security > 0 {
                findings = append(findings, securityFinding{
                        ID:          "security-updates-pending",
                        Title:       fmt.Sprintf("%d Security Updates Available", security),
                        Description: "Security updates are available and should be applied promptly.",
                        Severity:    "high",
                        Category:    "System Updates",
                        Remediation: "Run 'apt-get upgrade' to apply pending updates.",
                })
        } else if total > 0 {
                findings = append(findings, securityFinding{
                        ID:          "updates-pending",
                        Title:       fmt.Sprintf("%d Package Updates Available", total),
                        Description: fmt.Sprintf("%d package updates are available.", total),
                        Severity:    "low",
                        Category:    "System Updates",
                        Remediation: "Run 'apt-get upgrade' to apply pending updates.",
                })
        }
        return findings
}

// ── Security Stats endpoint ────────────────────────────────────────────────

type securityStatsResult struct {
        FailedLogins   int    `json:"failed_logins"`
        BannedIPs      int    `json:"banned_ips"`
        BlockedAttacks int    `json:"blocked_attacks"`
        MalwareFound   int    `json:"malware_found"`
        Period         string `json:"period"`
}

func (s *Server) handleSecurityStats(w http.ResponseWriter, r *http.Request) {
        stats := securityStatsResult{Period: "24h"}

        // Failed SSH logins from auth logs
        out, _ := exec.Command("sh", "-c",
                `grep -c "Failed password" /var/log/auth.log 2>/dev/null || `+
                        `grep -c "Failed password" /var/log/secure 2>/dev/null || echo 0`).Output()
        fmt.Sscanf(strings.TrimSpace(string(out)), "%d", &stats.FailedLogins)

        // Banned IPs via fail2ban sshd jail
        if out2, err := exec.Command("fail2ban-client", "status", "sshd").Output(); err == nil {
                for _, line := range strings.Split(string(out2), "\n") {
                        if strings.Contains(line, "Total banned") {
                                parts := strings.SplitN(line, ":", 2)
                                if len(parts) == 2 {
                                        fmt.Sscanf(strings.TrimSpace(parts[1]), "%d", &stats.BannedIPs)
                                }
                        }
                }
        }

        // Blocked packets from iptables DROP rules (INPUT chain)
        if out3, err := exec.Command("iptables", "-L", "INPUT", "-n", "-v").Output(); err == nil {
                for _, line := range strings.Split(string(out3), "\n") {
                        if strings.Contains(line, "DROP") {
                                fields := strings.Fields(line)
                                if len(fields) > 0 {
                                        var pkts int
                                        fmt.Sscanf(fields[0], "%d", &pkts)
                                        stats.BlockedAttacks += pkts
                                }
                        }
                }
        }

        // ClamAV last scan result
        if out4, err := exec.Command("sh", "-c",
                `clamscan --no-summary / 2>/dev/null | grep -c "FOUND" || echo 0`).Output(); err == nil {
                fmt.Sscanf(strings.TrimSpace(string(out4)), "%d", &stats.MalwareFound)
        }

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(stats) //nolint:errcheck
}

func auditFilePermFindings() []securityFinding {
        var findings []securityFinding

        criticalFiles := []struct {
                path     string
                maxPerm  string
                title    string
                severity string
        }{
                {"/etc/passwd", "644", "/etc/passwd World-Writable", "critical"},
                {"/etc/shadow", "640", "/etc/shadow Too Permissive", "critical"},
                {"/etc/sudoers", "440", "/etc/sudoers Too Permissive", "high"},
        }

        for _, cf := range criticalFiles {
                out, err := exec.Command("stat", "-c", "%a", cf.path).Output()
                if err != nil {
                        continue
                }
                perm := strings.TrimSpace(string(out))
                if perm > cf.maxPerm {
                        findings = append(findings, securityFinding{
                                ID:          "perm-" + strings.ReplaceAll(cf.path, "/", "-"),
                                Title:       cf.title,
                                Description: fmt.Sprintf("%s has permissions %s (expected <= %s).", cf.path, perm, cf.maxPerm),
                                Severity:    cf.severity,
                                Category:    "File Permissions",
                                Remediation: fmt.Sprintf("Run: chmod %s %s", cf.maxPerm, cf.path),
                        })
                }
        }

        out, err := exec.Command("sh", "-c",
                `find /etc -name "*.conf" -perm /o+w 2>/dev/null | head -5`,
        ).Output()
        if err == nil && strings.TrimSpace(string(out)) != "" {
                findings = append(findings, securityFinding{
                        ID:          "world-writable-configs",
                        Title:       "World-Writable Config Files Found",
                        Description: "Some configuration files in /etc are world-writable.",
                        Severity:    "medium",
                        Category:    "File Permissions",
                        Remediation: "Run: find /etc -name '*.conf' -perm /o+w -exec chmod o-w {} \\;",
                })
        }

        return findings
}
