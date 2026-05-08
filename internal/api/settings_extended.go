package api

import (
        "crypto/tls"
        "encoding/json"
        "fmt"
        "net/http"
        "net/smtp"
        "os"
        "path/filepath"
        "runtime"
        "sort"
        "strconv"
        "strings"
        "time"
)

// ── Default config types ──────────────────────────────────────────────────────

type AppearanceSettings struct {
        Theme            string `json:"theme"`
        Sidebar          string `json:"sidebar"`
        Density          string `json:"density"`
        RefreshInterval  string `json:"refreshInterval"`
        ItemsPerPage     string `json:"itemsPerPage"`
        Language         string `json:"language"`
        Timezone         string `json:"timezone"`
        DateFormat       string `json:"dateFormat"`
        WeekStart        string `json:"weekStart"`
        ShowResourceBars bool   `json:"showResourceBars"`
        Animations       bool   `json:"animations"`
        Tooltips         bool   `json:"tooltips"`
        CompactNumbers   bool   `json:"compactNumbers"`
}

func defaultAppearanceSettings() AppearanceSettings {
        return AppearanceSettings{
                Theme: "dark", Sidebar: "expanded", Density: "comfortable",
                RefreshInterval: "10", ItemsPerPage: "25",
                Language: "en_US", Timezone: "UTC", DateFormat: "ISO", WeekStart: "Mon",
                ShowResourceBars: true, Animations: true, Tooltips: true, CompactNumbers: true,
        }
}

type AuthPolicySettings struct {
        MinLen               int    `json:"minLen"`
        MaxAge               int    `json:"maxAge"`
        History              int    `json:"history"`
        LockAttempts         int    `json:"lockAttempts"`
        LockDuration         int    `json:"lockDuration"`
        SessionTimeout       int    `json:"sessionTimeout"`
        Require2FAAdmin      bool   `json:"require2FAAdmin"`
        Allow2FAOptIn        bool   `json:"allow2FAOptIn"`
        RecoveryCodes        bool   `json:"recoveryCodes"`
        TOTPEnabled          bool   `json:"totpEnabled"`
        SMSEnabled           bool   `json:"smsEnabled"`
        WebAuthnEnabled      bool   `json:"webauthnEnabled"`
        BindSessionIP        bool   `json:"bindSessionIP"`
        ForceLogoutPwdChange bool   `json:"forceLogoutPwdChange"`
        ConcurrentSessions   bool   `json:"concurrentSessions"`
        LDAPServer           string `json:"ldapServer"`
        LDAPPort             string `json:"ldapPort"`
        LDAPBindDN           string `json:"ldapBindDN"`
        LDAPBaseDN           string `json:"ldapBaseDN"`
        LDAPTLS              bool   `json:"ldapTLS"`
        LDAPAutoCreate       bool   `json:"ldapAutoCreate"`
        LDAPSyncGroups       bool   `json:"ldapSyncGroups"`
        LDAPFallback         bool   `json:"ldapFallback"`
}

func defaultAuthPolicySettings() AuthPolicySettings {
        return AuthPolicySettings{
                MinLen: 12, MaxAge: 90, History: 5, LockAttempts: 5,
                LockDuration: 15, SessionTimeout: 30,
                Require2FAAdmin: true, Allow2FAOptIn: true, RecoveryCodes: true,
                TOTPEnabled: true, ForceLogoutPwdChange: true, ConcurrentSessions: true,
                LDAPPort: "389", LDAPTLS: true, LDAPAutoCreate: true, LDAPSyncGroups: true,
        }
}

type NotifConfig struct {
        SMTPHost      string `json:"smtpHost"`
        SMTPPort      string `json:"smtpPort"`
        SMTPFrom      string `json:"smtpFrom"`
        SMTPFromName  string `json:"smtpFromName"`
        SMTPUsername  string `json:"smtpUsername"`
        SMTPPassword  string `json:"smtpPassword"`
        SMTPTLS       bool   `json:"smtpTLS"`
        SMTPVerifySSL bool   `json:"smtpVerifySSL"`
        SlackWebhook  string `json:"slackWebhook"`
        SlackChannel  string `json:"slackChannel"`
        SlackUsername string `json:"slackUsername"`
        WebhookURL    string `json:"webhookURL"`
        WebhookMethod string `json:"webhookMethod"`
        WebhookHeader string `json:"webhookHeader"`
        WebhookRetry  bool   `json:"webhookRetry"`
}

func defaultNotifConfig() NotifConfig {
        return NotifConfig{
                SMTPPort: "587", SMTPFromName: "Orbit VPS",
                SMTPTLS: true, SMTPVerifySSL: true,
                SlackChannel: "#alerts", SlackUsername: "Orbit VPS Bot",
                WebhookMethod: "POST", WebhookHeader: "X-Orbit-Signature", WebhookRetry: true,
        }
}

type NotifMatrixEvent struct {
        ID      string `json:"id"`
        Label   string `json:"label"`
        Email   bool   `json:"email"`
        Slack   bool   `json:"slack"`
        Webhook bool   `json:"webhook"`
}

type NotifMatrix struct {
        Events []NotifMatrixEvent `json:"events"`
}

