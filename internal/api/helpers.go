package api

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"os/exec"

	"github.com/KenyanRedwoods01/Orbit/internal/auth"
)

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
