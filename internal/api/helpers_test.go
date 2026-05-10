package api

import (
	"testing"

	"github.com/KenyanRedwoods01/Orbit/internal/config"
)

// mockConfig returns a minimal *config.Config for use in unit tests.
func mockConfig(dataDir string) *config.Config {
	return &config.Config{
		DataDir:   dataDir,
		SecretKey: "test-secret-key-for-unit-tests-ok-1234567",
	}
}

// ─── hashSHA256Hex ────────────────────────────────────────────────────────────

func TestHashSHA256Hex_Deterministic(t *testing.T) {
	t.Parallel()
	h1 := hashSHA256Hex("token-abc")
	h2 := hashSHA256Hex("token-abc")
	if h1 != h2 {
		t.Error("hashSHA256Hex should be deterministic for same input")
	}
}

func TestHashSHA256Hex_Length(t *testing.T) {
	t.Parallel()
	h := hashSHA256Hex("some-session-token")
	if len(h) != 64 {
		t.Errorf("SHA-256 hex digest should be 64 chars, got %d", len(h))
	}
}

func TestHashSHA256Hex_Unique(t *testing.T) {
	t.Parallel()
	h1 := hashSHA256Hex("token-1")
	h2 := hashSHA256Hex("token-2")
	if h1 == h2 {
		t.Error("different inputs should produce different digests")
	}
}

func TestHashSHA256Hex_Empty(t *testing.T) {
	t.Parallel()
	h := hashSHA256Hex("")
	if len(h) != 64 {
		t.Errorf("empty string SHA-256 hex should be 64 chars, got %d", len(h))
	}
}

// ─── safeRoot via Server.safeRoot ────────────────────────────────────────────

func TestSafeRootMethod(t *testing.T) {
	t.Parallel()

	s := &Server{cfg: mockConfig("/safe/root")}

	cases := []struct {
		name    string
		path    string
		allowed bool
	}{
		{"direct child", "/safe/root/file.txt", true},
		{"nested", "/safe/root/subdir/nested.log", true},
		{"root itself", "/safe/root", true},
		{"traversal", "/safe/root/../etc/passwd", false},
		{"absolute escape", "/etc/passwd", false},
		{"relative traversal", "../relative", false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			_, err := s.safeRoot(tc.path)
			if tc.allowed && err != nil {
				t.Errorf("path %q: expected allowed, got error: %v", tc.path, err)
			}
			if !tc.allowed && err == nil {
				t.Errorf("path %q: expected blocked, got nil error", tc.path)
			}
		})
	}
}