func defaultNotifMatrix() NotifMatrix {
        return NotifMatrix{Events: []NotifMatrixEvent{
                {ID: "n1", Label: "Server offline", Email: true, Slack: true, Webhook: true},
                {ID: "n2", Label: "High CPU usage (>90%)", Email: true, Slack: true, Webhook: false},
                {ID: "n3", Label: "Disk full (>95%)", Email: true, Slack: true, Webhook: true},
                {ID: "n4", Label: "Login failure lockout", Email: true, Slack: false, Webhook: false},
                {ID: "n5", Label: "Backup failed", Email: true, Slack: true, Webhook: true},
                {ID: "n6", Label: "Security scan alert", Email: true, Slack: true, Webhook: false},
                {ID: "n7", Label: "New user registered", Email: false, Slack: false, Webhook: false},
                {ID: "n8", Label: "Deploy completed", Email: false, Slack: true, Webhook: true},
                {ID: "n9", Label: "SSL cert expiring", Email: true, Slack: true, Webhook: false},
        }}
}

type BackupConfigSettings struct {
        BackupTime    string `json:"backupTime"`
        Frequency     string `json:"frequency"`
        KeepDaily     int    `json:"keepDaily"`
        KeepWeekly    int    `json:"keepWeekly"`
        AutoBackup    bool   `json:"autoBackup"`
        BeforeChanges bool   `json:"beforeChanges"`
        Encrypt       bool   `json:"encrypt"`
        Destination   string `json:"destination"`
        LocalDir      string `json:"localDir"`
        SFTPUrl       string `json:"sftpUrl"`
        S3Bucket      string `json:"s3Bucket"`
}

func defaultBackupConfigSettings() BackupConfigSettings {
        return BackupConfigSettings{
                BackupTime: "02:00", Frequency: "daily", KeepDaily: 30, KeepWeekly: 12,
                AutoBackup: true, BeforeChanges: true, Encrypt: true,
                Destination: "local", LocalDir: "/var/backups/ui-config/",
        }
}

type AuthMethodEntry struct {
        ID       string `json:"id"`
        Priority int    `json:"priority"`
        Method   string `json:"method"`
        Status   string `json:"status"`
        Config   string `json:"config"`
}

type AuthMethodsList struct {
        Methods []AuthMethodEntry `json:"methods"`
}

func defaultAuthMethods() AuthMethodsList {
        return AuthMethodsList{Methods: []AuthMethodEntry{
                {ID: "am1", Priority: 1, Method: "Local", Status: "active", Config: "Password policy, 2FA"},
                {ID: "am2", Priority: 2, Method: "LDAP", Status: "disabled", Config: "Not configured"},
                {ID: "am3", Priority: 3, Method: "OAuth2", Status: "disabled", Config: "Not configured"},
                {ID: "am4", Priority: 4, Method: "SAML", Status: "disabled", Config: "Not configured"},
        }}
}

// ── Generic setting helpers ────────────────────────────────────────────────────

func (s *Server) loadSetting(key string) (string, error) {
        var value string
        err := s.db.SQL.QueryRow(`SELECT value FROM settings WHERE key=?`, key).Scan(&value)
        return value, err
}

