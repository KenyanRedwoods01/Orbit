package api

import (
        "crypto/tls"
        "crypto/x509"
        "encoding/json"
        "encoding/pem"
        "net/http"
        "os"
        "path/filepath"
        "strconv"
        "strings"
        "time"
)

// ── Certificate Management ────────────────────────────────────────────────────

type certEntry struct {
        ID        int64  `json:"id"`
        Domain    string `json:"domain"`
        Issuer    string `json:"issuer"`
        CertPath  string `json:"cert_path"`
        KeyPath   string `json:"key_path"`
        ExpiresAt *int64 `json:"expires_at,omitempty"`
        AutoRenew bool   `json:"auto_renew"`
        Status    string `json:"status"`
        CreatedAt int64  `json:"created_at"`
        DaysLeft  int    `json:"days_left"`
}

const letsencryptBase = "/etc/letsencrypt/live"

// scanLetsencryptCerts discovers certs from /etc/letsencrypt/live and upserts to DB.
func (s *Server) scanLetsencryptCerts(r *http.Request) {
        entries, err := os.ReadDir(letsencryptBase)
        if err != nil {
                return
        }
        for _, e := range entries {
                if !e.IsDir() {
                        continue
                }
                domain := e.Name()
                certPath := filepath.Join(letsencryptBase, domain, "fullchain.pem")
                keyPath := filepath.Join(letsencryptBase, domain, "privkey.pem")

                var expiresAt *int64
                status := "valid"
                expiry, err := parseCertExpiry(certPath)
                if err == nil {
                        t := expiry.Unix()
                        expiresAt = &t
                        if expiry.Before(time.Now()) {
                                status = "expired"
                        } else if expiry.Before(time.Now().Add(14 * 24 * time.Hour)) {
                                status = "expiring_soon"
                        }
                }

                s.db.SQL.ExecContext(r.Context(), //nolint:errcheck
                        `INSERT INTO certs (domain, issuer, cert_path, key_path, expires_at, status)
                         VALUES (?,?,?,?,?,?)
                         ON CONFLICT(domain) DO UPDATE SET cert_path=excluded.cert_path, key_path=excluded.key_path,
                         expires_at=excluded.expires_at, status=excluded.status`,
                        domain, "letsencrypt", certPath, keyPath, expiresAt, status,
                )
        }
}

func parseCertExpiry(certPath string) (time.Time, error) {
        data, err := os.ReadFile(certPath)
        if err != nil {
                return time.Time{}, err
        }
        block, _ := pem.Decode(data)
        if block == nil {
                return time.Time{}, os.ErrInvalid
        }
        cert, err := x509.ParseCertificate(block.Bytes)
        if err != nil {
                return time.Time{}, err
        }
        return cert.NotAfter, nil
}

func (s *Server) handleCertList(w http.ResponseWriter, r *http.Request) {
        // Sync filesystem certs first
        s.scanLetsencryptCerts(r)

        rows, err := s.db.SQL.QueryContext(r.Context(),
                `SELECT id, domain, issuer, COALESCE(cert_path,''), COALESCE(key_path,''), expires_at, auto_renew, status, created_at
                 FROM certs ORDER BY domain ASC`,
        )
        if err != nil {
                w.Header().Set("Content-Type", "application/json")
                json.NewEncoder(w).Encode([]certEntry{}) //nolint:errcheck
                return
        }
        defer rows.Close()

        var certs []certEntry
        for rows.Next() {
                var c certEntry
                var autoRenew int
                rows.Scan(&c.ID, &c.Domain, &c.Issuer, &c.CertPath, &c.KeyPath, &c.ExpiresAt, //nolint:errcheck
                        &autoRenew, &c.Status, &c.CreatedAt)
                c.AutoRenew = autoRenew == 1
                if c.ExpiresAt != nil {
                        expTime := time.Unix(*c.ExpiresAt, 0)
                        c.DaysLeft = int(time.Until(expTime).Hours() / 24)
                }
                certs = append(certs, c)
        }
        if certs == nil {
                certs = []certEntry{}
        }
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(certs) //nolint:errcheck
}

