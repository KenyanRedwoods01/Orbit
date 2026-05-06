package api

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha1" //nolint:gosec — TOTP spec mandates HMAC-SHA1
	"encoding/base32"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"net/url"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
)

// ── TOTP helpers ──────────────────────────────────────────────────────────────

// totpGenerate returns the current 6-digit TOTP code for a base32 secret.
func totpGenerate(secret string) (string, error) {
	return totpAt(secret, time.Now())
}

func totpAt(secret string, t time.Time) (string, error) {
	secret = strings.ToUpper(strings.ReplaceAll(secret, " ", ""))
	key, err := base32.StdEncoding.DecodeString(secret)
	if err != nil {
		return "", fmt.Errorf("invalid base32 secret: %w", err)
	}
	counter := uint64(math.Floor(float64(t.Unix()) / 30))
	buf := make([]byte, 8)
	binary.BigEndian.PutUint64(buf, counter)

	mac := hmac.New(sha1.New, key)
	mac.Write(buf) //nolint:errcheck
	h := mac.Sum(nil)

	offset := h[len(h)-1] & 0x0f
	code := binary.BigEndian.Uint32(h[offset:offset+4]) & 0x7fffffff
	return fmt.Sprintf("%06d", code%1_000_000), nil
}

// totpVerify checks code against current and ±1 windows.
func totpVerify(secret, code string) bool {
	now := time.Now()
	for _, offset := range []time.Duration{0, -30 * time.Second, 30 * time.Second} {
		c, err := totpAt(secret, now.Add(offset))
		if err != nil {
			return false
		}
		if c == code {
			return true
		}
	}
	return false
}

// newTOTPSecret generates a random 20-byte (160-bit) base32 secret.
func newTOTPSecret() (string, error) {
	b := make([]byte, 20)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base32.StdEncoding.EncodeToString(b), nil
}

// totpQRURL returns an otpauth:// URI for QR code generation.
func totpQRURL(issuer, account, secret string) string {
	return fmt.Sprintf(
		"otpauth://totp/%s:%s?secret=%s&issuer=%s&algorithm=SHA1&digits=6&period=30",
		url.QueryEscape(issuer),
		url.QueryEscape(account),
		url.QueryEscape(secret),
		url.QueryEscape(issuer),
	)
}

// ── TOTP API handlers ─────────────────────────────────────────────────────────

func (s *Server) handleTOTPSetup(w http.ResponseWriter, r *http.Request) {
	claims := claimsFromCtx(r)
	if claims == nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	secret, err := newTOTPSecret()
	if err != nil {
		http.Error(w, "secret generation failed", http.StatusInternalServerError)
		return
	}

	// Store provisioning secret temporarily in DB (not yet activated)
	_, err = s.db.SQL.ExecContext(r.Context(),
		`UPDATE users SET totp_secret=? WHERE id=?`, "pending:"+secret, claims.UserID,
	)
	if err != nil {
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}

	qrURL := totpQRURL("Orbit VPS", claims.Username, secret)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{ //nolint:errcheck
		"secret": secret,
		"qr_url": qrURL,
	})
}