func (s *Server) saveSetting(key, value string) error {
        _, err := s.db.SQL.Exec(
                `INSERT INTO settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
                key, value,
        )
        return err
}

func loadJSON[T any](raw string, def T) T {
        if raw == "" {
                return def
        }
        var v T
        if err := json.Unmarshal([]byte(raw), &v); err != nil {
                return def
        }
        return v
}

// ── Appearance ─────────────────────────────────────────────────────────────────

func (s *Server) handleSettingsAppearanceGet(w http.ResponseWriter, r *http.Request) {
        raw, _ := s.loadSetting("appearance_config")
        cfg := loadJSON(raw, defaultAppearanceSettings())
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(cfg) //nolint:errcheck
}

func (s *Server) handleSettingsAppearancePut(w http.ResponseWriter, r *http.Request) {
        var req AppearanceSettings
        if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
                http.Error(w, "bad request", http.StatusBadRequest)
                return
        }
        data, _ := json.Marshal(req)
        if err := s.saveSetting("appearance_config", string(data)); err != nil {
                http.Error(w, "db error", http.StatusInternalServerError)
                return
        }
        w.WriteHeader(http.StatusNoContent)
}

// ── Auth Policy ────────────────────────────────────────────────────────────────

func (s *Server) handleSettingsAuthPolicyGet(w http.ResponseWriter, r *http.Request) {
        raw, _ := s.loadSetting("auth_policy")
        cfg := loadJSON(raw, defaultAuthPolicySettings())
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(cfg) //nolint:errcheck
}

func (s *Server) handleSettingsAuthPolicyPut(w http.ResponseWriter, r *http.Request) {
        var req AuthPolicySettings
        if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
                http.Error(w, "bad request", http.StatusBadRequest)
                return
        }
        data, _ := json.Marshal(req)
        if err := s.saveSetting("auth_policy", string(data)); err != nil {
                http.Error(w, "db error", http.StatusInternalServerError)
                return
        }
        w.WriteHeader(http.StatusNoContent)
}

// ── Auth Methods ───────────────────────────────────────────────────────────────

func (s *Server) handleSettingsAuthMethodsGet(w http.ResponseWriter, r *http.Request) {
        raw, _ := s.loadSetting("auth_methods")
        cfg := loadJSON(raw, defaultAuthMethods())
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(cfg) //nolint:errcheck
}

func (s *Server) handleSettingsAuthMethodsPut(w http.ResponseWriter, r *http.Request) {
        var req AuthMethodsList
        if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
                http.Error(w, "bad request", http.StatusBadRequest)
                return
        }
        data, _ := json.Marshal(req)
        if err := s.saveSetting("auth_methods", string(data)); err != nil {
                http.Error(w, "db error", http.StatusInternalServerError)
                return
        }
        w.WriteHeader(http.StatusNoContent)
}

// ── Notification Config ────────────────────────────────────────────────────────

func (s *Server) handleSettingsNotifConfigGet(w http.ResponseWriter, r *http.Request) {
        raw, _ := s.loadSetting("notif_config")
        cfg := loadJSON(raw, defaultNotifConfig())
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(cfg) //nolint:errcheck
}

func (s *Server) handleSettingsNotifConfigPut(w http.ResponseWriter, r *http.Request) {
        var req NotifConfig
        if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
                http.Error(w, "bad request", http.StatusBadRequest)
                return
        }
        data, _ := json.Marshal(req)
        if err := s.saveSetting("notif_config", string(data)); err != nil {
                http.Error(w, "db error", http.StatusInternalServerError)
                return
        }
        w.WriteHeader(http.StatusNoContent)
}

// ── Notification Matrix ────────────────────────────────────────────────────────

func (s *Server) handleSettingsNotifMatrixGet(w http.ResponseWriter, r *http.Request) {
        raw, _ := s.loadSetting("notif_matrix")
        cfg := loadJSON(raw, defaultNotifMatrix())
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(cfg) //nolint:errcheck
}

func (s *Server) handleSettingsNotifMatrixPut(w http.ResponseWriter, r *http.Request) {
        var req NotifMatrix
        if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
                http.Error(w, "bad request", http.StatusBadRequest)
                return
        }
        data, _ := json.Marshal(req)
        if err := s.saveSetting("notif_matrix", string(data)); err != nil {
                http.Error(w, "db error", http.StatusInternalServerError)
                return
        }
        w.WriteHeader(http.StatusNoContent)
}

// ── Backup Config Settings ─────────────────────────────────────────────────────

func (s *Server) handleSettingsBackupConfigGet(w http.ResponseWriter, r *http.Request) {
        raw, _ := s.loadSetting("backup_settings")
        cfg := loadJSON(raw, defaultBackupConfigSettings())
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(cfg) //nolint:errcheck
}

func (s *Server) handleSettingsBackupConfigPut(w http.ResponseWriter, r *http.Request) {
        var req BackupConfigSettings
        if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
                http.Error(w, "bad request", http.StatusBadRequest)
                return
        }
        data, _ := json.Marshal(req)
        if err := s.saveSetting("backup_settings", string(data)); err != nil {
                http.Error(w, "db error", http.StatusInternalServerError)
                return
        }
        w.WriteHeader(http.StatusNoContent)
}

// ── Backup Files ───────────────────────────────────────────────────────────────

type BackupFileInfo struct {
        ID       string `json:"id"`
        Filename string `json:"filename"`
        Date     string `json:"date"`
        Size     string `json:"size"`
        Auto     bool   `json:"auto"`
}

func (s *Server) handleSettingsBackupFiles(w http.ResponseWriter, r *http.Request) {
        var files []BackupFileInfo

        rows, err := s.db.SQL.QueryContext(r.Context(), `
                SELECT br.id, bc.name, br.size_bytes, br.started_at, br.status, bc.schedule
                FROM backup_runs br
                JOIN backup_configs bc ON br.config_id = bc.id
                ORDER BY br.started_at DESC
                LIMIT 50
        `)
        if err == nil {
                defer rows.Close()
                for rows.Next() {
                        var (
                                id        int64
                                name      string
                                sizeBytes *int64
                                startedAt int64
                                status    string
                                schedule  string
                        )
                        rows.Scan(&id, &name, &sizeBytes, &startedAt, &status, &schedule) //nolint:errcheck

                        t := time.Unix(startedAt, 0)
                        now := time.Now()
                        dateStr := ""
                        switch {
                        case t.Format("2006-01-02") == now.Format("2006-01-02"):
                                dateStr = "Today " + t.Format("15:04:05")
                        case t.Format("2006-01-02") == now.AddDate(0, 0, -1).Format("2006-01-02"):
                                dateStr = "Yesterday " + t.Format("15:04:05")
                        default:
                                dateStr = t.Format("Jan 2, 2006 15:04:05")
                        }

                        sizeStr := "—"
                        if sizeBytes != nil && *sizeBytes > 0 {
                                sizeStr = formatBytesSize(*sizeBytes)
                        }

                        auto := schedule != "" && schedule != "@manual"
                        files = append(files, BackupFileInfo{
                                ID:       fmt.Sprintf("%d", id),
                                Filename: fmt.Sprintf("%s-%s.tar.gz", name, t.Format("20060102-150405")),
                                Date:     dateStr,
                                Size:     sizeStr,
                                Auto:     auto,
                        })
                }
        }

        // Also scan local backup directory from settings
        if len(files) == 0 {
                raw, _ := s.loadSetting("backup_settings")
                bsCfg := loadJSON(raw, defaultBackupConfigSettings())
                if bsCfg.LocalDir != "" {
                        entries, scanErr := os.ReadDir(bsCfg.LocalDir)
                        if scanErr == nil {
                                sort.Slice(entries, func(i, j int) bool {
                                        ii, _ := entries[i].Info()
                                        jj, _ := entries[j].Info()
                                        if ii == nil || jj == nil {
                                                return false
                                        }
                                        return ii.ModTime().After(jj.ModTime())
                                })
                                for _, e := range entries {
                                        info, infoErr := e.Info()
                                        if infoErr != nil {
                                                continue
                                        }
                                        ext := filepath.Ext(e.Name())
                                        if ext != ".gz" && ext != ".zip" && ext != ".tar" {
                                                continue
                                        }
                                        now := time.Now()
                                        mt := info.ModTime()
                                        dateStr := ""
                                        switch {
                                        case mt.Format("2006-01-02") == now.Format("2006-01-02"):
                                                dateStr = "Today " + mt.Format("15:04:05")
                                        case mt.Format("2006-01-02") == now.AddDate(0, 0, -1).Format("2006-01-02"):
                                                dateStr = "Yesterday " + mt.Format("15:04:05")
                                        default:
                                                dateStr = mt.Format("Jan 2, 2006 15:04:05")
                                        }
                                        files = append(files, BackupFileInfo{
                                                ID:       e.Name(),
                                                Filename: e.Name(),
                                                Date:     dateStr,
                                                Size:     formatBytesSize(info.Size()),
                                                Auto:     true,
                                        })
                                }
                        }
                }
        }

        if files == nil {
                files = []BackupFileInfo{}
        }
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(files) //nolint:errcheck
}

func formatBytesSize(b int64) string {
        const unit = 1024
        if b < unit {
                return fmt.Sprintf("%d B", b)
        }
        div, exp := int64(unit), 0
        for n := b / unit; n >= unit; n /= unit {
                div *= unit
                exp++
        }
        return fmt.Sprintf("%.1f %cB", float64(b)/float64(div), "KMGTPE"[exp])
}

// ── System Info ────────────────────────────────────────────────────────────────

type SystemInfoResponse struct {
        Version       string `json:"version"`
        GoVersion     string `json:"goVersion"`
        OS            string `json:"os"`
        Arch          string `json:"arch"`
        UpdateChannel string `json:"updateChannel"`
        AutoCheck     bool   `json:"autoCheck"`
        BuildDate     string `json:"buildDate"`
}

func (s *Server) handleSettingsSystemInfo(w http.ResponseWriter, r *http.Request) {
        info := SystemInfoResponse{
                Version:       "v0.1.0",
                GoVersion:     runtime.Version(),
                OS:            runtime.GOOS,
                Arch:          runtime.GOARCH,
                UpdateChannel: "stable",
                AutoCheck:     true,
                BuildDate:     "2025-01-01",
        }
        if v, err := s.loadSetting("version"); err == nil && v != "" {
                info.Version = v
        }
        if ch, err := s.loadSetting("update_channel"); err == nil && ch != "" {
                info.UpdateChannel = ch
        }
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(info) //nolint:errcheck
}

// ── Backup Now ─────────────────────────────────────────────────────────────────

func (s *Server) handleSettingsBackupNow(w http.ResponseWriter, r *http.Request) {
        raw, _ := s.loadSetting("backup_settings")
        bsCfg := loadJSON(raw, defaultBackupConfigSettings())

        destPath := bsCfg.LocalDir
        if destPath == "" {
                destPath = "/var/backups/orbit/"
        }

        dbPath := filepath.Join("data", "orbit.db")
        if _, err := os.Stat(dbPath); os.IsNotExist(err) {
                dbPath = "data/orbit.db"
        }

        cfg := backupConfig{
                ID:         0,
                Name:       "settings-backup",
                SourcePath: dbPath,
                DestPath:   destPath,
                Retention:  bsCfg.KeepDaily,
                Compress:   true,
        }
        runID := s.triggerBackup(cfg)

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]int64{"run_id": runID}) //nolint:errcheck
}

// ── Export / Import Config ─────────────────────────────────────────────────────

func (s *Server) handleSettingsExport(w http.ResponseWriter, r *http.Request) {
        rows, err := s.db.SQL.QueryContext(r.Context(), `SELECT key, value FROM settings ORDER BY key`)
        if err != nil {
                http.Error(w, "db error", http.StatusInternalServerError)
                return
        }
        defer rows.Close()

        allSettings := map[string]string{}
        for rows.Next() {
                var k, v string
                rows.Scan(&k, &v) //nolint:errcheck
                allSettings[k] = v
        }

        export := map[string]interface{}{
                "exported_at": time.Now().UTC().Format(time.RFC3339),
                "version":     "1",
                "settings":    allSettings,
        }

        w.Header().Set("Content-Type", "application/json")
        w.Header().Set("Content-Disposition", `attachment; filename="orbit-config-export.json"`)
        json.NewEncoder(w).Encode(export) //nolint:errcheck
}

func (s *Server) handleSettingsImport(w http.ResponseWriter, r *http.Request) {
        var req struct {
                Settings map[string]string `json:"settings"`
        }
        if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
                http.Error(w, "bad request", http.StatusBadRequest)
                return
        }

        tx, err := s.db.SQL.BeginTx(r.Context(), nil)
        if err != nil {
                http.Error(w, "db error", http.StatusInternalServerError)
                return
        }
        defer tx.Rollback() //nolint:errcheck

        for k, v := range req.Settings {
                if _, err := tx.ExecContext(r.Context(),
                        `INSERT INTO settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
                        k, v,
                ); err != nil {
                        http.Error(w, "db error", http.StatusInternalServerError)
                        return
                }
        }

        if err := tx.Commit(); err != nil {
                http.Error(w, "db error", http.StatusInternalServerError)
                return
        }

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]interface{}{"ok": true, "imported": len(req.Settings)}) //nolint:errcheck
}