func (s *Server) handleCertIssue(w http.ResponseWriter, r *http.Request) {
        var req struct {
                Domain    string   `json:"domain"`
                SANs      []string `json:"sans"`
                Email     string   `json:"email"`
                AutoRenew bool     `json:"auto_renew"`
                Staging   bool     `json:"staging"`
        }
        if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
                http.Error(w, "bad request", http.StatusBadRequest)
                return
        }
        if req.Domain == "" {
                http.Error(w, "domain is required", http.StatusBadRequest)
                return
        }
        if err := validateDomain(req.Domain); err != nil {
                http.Error(w, err.Error(), http.StatusBadRequest)
                return
        }
        if req.Email == "" {
                http.Error(w, "email is required for Let's Encrypt", http.StatusBadRequest)
                return
        }

        args := []string{
                "certonly", "--webroot", "-w", "/var/www/html",
                "-d", req.Domain,
                "--email", req.Email,
                "--agree-tos", "--non-interactive",
        }
        for _, san := range req.SANs {
                args = append(args, "-d", san)
        }
        if req.Staging {
                args = append(args, "--staging")
        }

        out, err := runCommandCombined("certbot", args...)
        if err != nil {
                w.Header().Set("Content-Type", "application/json")
                json.NewEncoder(w).Encode(map[string]interface{}{ //nolint:errcheck
                        "ok":     false,
                        "output": out,
                        "error": "operation failed",
                })
                return
        }

        certPath := filepath.Join(letsencryptBase, req.Domain, "fullchain.pem")
        keyPath := filepath.Join(letsencryptBase, req.Domain, "privkey.pem")

        var expiresAt *int64
        status := "valid"
        if expiry, err2 := parseCertExpiry(certPath); err2 == nil {
                t := expiry.Unix()
                expiresAt = &t
        }

        autoRenew := 0
        if req.AutoRenew {
                autoRenew = 1
        }
        s.db.SQL.ExecContext(r.Context(), //nolint:errcheck
                `INSERT INTO certs (domain, issuer, cert_path, key_path, expires_at, auto_renew, status)
                 VALUES (?,?,?,?,?,?,?)
                 ON CONFLICT(domain) DO UPDATE SET cert_path=excluded.cert_path, key_path=excluded.key_path,
                 expires_at=excluded.expires_at, auto_renew=excluded.auto_renew, status=excluded.status`,
                req.Domain, "letsencrypt", certPath, keyPath, expiresAt, autoRenew, status,
        )

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]interface{}{ //nolint:errcheck
                "ok":     true,
                "domain": req.Domain,
                "output": out,
        })
}

func (s *Server) handleCertRenew(w http.ResponseWriter, r *http.Request) {
	domain := r.PathValue("domain")
	if err := validateDomain(domain); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	args := []string{"renew", "--cert-name", domain, "--non-interactive"}

        out, err := runCommandCombined("certbot", args...)
        if err != nil {
                w.Header().Set("Content-Type", "application/json")
                json.NewEncoder(w).Encode(map[string]interface{}{ //nolint:errcheck
                        "ok": false, "output": out, "error": "operation failed",
                })
                return
        }

        certPath := filepath.Join(letsencryptBase, domain, "fullchain.pem")
        if expiry, err2 := parseCertExpiry(certPath); err2 == nil {
                t := expiry.Unix()
                s.db.SQL.ExecContext(r.Context(), //nolint:errcheck
                        `UPDATE certs SET expires_at=?, status='valid' WHERE domain=?`, t, domain,
                )
        }

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]interface{}{ //nolint:errcheck
                "ok": true, "domain": domain, "output": out,
        })
}

func (s *Server) handleCertRevoke(w http.ResponseWriter, r *http.Request) {
	domain := r.PathValue("domain")
	if err := validateDomain(domain); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	certPath := filepath.Join(letsencryptBase, domain, "fullchain.pem")

        out, err := runCommandCombined("certbot", "revoke", "--cert-path", certPath, "--non-interactive")
        if err != nil {
                w.Header().Set("Content-Type", "application/json")
                json.NewEncoder(w).Encode(map[string]interface{}{ //nolint:errcheck
                        "ok": false, "output": out, "error": "operation failed",
                })
                return
        }

        s.db.SQL.ExecContext(r.Context(), `DELETE FROM certs WHERE domain=?`, domain) //nolint:errcheck

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]interface{}{"ok": true, "domain": domain}) //nolint:errcheck
}