func (s *Server) handleTOTPVerify(w http.ResponseWriter, r *http.Request) {
	claims := claimsFromCtx(r)
	if claims == nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var req struct {
		Code string `json:"code"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	if req.Code == "" {
		http.Error(w, "code is required", http.StatusBadRequest)
		return
	}

	var totpSecret string
	err := s.db.SQL.QueryRowContext(r.Context(),
		`SELECT COALESCE(totp_secret,'') FROM users WHERE id=?`, claims.UserID,
	).Scan(&totpSecret)
	if err != nil {
		http.Error(w, "user not found", http.StatusNotFound)
		return
	}

	// Strip "pending:" prefix from provisioning secret
	secret := strings.TrimPrefix(totpSecret, "pending:")

	if !totpVerify(secret, req.Code) {
		http.Error(w, "invalid code", http.StatusUnauthorized)
		return
	}

	// Activate TOTP by removing "pending:" prefix
	_, err = s.db.SQL.ExecContext(r.Context(),
		`UPDATE users SET totp_secret=? WHERE id=?`, secret, claims.UserID,
	)
	if err != nil {
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}

	// Generate backup codes
	backupCodes, err := s.generateBackupCodes(r, claims.UserID)
	if err != nil {
		http.Error(w, "backup code generation failed", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{ //nolint:errcheck
		"ok":           true,
		"backup_codes": backupCodes,
	})
}

func (s *Server) handleTOTPDisable(w http.ResponseWriter, r *http.Request) {
	claims := claimsFromCtx(r)
	if claims == nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var req struct {
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}

	// Verify password before disabling TOTP
	var pwHash string
	err := s.db.SQL.QueryRowContext(r.Context(),
		`SELECT pw_hash FROM users WHERE id=?`, claims.UserID,
	).Scan(&pwHash)
	if err != nil {
		http.Error(w, "user not found", http.StatusNotFound)
		return
	}
	if bcrypt.CompareHashAndPassword([]byte(pwHash), []byte(req.Password)) != nil {
		http.Error(w, "invalid password", http.StatusUnauthorized)
		return
	}

	s.db.SQL.ExecContext(r.Context(), `UPDATE users SET totp_secret=NULL WHERE id=?`, claims.UserID)       //nolint:errcheck
	s.db.SQL.ExecContext(r.Context(), `DELETE FROM totp_backup_codes WHERE user_id=?`, claims.UserID) //nolint:errcheck

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"ok": true}) //nolint:errcheck
}

func (s *Server) handleTOTPStatus(w http.ResponseWriter, r *http.Request) {
	claims := claimsFromCtx(r)
	if claims == nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var totpSecret string
	s.db.SQL.QueryRowContext(r.Context(), //nolint:errcheck
		`SELECT COALESCE(totp_secret,'') FROM users WHERE id=?`, claims.UserID,
	).Scan(&totpSecret)

	enabled := totpSecret != "" && !strings.HasPrefix(totpSecret, "pending:")
	pending := strings.HasPrefix(totpSecret, "pending:")

	var backupCount int
	s.db.SQL.QueryRowContext(r.Context(), //nolint:errcheck
		`SELECT COUNT(*) FROM totp_backup_codes WHERE user_id=? AND used=0`, claims.UserID,
	).Scan(&backupCount)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{ //nolint:errcheck
		"enabled":            enabled,
		"pending_activation": pending,
		"backup_codes_left":  backupCount,
	})
}

func (s *Server) handleTOTPBackupCodes(w http.ResponseWriter, r *http.Request) {
	claims := claimsFromCtx(r)
	if claims == nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	codes, err := s.generateBackupCodes(r, claims.UserID)
	if err != nil {
		http.Error(w, "generation failed", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{ //nolint:errcheck
		"backup_codes": codes,
	})
}

// generateBackupCodes creates 10 new backup codes, deletes old ones, stores hashes.
func (s *Server) generateBackupCodes(r *http.Request, userID int64) ([]string, error) {
	s.db.SQL.ExecContext(r.Context(), `DELETE FROM totp_backup_codes WHERE user_id=?`, userID) //nolint:errcheck

	codes := make([]string, 10)
	for i := range codes {
		b := make([]byte, 5)
		if _, err := rand.Read(b); err != nil {
			return nil, err
		}
		code := fmt.Sprintf("%X-%X", b[:3], b[3:])
		codes[i] = code

		hash, err := bcrypt.GenerateFromPassword([]byte(code), bcrypt.MinCost)
		if err != nil {
			return nil, err
		}
		s.db.SQL.ExecContext(r.Context(), //nolint:errcheck
			`INSERT INTO totp_backup_codes (user_id, code_hash) VALUES (?,?)`, userID, string(hash),
		)
	}
	return codes, nil
}

// handleTOTPLogin verifies a TOTP code during login (called separately from password check).
func (s *Server) handleTOTPLogin(w http.ResponseWriter, r *http.Request) {
	var req struct {
		UserID int64  `json:"user_id"`
		Code   string `json:"code"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}

	var totpSecret string
	err := s.db.SQL.QueryRowContext(r.Context(),
		`SELECT COALESCE(totp_secret,'') FROM users WHERE id=?`, req.UserID,
	).Scan(&totpSecret)
	if err != nil {
		http.Error(w, "user not found", http.StatusNotFound)
		return
	}

	if totpSecret == "" || strings.HasPrefix(totpSecret, "pending:") {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{"ok": true, "totp_required": false}) //nolint:errcheck
		return
	}

	// Try TOTP code
	if totpVerify(totpSecret, req.Code) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{"ok": true}) //nolint:errcheck
		return
	}

	// Try backup code
	rows, err := s.db.SQL.QueryContext(r.Context(),
		`SELECT id, code_hash FROM totp_backup_codes WHERE user_id=? AND used=0`, req.UserID,
	)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var cid int64
			var hash string
			rows.Scan(&cid, &hash) //nolint:errcheck
			if bcrypt.CompareHashAndPassword([]byte(hash), []byte(req.Code)) == nil {
				s.db.SQL.ExecContext(r.Context(), //nolint:errcheck
					`UPDATE totp_backup_codes SET used=1, used_at=unixepoch() WHERE id=?`, cid,
				)
				w.Header().Set("Content-Type", "application/json")
				json.NewEncoder(w).Encode(map[string]interface{}{"ok": true, "backup_code_used": true}) //nolint:errcheck
				return
			}
		}
	}

	http.Error(w, "invalid TOTP code", http.StatusUnauthorized)
}

// claimsFromCtx extracts JWT claims injected by the auth middleware.
func claimsFromCtx(r *http.Request) *jwtClaims {
	v := r.Context().Value(ctxKeyClaims)
	if v == nil {
		return nil
	}
	c, _ := v.(*jwtClaims)
	return c
}

type jwtClaims struct {
	UserID   int64
	Username string
	Role     string
}

type ctxKey string

const ctxKeyClaims ctxKey = "claims"