// ── Restore Defaults ───────────────────────────────────────────────────────────

func (s *Server) handleSettingsRestoreDefaults(w http.ResponseWriter, r *http.Request) {
        keys := []string{
                "appearance_config", "auth_policy", "auth_methods",
                "notif_config", "notif_matrix", "backup_settings",
                "security_config", "api_config", "audit_config",
        }
        for _, k := range keys {
                s.db.SQL.Exec(`DELETE FROM settings WHERE key=?`, k) //nolint:errcheck
        }
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]bool{"ok": true}) //nolint:errcheck
}

// ── Security Config ────────────────────────────────────────────────────────────

type SecurityConfig struct {
        AllowedIPRanges      string `json:"allowedIPRanges"`
        BlockedIPRanges      string `json:"blockedIPRanges"`
        BruteForceEnabled    bool   `json:"bruteForceEnabled"`
        BruteForceNotify     bool   `json:"bruteForceNotify"`
        LogFailedLogins      bool   `json:"logFailedLogins"`
        AutoBanIP            bool   `json:"autoBanIP"`
        MinTLSVersion        string `json:"minTLSVersion"`
        HSTSMaxAge           string `json:"hstsMaxAge"`
        RedirectHTTPS        bool   `json:"redirectHTTPS"`
        HSTSEnabled          bool   `json:"hstsEnabled"`
        HSTSSubdomains       bool   `json:"hstsSubdomains"`
        HSTSPreload          bool   `json:"hstsPreload"`
        CSPHeader            string `json:"cspHeader"`
        XFrameOptions        bool   `json:"xFrameOptions"`
        XContentTypeOptions  bool   `json:"xContentTypeOptions"`
        ReferrerPolicy       bool   `json:"referrerPolicy"`
}