func (s *Server) handleCertStatus(w http.ResponseWriter, r *http.Request) {
	domain := r.PathValue("domain")
	if err := validateDomain(domain); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	certPath := filepath.Join(letsencryptBase, domain, "fullchain.pem")

        data, err := os.ReadFile(certPath)
        if err != nil {
                http.Error(w, "cert not found on disk", http.StatusNotFound)
                return
        }

        block, _ := pem.Decode(data)
        if block == nil {
                http.Error(w, "invalid PEM", http.StatusInternalServerError)
                return
        }
        cert, err := x509.ParseCertificate(block.Bytes)
        if err != nil {
                http.Error(w, "parse error", http.StatusInternalServerError)
                return
        }

        daysLeft := int(time.Until(cert.NotAfter).Hours() / 24)
        status := "valid"
        if cert.NotAfter.Before(time.Now()) {
                status = "expired"
        } else if daysLeft < 14 {
                status = "expiring_soon"
        }

        // Also verify TLS
        tlsValid := false
        if conn, err2 := tls.Dial("tcp", domain+":443", &tls.Config{InsecureSkipVerify: true}); err2 == nil { //nolint:gosec
                conn.Close()
                tlsValid = true
        }

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]interface{}{ //nolint:errcheck
                "domain":      domain,
                "subject":     cert.Subject.CommonName,
                "issuer":      cert.Issuer.CommonName,
                "not_before":  cert.NotBefore.Unix(),
                "not_after":   cert.NotAfter.Unix(),
                "days_left":   daysLeft,
                "status":      status,
                "san":         cert.DNSNames,
                "tls_reachable": tlsValid,
        })
}

func (s *Server) handleCertAdd(w http.ResponseWriter, r *http.Request) {
        var req struct {
                Domain    string `json:"domain"`
                Issuer    string `json:"issuer"`
                CertPath  string `json:"cert_path"`
                KeyPath   string `json:"key_path"`
                AutoRenew bool   `json:"auto_renew"`
        }
        if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
                http.Error(w, "bad request", http.StatusBadRequest)
                return
        }
        if req.Domain == "" || req.CertPath == "" {
                http.Error(w, "domain and cert_path are required", http.StatusBadRequest)
                return
        }
        if req.Issuer == "" {
                req.Issuer = "custom"
        }

        var expiresAt *int64
        status := "unknown"
        if expiry, err := parseCertExpiry(req.CertPath); err == nil {
                t := expiry.Unix()
                expiresAt = &t
                if expiry.After(time.Now()) {
                        status = "valid"
                } else {
                        status = "expired"
                }
        }

        autoRenew := 0
        if req.AutoRenew {
                autoRenew = 1
        }
        res, err := s.db.SQL.ExecContext(r.Context(),
                `INSERT INTO certs (domain, issuer, cert_path, key_path, expires_at, auto_renew, status)
                 VALUES (?,?,?,?,?,?,?)
                 ON CONFLICT(domain) DO UPDATE SET issuer=excluded.issuer, cert_path=excluded.cert_path,
                 key_path=excluded.key_path, expires_at=excluded.expires_at, auto_renew=excluded.auto_renew, status=excluded.status`,
                req.Domain, req.Issuer, req.CertPath, req.KeyPath, expiresAt, autoRenew, status,
        )
        if err != nil {
                http.Error(w, "db error", http.StatusInternalServerError)
                return
        }
        id, _ := res.LastInsertId()
        w.Header().Set("Content-Type", "application/json")
        w.WriteHeader(http.StatusCreated)
        json.NewEncoder(w).Encode(map[string]interface{}{ //nolint:errcheck
                "id":     id,
                "domain": req.Domain,
                "status": status,
        })
}

func (s *Server) handleCertDelete(w http.ResponseWriter, r *http.Request) {
	domain := r.PathValue("domain")
	if err := validateDomain(domain); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	s.db.SQL.ExecContext(r.Context(), `DELETE FROM certs WHERE domain=?`, domain) //nolint:errcheck
        w.WriteHeader(http.StatusNoContent)
}

