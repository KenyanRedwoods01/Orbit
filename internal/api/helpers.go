package api

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"io"
	"os/exec"
	"regexp"
	"strings"
	"time"

	"github.com/KenyanRedwoods01/Orbit/internal/auth"
	"golang.org/x/crypto/argon2"
)

var reContainerName = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$`)
var reImageName = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9:./_-]{0,255}$`)
var reDockerPort = regexp.MustCompile(`^[0-9]+(:[0-9]+)?(/(tcp|udp))?$`)
var reCommandArg = regexp.MustCompile(`^[A-Za-z0-9 _\-./:@%+=,]+$`)

func validateContainerName(name string) error {
	if !reContainerName.MatchString(name) {
		return fmt.Errorf("invalid container name %q", name)
	}
	return nil
}

func validateImageName(name string) error {
	if !reImageName.MatchString(name) {
		return fmt.Errorf("invalid image name %q", name)
	}
	return nil
}

func validateServiceName(name string) error {
	if name == "" {
		return fmt.Errorf("service name must not be empty")
	}
	if strings.ContainsAny(name, "/\\;&|`$!(){}[]<>") {
		return fmt.Errorf("service name %q contains illegal characters", name)
	}
	return nil
}

func validatePath(rawPath string) error {
	if rawPath == "" {
		return fmt.Errorf("path must not be empty")
	}
	if strings.Contains(rawPath, "..") {
		return fmt.Errorf("path %q contains illegal components", rawPath)
	}
	return nil
}

func validateDockerPort(p string) error {
	if p == "" {
		return fmt.Errorf("port must not be empty")
	}
	if !reDockerPort.MatchString(p) {
		return fmt.Errorf("invalid port specification %q", p)
	}
	return nil
}

func validateEnvVar(e string) error {
	if strings.ContainsAny(e, "$`") {
		return fmt.Errorf("env var %q contains illegal characters ($ or backtick)", e)
	}
	return nil
}

var validRestartPolicies = map[string]bool{
	"no": true, "always": true, "unless-stopped": true, "on-failure": true,
}

func validateRestartPolicy(r string) error {
	if validRestartPolicies[r] {
		return nil
	}
	if strings.HasPrefix(r, "on-failure:") {
		rest, ok := strings.CutPrefix(r, "on-failure:")
		if ok && rest != "" {
			for _, c := range rest {
				if c < '0' || c > '9' {
					return fmt.Errorf("invalid restart policy %q", r)
				}
			}
			return nil
		}
	}
	return fmt.Errorf("invalid restart policy %q", r)
}

func validateVolume(v string) error {
	if v == "" {
		return fmt.Errorf("volume mount must not be empty")
	}
	blockedPaths := []string{"/var/run/docker.sock", "/proc", "/sys", "/dev"}
	for _, bp := range blockedPaths {
		if strings.Contains(v, bp) {
			return fmt.Errorf("volume mount %q contains blocked path %q", v, bp)
		}
	}
	if strings.HasPrefix(v, "/:/") {
		return fmt.Errorf("volume mount %q is a host root bind mount", v)
	}
	return nil
}

func validateCommandArg(arg string) error {
	if !reCommandArg.MatchString(arg) {
		return fmt.Errorf("command argument %q contains disallowed characters", arg)
	}
	return nil
}