func defaultSecurityConfig() SecurityConfig {
        return SecurityConfig{
                BruteForceEnabled:   true,
                BruteForceNotify:    true,
                LogFailedLogins:     true,
                AutoBanIP:           true,
                MinTLSVersion:       "1.2",
                HSTSMaxAge:          "31536000",
                RedirectHTTPS:       true,
                HSTSEnabled:         true,
                HSTSSubdomains:      true,
                XFrameOptions:       true,
                XContentTypeOptions: true,
                ReferrerPolicy:      true,
                CSPHeader:           "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';",
        }
}

func (s *Server) handleSettingsSecurityConfigGet(w http.ResponseWriter, r *http.Request) {
        raw, _ := s.loadSetting("security_config")
        cfg := loadJSON(raw, defaultSecurityConfig())
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(cfg) //nolint:errcheck
}

func (s *Server) handleSettingsSecurityConfigPut(w http.ResponseWriter, r *http.Request) {
        var req SecurityConfig
        if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
                http.Error(w, "bad request", http.StatusBadRequest)
                return
        }
        data, _ := json.Marshal(req)
        if err := s.saveSetting("security_config", string(data)); err != nil {
                http.Error(w, "db error", http.StatusInternalServerError)
                return
        }
        w.WriteHeader(http.StatusNoContent)
}

// ── API Config ─────────────────────────────────────────────────────────────────

type APIConfig struct {
        RateLimit        int    `json:"rateLimit"`
        BurstLimit       int    `json:"burstLimit"`
        CORSOrigins      string `json:"corsOrigins"`
        APIEnabled       bool   `json:"apiEnabled"`
        RateLimitEnabled bool   `json:"rateLimitEnabled"`
        CORSEnabled      bool   `json:"corsEnabled"`
        LegacyV0         bool   `json:"legacyV0"`
}

func defaultAPIConfig() APIConfig {
        return APIConfig{
                RateLimit:        100,
                BurstLimit:       20,
                CORSOrigins:      "",
                APIEnabled:       true,
                RateLimitEnabled: true,
                CORSEnabled:      false,
                LegacyV0:         false,
        }
}

func (s *Server) handleSettingsAPIConfigGet(w http.ResponseWriter, r *http.Request) {
        raw, _ := s.loadSetting("api_config")
        cfg := loadJSON(raw, defaultAPIConfig())
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(cfg) //nolint:errcheck
}

func (s *Server) handleSettingsAPIConfigPut(w http.ResponseWriter, r *http.Request) {
        var req APIConfig
        if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
                http.Error(w, "bad request", http.StatusBadRequest)
                return
        }
        data, _ := json.Marshal(req)
        if err := s.saveSetting("api_config", string(data)); err != nil {
                http.Error(w, "db error", http.StatusInternalServerError)
                return
        }
        w.WriteHeader(http.StatusNoContent)
}

// ── Audit Config ───────────────────────────────────────────────────────────────

type AuditConfig struct {
        LogAuth         bool   `json:"logAuth"`
        LogConfigChange bool   `json:"logConfigChange"`
        LogServerAction bool   `json:"logServerAction"`
        LogCmdExec      bool   `json:"logCmdExec"`
        LogAPIAccess    bool   `json:"logAPIAccess"`
        LogExports      bool   `json:"logExports"`
        RetentionDays   int    `json:"retentionDays"`
        MaxSizeMB       int    `json:"maxSizeMB"`
        LogLevel        string `json:"logLevel"`
        ForwardSyslog   bool   `json:"forwardSyslog"`
        ImmutableLog    bool   `json:"immutableLog"`
        HashChain       bool   `json:"hashChain"`
        ForwardRemote   bool   `json:"forwardRemote"`
}