// runCertAutoRenew checks all auto_renew certs with <30 days left and renews them.
func (s *Server) runCertAutoRenew() {
        cutoff := time.Now().Add(30 * 24 * time.Hour).Unix()
        rows, err := s.db.SQL.Query(
                `SELECT domain FROM certs WHERE auto_renew=1 AND status != 'expired'
                 AND expires_at IS NOT NULL AND expires_at < ?`, cutoff,
        )
        if err != nil {
                return
        }
        defer rows.Close()
        var domains []string
        for rows.Next() {
                var d string
                rows.Scan(&d) //nolint:errcheck
                domains = append(domains, d)
        }
        rows.Close()
        for _, d := range domains {
                out, err := runCommandCombined("certbot", "renew", "--cert-name", d, "--non-interactive")
                certPath := filepath.Join(letsencryptBase, d, "fullchain.pem")
                if err == nil {
                        if expiry, err2 := parseCertExpiry(certPath); err2 == nil {
                                t := expiry.Unix()
                                s.db.SQL.Exec(`UPDATE certs SET expires_at=?, status='valid' WHERE domain=?`, t, d) //nolint:errcheck
                        }
                }
                _ = out
        }
}

// ── Self-signed cert helpers ──────────────────────────────────────────────────

func (s *Server) handleCertSelfSigned(w http.ResponseWriter, r *http.Request) {
        var req struct {
                Domain   string `json:"domain"`
                OutDir   string `json:"out_dir"`
                Days     int    `json:"days"`
        }
        if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
                http.Error(w, "bad request", http.StatusBadRequest)
                return
        }
        if req.Domain == "" {
                http.Error(w, "domain is required", http.StatusBadRequest)
                return
        }
        // Sanitize domain: must not contain path separators or traversal sequences
        if strings.ContainsAny(req.Domain, "/\\") || strings.Contains(req.Domain, "..") {
                http.Error(w, "invalid domain name", http.StatusBadRequest)
                return
        }
        if req.OutDir == "" {
                req.OutDir = "/etc/orbit/certs/" + req.Domain
        }
        // Validate output directory stays within expected base
        req.OutDir = filepath.Clean(req.OutDir)
        if !strings.HasPrefix(req.OutDir, "/etc/orbit/certs/") && !strings.HasPrefix(req.OutDir, "/etc/letsencrypt/") {
                http.Error(w, "invalid output directory", http.StatusBadRequest)
                return
        }
        if req.Days == 0 {
                req.Days = 365
        }

        os.MkdirAll(req.OutDir, 0o700) //nolint:errcheck
        keyPath := filepath.Join(req.OutDir, "privkey.pem")
        certPath := filepath.Join(req.OutDir, "fullchain.pem")

        subject := "/CN=" + req.Domain
        out, err := runCommandCombined("openssl", "req", "-x509", "-nodes",
                "-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:P-384",
                "-keyout", keyPath, "-out", certPath,
                "-days", strconv.Itoa(req.Days),
                "-subj", subject,
        )
        if err != nil {
                w.Header().Set("Content-Type", "application/json")
                json.NewEncoder(w).Encode(map[string]interface{}{"ok": false, "output": out, "error": "operation failed"}) //nolint:errcheck
                return
        }

        expiresAt := time.Now().Add(time.Duration(req.Days) * 24 * time.Hour).Unix()
        s.db.SQL.Exec( //nolint:errcheck
                `INSERT INTO certs (domain, issuer, cert_path, key_path, expires_at, status)
                 VALUES (?,?,?,?,?,'valid')
                 ON CONFLICT(domain) DO UPDATE SET issuer='self-signed', cert_path=excluded.cert_path,
                 key_path=excluded.key_path, expires_at=excluded.expires_at, status='valid'`,
                req.Domain, "self-signed", certPath, keyPath, expiresAt,
        )

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]interface{}{ //nolint:errcheck
                "ok": true, "domain": req.Domain, "cert_path": certPath, "key_path": keyPath,
        })
}

