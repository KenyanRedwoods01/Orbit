package api

import (
	"strings"
	"testing"
	"time"

	"github.com/KenyanRedwoods01/Orbit/internal/auth"
)

// ─── JWT Token Tests ─────────────────────────────────────────────────────────

func TestVerifyToken_ValidToken(t *testing.T) {
	t.Parallel()
	secret := []byte("test-secret-key-for-unit-tests-32chars!")
	token, err := auth.IssueToken(secret, 1, "alice", "admin", "127.0.0.1", time.Hour)
	if err != nil {
		t.Fatalf("IssueToken: %v", err)
	}

	claims, err := auth.VerifyToken(secret, token)
	if err != nil {
		t.Fatalf("VerifyToken: %v", err)
	}
	if claims.Username != "alice" {
		t.Errorf("username = %q, want %q", claims.Username, "alice")
	}
	if claims.Scope != "admin" {
		t.Errorf("scope = %q, want %q", claims.Scope, "admin")
	}
	if claims.UserID != 1 {
		t.Errorf("userID = %d, want 1", claims.UserID)
	}
}

func TestVerifyToken_ExpiredToken(t *testing.T) {
	t.Parallel()
	secret := []byte("test-secret-key-for-unit-tests-32chars!")
	token, err := auth.IssueToken(secret, 2, "bob", "admin", "127.0.0.1", -time.Hour)
	if err != nil {
		t.Fatalf("IssueToken: %v", err)
	}
	_, err = auth.VerifyToken(secret, token)
	if err == nil {
		t.Error("expected error for expired token, got nil")
	}
}

func TestVerifyToken_WrongSecret(t *testing.T) {
	t.Parallel()
	secret1 := []byte("correct-secret-key-for-unit-tests-1!!")
	secret2 := []byte("wrong-secret-key-for-unit-tests-2222!!")

	token, err := auth.IssueToken(secret1, 3, "carol", "admin", "127.0.0.1", time.Hour)
	if err != nil {
		t.Fatalf("IssueToken: %v", err)
	}
	_, err = auth.VerifyToken(secret2, token)
	if err == nil {
		t.Error("expected error for wrong secret, got nil")
	}
}

func TestVerifyToken_TamperedToken(t *testing.T) {
	t.Parallel()
	secret := []byte("test-secret-key-for-unit-tests-32chars!")
	token, err := auth.IssueToken(secret, 4, "dave", "admin", "127.0.0.1", time.Hour)
	if err != nil {
		t.Fatalf("IssueToken: %v", err)
	}
	tampered := token[:len(token)-4] + "XXXX"
	_, err = auth.VerifyToken(secret, tampered)
	if err == nil {
		t.Error("expected error for tampered token, got nil")
	}
}

func TestVerifyToken_EmptyToken(t *testing.T) {
	t.Parallel()
	secret := []byte("test-secret-key-for-unit-tests-32chars!")
	_, err := auth.VerifyToken(secret, "")
	if err == nil {
		t.Error("expected error for empty token, got nil")
	}
}

// ─── Password Hashing Tests ──────────────────────────────────────────────────

func TestHashAndCheckPassword(t *testing.T) {
	t.Parallel()
	password := "Secure#Password2026"

	hash, err := auth.HashPassword(password)
	if err != nil {
		t.Fatalf("HashPassword: %v", err)
	}
	if hash == "" || hash == password {
		t.Errorf("expected non-empty, non-plaintext hash")
	}

	if err := auth.CheckPassword(hash, password); err != nil {
		t.Errorf("CheckPassword with correct password: %v", err)
	}
	if err := auth.CheckPassword(hash, "WrongPassword!"); err == nil {
		t.Error("CheckPassword with wrong password should return error")
	}
}

func TestHashPassword_UniqueHashes(t *testing.T) {
	t.Parallel()
	hash1, _ := auth.HashPassword("SamePassword123!")
	hash2, _ := auth.HashPassword("SamePassword123!")
	if hash1 == hash2 {
		t.Error("two hashes of the same password should differ (bcrypt salt)")
	}
}

// ─── scopeAllowsWrite Tests ──────────────────────────────────────────────────

func TestScopeAllowsWrite(t *testing.T) {
	t.Parallel()
	writeable := []string{"admin", "write", "ui", "deploy"}
	readOnly  := []string{"read-only", "read:servers", "mcp_read", "unknown", "", "guest"}

	for _, scope := range writeable {
		if !scopeAllowsWrite(scope) {
			t.Errorf("scope %q should allow write", scope)
		}
	}
	for _, scope := range readOnly {
		if scopeAllowsWrite(scope) {
			t.Errorf("scope %q should NOT allow write", scope)
		}
	}
}

// ─── Rate Limiter — Login Brute-Force ────────────────────────────────────────

func TestLoginBruteForceBlocking(t *testing.T) {
	t.Parallel()
	rl := newRateLimiter(5, 900) // 5 per 15 min (auth limiter default)
	key := "ip:10.0.0.1"

	for i := 0; i < 5; i++ {
		if !rl.allow(key) {
			t.Errorf("attempt %d should be allowed", i+1)
		}
	}
	if rl.allow(key) {
		t.Error("6th attempt should be blocked (brute-force)")
	}
}

// ─── hashSHA256Hex Tests ──────────────────────────────────────────────────────

func TestHashSHA256Hex_Consistency(t *testing.T) {
	t.Parallel()
	input := "my-session-token"
	h1 := hashSHA256Hex(input)
	h2 := hashSHA256Hex(input)
	if h1 != h2 {
		t.Error("hashSHA256Hex should be deterministic")
	}
	if len(h1) != 64 {
		t.Errorf("SHA-256 hex should be 64 chars, got %d", len(h1))
	}
	if !strings.ContainsAny(h1, "0123456789abcdef") {
		t.Error("expected lowercase hex output")
	}

	h3 := hashSHA256Hex("different-token")
	if h1 == h3 {
		t.Error("different inputs should produce different hashes")
	}
}