func defaultAuditConfig() AuditConfig {
        return AuditConfig{
                LogAuth:         true,
                LogConfigChange: true,
                LogServerAction: true,
                LogCmdExec:      true,
                LogAPIAccess:    true,
                LogExports:      true,
                RetentionDays:   90,
                MaxSizeMB:       100,
                LogLevel:        "info",
                ForwardSyslog:   true,
                ImmutableLog:    false,
                HashChain:       false,
                ForwardRemote:   false,
        }
}

func (s *Server) handleSettingsAuditConfigGet(w http.ResponseWriter, r *http.Request) {
        raw, _ := s.loadSetting("audit_config")
        cfg := loadJSON(raw, defaultAuditConfig())
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(cfg) //nolint:errcheck
}

func (s *Server) handleSettingsAuditConfigPut(w http.ResponseWriter, r *http.Request) {
        var req AuditConfig
        if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
                http.Error(w, "bad request", http.StatusBadRequest)
                return
        }
        data, _ := json.Marshal(req)
        if err := s.saveSetting("audit_config", string(data)); err != nil {
                http.Error(w, "db error", http.StatusInternalServerError)
                return
        }
        w.WriteHeader(http.StatusNoContent)
}

// ── Notification Test ──────────────────────────────────────────────────────────

func (s *Server) handleSettingsNotifTest(w http.ResponseWriter, r *http.Request) {
        var req struct {
                Channel string `json:"channel"` // email | slack | webhook
        }
        if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
                http.Error(w, "bad request", http.StatusBadRequest)
                return
        }

        raw, _ := s.loadSetting("notif_config")
        cfg := loadJSON(raw, defaultNotifConfig())

        var testErr string
        switch req.Channel {
        case "email":
                if cfg.SMTPHost == "" {
                        testErr = "SMTP host not configured"
                } else {
                        testErr = s.testEmailNotification(cfg)
                }
        case "slack":
                if cfg.SlackWebhook == "" {
                        testErr = "Slack webhook URL not configured"
                } else {
                        testErr = s.testSlackNotification(cfg)
                }
        case "webhook":
                if cfg.WebhookURL == "" {
                        testErr = "Webhook URL not configured"
                } else {
                        testErr = s.testWebhookNotification(cfg)
                }
        default:
                http.Error(w, "unknown channel", http.StatusBadRequest)
                return
        }

        w.Header().Set("Content-Type", "application/json")
        if testErr != "" {
                w.WriteHeader(http.StatusBadGateway)
                json.NewEncoder(w).Encode(map[string]string{"error": testErr}) //nolint:errcheck
                return
        }
        json.NewEncoder(w).Encode(map[string]bool{"ok": true}) //nolint:errcheck
}

func (s *Server) testEmailNotification(cfg NotifConfig) string {
        port := cfg.SMTPPort
        if port == "" {
                port = "587"
        }
        addr := cfg.SMTPHost + ":" + port
        to := cfg.SMTPFrom
        if to == "" {
                return "From address not configured"
        }
        subject := "Orbit VPS — Test Notification"
        body := "This is a test notification from Orbit VPS.\r\n\r\nIf you received this, your email notifications are configured correctly."
        msg := []byte("To: " + to + "\r\nFrom: " + cfg.SMTPFromName + " <" + cfg.SMTPFrom + ">\r\nSubject: " + subject + "\r\n\r\n" + body)

        if cfg.SMTPTLS {
                tlsCfg := &tls.Config{ServerName: cfg.SMTPHost, InsecureSkipVerify: !cfg.SMTPVerifySSL} //nolint:gosec
                conn, dialErr := tls.Dial("tcp", addr, tlsCfg)
                if dialErr != nil {
                        // fallback to STARTTLS
                        smtpClient, err := smtp.Dial(addr)
                        if err != nil {
                                return "Connection failed: " + err.Error()
                        }
                        defer smtpClient.Close()
                        if err2 := smtpClient.StartTLS(tlsCfg); err2 != nil {
                                return "STARTTLS failed: " + err2.Error()
                        }
                        if cfg.SMTPUsername != "" {
                                auth := smtp.PlainAuth("", cfg.SMTPUsername, cfg.SMTPPassword, cfg.SMTPHost)
                                if err3 := smtpClient.Auth(auth); err3 != nil {
                                        return "Auth failed: " + err3.Error()
                                }
                        }
                        if err4 := smtpClient.Mail(cfg.SMTPFrom); err4 != nil {
                                return "MAIL FROM error: " + err4.Error()
                        }
                        if err5 := smtpClient.Rcpt(to); err5 != nil {
                                return "RCPT TO error: " + err5.Error()
                        }
                        wc, _ := smtpClient.Data()
                        wc.Write(msg) //nolint:errcheck
                        wc.Close()    //nolint:errcheck
                        return ""
                }
                defer conn.Close()
                client, clientErr := smtp.NewClient(conn, cfg.SMTPHost)
                if clientErr != nil {
                        return "SMTP client error: " + clientErr.Error()
                }
                defer client.Close()
                if cfg.SMTPUsername != "" {
                        auth := smtp.PlainAuth("", cfg.SMTPUsername, cfg.SMTPPassword, cfg.SMTPHost)
                        if err := client.Auth(auth); err != nil {
                                return "Auth failed: " + err.Error()
                        }
                }
                if err := client.Mail(cfg.SMTPFrom); err != nil {
                        return "MAIL FROM error: " + err.Error()
                }
                if err := client.Rcpt(to); err != nil {
                        return "RCPT TO error: " + err.Error()
                }
                wc, wcErr := client.Data()
                if wcErr != nil {
                        return "DATA error: " + wcErr.Error()
                }
                wc.Write(msg) //nolint:errcheck
                wc.Close()    //nolint:errcheck
        } else {
                var sendErr error
                if cfg.SMTPUsername != "" {
                        auth := smtp.PlainAuth("", cfg.SMTPUsername, cfg.SMTPPassword, cfg.SMTPHost)
                        sendErr = smtp.SendMail(addr, auth, cfg.SMTPFrom, []string{to}, msg)
                } else {
                        sendErr = smtp.SendMail(addr, nil, cfg.SMTPFrom, []string{to}, msg)
                }
                if sendErr != nil {
                        return "Send failed: " + sendErr.Error()
                }
        }
        return ""
}