// generateRandomHex returns n cryptographically random bytes encoded as hex.
func generateRandomHex(n int) (string, error) {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

// hashSHA256Hex returns the hex-encoded SHA-256 hash of s.
func hashSHA256Hex(s string) string {
	sum := sha256.Sum256([]byte(s))
	return fmt.Sprintf("%x", sum[:])
}

// runCommandCombined runs a binary with args and returns combined output + error.
func runCommandCombined(name string, args ...string) (string, error) {
	out, err := exec.Command(name, args...).CombinedOutput()
	return string(out), err
}

// verifyTokenClaims parses a JWT and returns its claims.
func verifyTokenClaims(secret []byte, token string) (*auth.Claims, error) {
	return auth.VerifyToken(secret, token)
}

// ── AES-256-GCM encryption helpers ─────────────────────────────────────────────

// deriveEncryptionKey derives a 32-byte AES key from the server secret.
// Uses Argon2id (memory-hard KDF) when a salt is available, falling back to
// iterated SHA-256 for backward compatibility with existing encrypted data.
func deriveEncryptionKey(secret string) []byte {
	return deriveKeyArgon2(secret)
}

// deriveKeyArgon2 derives a 32-byte key using Argon2id with a static salt.
// The salt is derived from the secret itself to avoid storing an extra salt column.
func deriveKeyArgon2(secret string) []byte {
	salt := sha256.Sum256([]byte("orbit-v1-key-derivation:" + secret))
	return argon2.IDKey([]byte(secret), salt[:16], 3, 64*1024, 4, 32)
}

// encrypt encrypts plaintext using AES-256-GCM with a random nonce.
// Returns base64-encoded (nonce || ciphertext).
func encrypt(plaintext string, secret string) (string, error) {
	key := deriveEncryptionKey(secret)
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	aesGCM, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, aesGCM.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}
	ciphertext := aesGCM.Seal(nonce, nonce, []byte(plaintext), nil)
	return base64.StdEncoding.EncodeToString(ciphertext), nil
}

// decrypt decrypts data previously encrypted with encrypt().
func decrypt(cipherB64 string, secret string) (string, error) {
	key := deriveEncryptionKey(secret)
	data, err := base64.StdEncoding.DecodeString(cipherB64)
	if err != nil {
		return "", err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	aesGCM, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	nonceSize := aesGCM.NonceSize()
	if len(data) < nonceSize {
		return "", fmt.Errorf("ciphertext too short")
	}
	nonce, ciphertext := data[:nonceSize], data[nonceSize:]
	plaintext, err := aesGCM.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return "", err
	}
	return string(plaintext), nil
}

// ── Bearer token helpers ───────────────────────────────────────────────────────

type apiTokenClaims struct {
	Name      string
	Scopes    string
	IPRestrict string
	ExpiresAt *int64
}

// validateBearerToken checks the Authorization header against api_tokens and mcp_tokens.
// Returns claims if valid, nil otherwise.
func (s *Server) validateBearerToken(r *http.Request) *jwtClaims {
	auth := r.Header.Get("Authorization")
	if !strings.HasPrefix(auth, "Bearer ") {
		return nil
	}
	rawToken := strings.TrimPrefix(auth, "Bearer ")

	// Check api_tokens table
	tokenHash := hashSHA256Hex(rawToken)
	var scope, name string
	var expiresAt *int64
	err := s.db.SQL.QueryRowContext(r.Context(),
		`SELECT name, scopes, expires_at FROM api_tokens WHERE token_hash=?`, tokenHash,
	).Scan(&name, &scope, &expiresAt)
	if err == nil {
		if expiresAt != nil && *expiresAt < time.Now().Unix() {
			return nil
		}
		s.db.SQL.ExecContext(r.Context(), //nolint:errcheck
			`UPDATE api_tokens SET last_used=unixepoch() WHERE token_hash=?`, tokenHash)
		return &jwtClaims{
			UserID:   0,
			Username: "api:" + name,
			Role:     scope,
		}
	}

	// Check mcp_tokens table
	// Note: MCP tokens already include the "mcp_" prefix from generateMCPToken(),
	// so we hash the raw token directly (no additional prefix).
	mcpHash := hashSHA256Hex(rawToken)
	var mcpScope string
	err = s.db.SQL.QueryRowContext(r.Context(),
		`SELECT scope FROM mcp_tokens WHERE token_hash=?`, mcpHash,
	).Scan(&mcpScope)
	if err == nil {
		s.db.SQL.ExecContext(r.Context(), //nolint:errcheck
			`UPDATE mcp_tokens SET last_used=unixepoch() WHERE token_hash=?`, mcpHash)
		return &jwtClaims{
			UserID:   0,
			Username: "mcp",
			Role:     mcpScope,
		}
	}

	return nil
}