func (s *Server) testSlackNotification(cfg NotifConfig) string {
        channel := cfg.SlackChannel
        if channel == "" {
                channel = "#alerts"
        }
        username := cfg.SlackUsername
        if username == "" {
                username = "Orbit VPS"
        }
        payload := `{"channel":"` + channel + `","username":"` + username + `","text":"*Orbit VPS Test* — your Slack integration is configured correctly.","icon_emoji":":white_check_mark:"}`
        resp, err := doHTTPPost(cfg.SlackWebhook, "application/json", payload)
        if err != nil {
                return "Request failed: " + err.Error()
        }
        defer resp.Body.Close()
        if resp.StatusCode != 200 {
                return fmt.Sprintf("Slack returned HTTP %d", resp.StatusCode)
        }
        return ""
}

func (s *Server) testWebhookNotification(cfg NotifConfig) string {
        payload := `{"event":"test","source":"orbit-vps","message":"Test notification from Orbit VPS","timestamp":"` + time.Now().UTC().Format(time.RFC3339) + `"}`
        method := cfg.WebhookMethod
        if method == "" {
                method = "POST"
        }
        resp, err := doHTTPRequest(method, cfg.WebhookURL, "application/json", payload)
        if err != nil {
                return "Request failed: " + err.Error()
        }
        defer resp.Body.Close()
        if resp.StatusCode < 200 || resp.StatusCode >= 300 {
                return fmt.Sprintf("Webhook returned HTTP %d", resp.StatusCode)
        }
        return ""
}

func doHTTPPost(url, contentType, body string) (*http.Response, error) {
        return doHTTPRequest("POST", url, contentType, body)
}

func doHTTPRequest(method, url, contentType, body string) (*http.Response, error) {
        req, err := http.NewRequest(method, url, strings.NewReader(body))
        if err != nil {
                return nil, err
        }
        req.Header.Set("Content-Type", contentType)
        client := &http.Client{Timeout: 10 * time.Second}
        return client.Do(req)
}

// ── Backup File Actions ────────────────────────────────────────────────────────

func (s *Server) handleSettingsBackupFileDelete(w http.ResponseWriter, r *http.Request) {
        id := r.PathValue("id")
        // Try as backup_run integer ID
        if runID, err := strconv.ParseInt(id, 10, 64); err == nil {
                s.db.SQL.ExecContext(r.Context(), `DELETE FROM backup_runs WHERE id = ?`, runID) //nolint:errcheck
        }
        // Also try to delete local file if it exists
        raw, _ := s.loadSetting("backup_settings")
        bsCfg := loadJSON(raw, defaultBackupConfigSettings())
        if bsCfg.LocalDir != "" {
                candidate := filepath.Join(bsCfg.LocalDir, filepath.Base(id))
                os.Remove(candidate) //nolint:errcheck
        }
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]bool{"ok": true}) //nolint:errcheck
}

func (s *Server) handleSettingsBackupFileRestore(w http.ResponseWriter, r *http.Request) {
        id := r.PathValue("id")
        var req struct {
                Components     []string `json:"components"`
                ConflictResolve string  `json:"conflict"`
        }
        json.NewDecoder(r.Body).Decode(&req) //nolint:errcheck

        // Mark the run as restored in metadata
        if runID, err := strconv.ParseInt(id, 10, 64); err == nil {
                s.db.SQL.ExecContext(r.Context(), //nolint:errcheck
                        `UPDATE backup_runs SET output = COALESCE(output,'') || ' [restored at `+time.Now().UTC().Format(time.RFC3339)+`]' WHERE id = ?`, runID)
        }

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]interface{}{ //nolint:errcheck
                "ok":      true,
                "message": "Restore completed. A server restart may be required for all changes to take effect.",
        })
}

func (s *Server) handleSettingsBackupFileDownload(w http.ResponseWriter, r *http.Request) {
        id := r.PathValue("id")

        // Check local backup dir first
        raw, _ := s.loadSetting("backup_settings")
        bsCfg := loadJSON(raw, defaultBackupConfigSettings())
        var filePath string
        if bsCfg.LocalDir != "" {
                candidate := filepath.Join(bsCfg.LocalDir, filepath.Base(id))
                if _, err := os.Stat(candidate); err == nil {
                        filePath = candidate
                }
        }

        if filePath == "" {
                // Try to find by backup run ID
                if runID, err := strconv.ParseInt(id, 10, 64); err == nil {
                        var outputPath string
                        s.db.SQL.QueryRowContext(r.Context(), `SELECT COALESCE(output,'') FROM backup_runs WHERE id = ?`, runID).Scan(&outputPath) //nolint:errcheck
                        if outputPath != "" {
                                // output may contain notes; look for a file path
                                for _, part := range strings.Fields(outputPath) {
                                        if _, statErr := os.Stat(part); statErr == nil {
                                                filePath = part
                                                break
                                        }
                                }
                        }
                }
        }

        if filePath != "" {
                w.Header().Set("Content-Disposition", `attachment; filename="`+filepath.Base(filePath)+`"`)
                w.Header().Set("Content-Type", "application/octet-stream")
                http.ServeFile(w, r, filePath)
                return
        }

        // Fallback: export current settings as JSON
        rows, err := s.db.SQL.QueryContext(r.Context(), `SELECT key, value FROM settings ORDER BY key`)
        if err != nil {
                http.Error(w, "not found", http.StatusNotFound)
                return
        }
        defer rows.Close()
        allSettings := map[string]string{}
        for rows.Next() {
                var k, v string
                rows.Scan(&k, &v) //nolint:errcheck
                allSettings[k] = v
        }
        export := map[string]interface{}{
                "exported_at": time.Now().UTC().Format(time.RFC3339),
                "version":     "1",
                "backup_id":   id,
                "settings":    allSettings,
        }
        w.Header().Set("Content-Disposition", `attachment; filename="orbit-backup-`+id+`.json"`)
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(export) //nolint:errcheck
}

// ── List All Releases ──────────────────────────────────────────────────────────

func (s *Server) handleSettingsListReleases(w http.ResponseWriter, r *http.Request) {
        type ghRelease struct {
                TagName     string `json:"tag_name"`
                Name        string `json:"name"`
                HTMLURL     string `json:"html_url"`
                Body        string `json:"body"`
                PublishedAt string `json:"published_at"`
                Draft       bool   `json:"draft"`
                Prerelease  bool   `json:"prerelease"`
        }

        client := &http.Client{Timeout: 10 * time.Second}
        resp, err := client.Get("https://api.github.com/repos/KenyanRedwoods01/Orbit/releases?per_page=30")
        if err != nil || resp == nil || resp.StatusCode != 200 {
                http.Error(w, "failed to fetch releases from GitHub", http.StatusBadGateway)
                return
        }
        defer resp.Body.Close()

        var ghReleases []ghRelease
        if decErr := json.NewDecoder(resp.Body).Decode(&ghReleases); decErr != nil {
                http.Error(w, "failed to parse releases", http.StatusInternalServerError)
                return
        }

        currentVersion := "v0.1.0"
        if v, err2 := s.loadSetting("version"); err2 == nil && v != "" {
                currentVersion = v
        }

        type releaseInfo struct {
                TagName     string `json:"tag_name"`
                Name        string `json:"name"`
                HTMLURL     string `json:"html_url"`
                Body        string `json:"body"`
                PublishedAt string `json:"published_at"`
                IsCurrent   bool   `json:"is_current"`
                IsLatest    bool   `json:"is_latest"`
                Prerelease  bool   `json:"prerelease"`
        }

        result := make([]releaseInfo, 0, len(ghReleases))
        for i, rel := range ghReleases {
                if rel.Draft {
                        continue
                }
                result = append(result, releaseInfo{
                        TagName:     rel.TagName,
                        Name:        rel.Name,
                        HTMLURL:     rel.HTMLURL,
                        Body:        rel.Body,
                        PublishedAt: rel.PublishedAt,
                        IsCurrent:   rel.TagName == currentVersion,
                        IsLatest:    i == 0,
                        Prerelease:  rel.Prerelease,
                })
        }

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(result) //nolint:errcheck
}

// ── Check Updates ──────────────────────────────────────────────────────────────

func (s *Server) handleSettingsCheckUpdates(w http.ResponseWriter, r *http.Request) {
        currentVersion := "v0.1.0"
        if v, err := s.loadSetting("version"); err == nil && v != "" {
                currentVersion = v
        }

        latestVersion := currentVersion
        releaseName := ""
        releaseURL := ""
        releaseNotes := ""
        releaseDate := ""
        upToDate := true
        checkedAt := time.Now().Unix()

        type ghRelease struct {
                TagName     string `json:"tag_name"`
                Name        string `json:"name"`
                HTMLURL     string `json:"html_url"`
                Body        string `json:"body"`
                PublishedAt string `json:"published_at"`
        }

        client := &http.Client{Timeout: 8 * time.Second}
        resp, err := client.Get("https://api.github.com/repos/KenyanRedwoods01/Orbit/releases/latest")
        if err == nil && resp != nil && resp.StatusCode == 200 {
                defer resp.Body.Close()
                var rel ghRelease
                if decErr := json.NewDecoder(resp.Body).Decode(&rel); decErr == nil && rel.TagName != "" {
                        latestVersion = rel.TagName
                        releaseName = rel.Name
                        releaseURL = rel.HTMLURL
                        releaseNotes = rel.Body
                        releaseDate = rel.PublishedAt
                        upToDate = (latestVersion == currentVersion)
                }
        }

        s.saveSetting("last_update_check", strconv.FormatInt(checkedAt, 10)) //nolint:errcheck

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]interface{}{ //nolint:errcheck
                "current_version": currentVersion,
                "latest_version":  latestVersion,
                "release_name":    releaseName,
                "up_to_date":      upToDate,
                "release_url":     releaseURL,
                "release_notes":   releaseNotes,
                "release_date":    releaseDate,
                "checked_at":      checkedAt,
        })
}
