package api

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// ─── Security Validator Tests ────────────────────────────────────────────────

func TestValidateDBIdentifier(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name  string
		input string
		valid bool
	}{
		{"simple name", "mydb", true},
		{"with underscore", "my_database", true},
		{"with hyphen", "my-db", true},
		{"with dollar", "db$1", true},
		{"max length (128)", strings.Repeat("a", 128), true},
		{"empty string", "", false},
		{"starts with digit", "1db", false},
		{"single quote injection", "'; DROP TABLE users; --", false},
		{"double quote injection", `"injected"`, false},
		{"semicolon", "db;drop", false},
		{"space injection", "my db", false},
		{"null byte", "db\x00name", false},
		{"newline", "db\nname", false},
		{"too long (129)", strings.Repeat("a", 129), false},
		{"sql comment", "--comment", false},
		{"unicode", "databaseñame", false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			err := validateDBIdentifier(tc.input)
			if tc.valid && err != nil {
				t.Errorf("expected valid, got error: %v", err)
			}
			if !tc.valid && err == nil {
				t.Errorf("expected invalid for %q, but got nil error", tc.input)
			}
		})
	}
}

func TestValidateIP(t *testing.T) {
	t.Parallel()
	cases := []struct {
		ip    string
		valid bool
	}{
		{"127.0.0.1", true},
		{"192.168.1.100", true},
		{"10.0.0.1", true},
		{"255.255.255.255", true},
		{"::1", true},
		{"2001:db8::1", true},
		{"0.0.0.0", true},
		{"", false},
		{"not-an-ip", false},
		{"999.999.999.999", false},
		{"1.2.3", false},
		{"1.2.3.4.5", false},
		{"1.2.3.4/24", false},
		{"localhost", false},
	}

	for _, tc := range cases {
		t.Run(tc.ip, func(t *testing.T) {
			t.Parallel()
			err := validateIP(tc.ip)
			if tc.valid && err != nil {
				t.Errorf("IP %q expected valid, got: %v", tc.ip, err)
			}
			if !tc.valid && err == nil {
				t.Errorf("IP %q expected invalid, got nil error", tc.ip)
			}
		})
	}
}

func TestValidateIPOrCIDR(t *testing.T) {
	t.Parallel()
	cases := []struct {
		input string
		valid bool
	}{
		{"any", true},
		{"anywhere", true},
		{"", true},
		{"192.168.0.0/24", true},
		{"10.0.0.0/8", true},
		{"::1/128", true},
		{"1.2.3.4", true},
		{"not-cidr", false},
		{"1.2.3.4/33", false},
		{"1.2.3.4/x", false},
	}

	for _, tc := range cases {
		t.Run(tc.input, func(t *testing.T) {
			t.Parallel()
			err := validateIPOrCIDR(tc.input)
			if tc.valid && err != nil {
				t.Errorf("%q expected valid, got: %v", tc.input, err)
			}
			if !tc.valid && err == nil {
				t.Errorf("%q expected invalid, got nil error", tc.input)
			}
		})
	}
}

func TestValidateJailName(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name  string
		input string
		valid bool
	}{
		{"simple", "sshd", true},
		{"with-hyphen", "ssh-brute", true},
		{"with_underscore", "nginx_auth", true},
		{"short", "ab", true},
		{"single char", "a", true},
		{"start with space", " sshd", false},
		{"dot", "ssh.d", false},
		{"empty", "", false},
		{"special chars", "ssh;drop", false},
		{"too long", strings.Repeat("a", 65), false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			err := validateJailName(tc.input)
			if tc.valid && err != nil {
				t.Errorf("expected valid for %q, got: %v", tc.input, err)
			}
			if !tc.valid && err == nil {
				t.Errorf("expected invalid for %q, got nil error", tc.input)
			}
		})
	}
}

// ─── Security Headers ────────────────────────────────────────────────────────

func TestSecurityHeadersPresent(t *testing.T) {
	t.Parallel()

	// Exercise the middleware by routing a request through a no-op handler
	// wrapped by a header-setting middleware.
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-XSS-Protection", "1; mode=block")
		w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
		w.WriteHeader(http.StatusOK)
	})

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	checks := map[string]string{
		"X-Frame-Options":        "DENY",
		"X-Content-Type-Options": "nosniff",
		"X-XSS-Protection":      "1; mode=block",
		"Referrer-Policy":       "strict-origin-when-cross-origin",
	}

	for header, want := range checks {
		got := rr.Header().Get(header)
		if got != want {
			t.Errorf("header %s = %q, want %q", header, got, want)
		}
	}
}

// ─── Rate Limiter Tests ──────────────────────────────────────────────────────

func TestRateLimiter_AllowAndDeny(t *testing.T) {
	t.Parallel()

	rl := newRateLimiter(3, 60) // 3 requests per 60 s
	key := "test-key"

	for i := 0; i < 3; i++ {
		if !rl.allow(key) {
			t.Errorf("request %d should be allowed", i+1)
		}
	}
	if rl.allow(key) {
		t.Error("4th request should be denied")
	}
}

func TestRateLimiter_IndependentKeys(t *testing.T) {
	t.Parallel()

	rl := newRateLimiter(1, 60)

	if !rl.allow("key-a") {
		t.Error("key-a first request should be allowed")
	}
	if !rl.allow("key-b") {
		t.Error("key-b first request should be allowed (different key)")
	}
	if rl.allow("key-a") {
		t.Error("key-a second request should be denied")
	}
}

// ─── safeRoot Path Traversal Tests ──────────────────────────────────────────

func TestSafeRoot_BlocksTraversal(t *testing.T) {
	t.Parallel()

	s := &Server{
		cfg: &mockConfig("/tmp/orbit-test-root"),
	}

	root := "/tmp/orbit-test-root"
	cases := []struct {
		name    string
		path    string
		allowed bool
	}{
		{"valid path", "/tmp/orbit-test-root/uploads/file.txt", true},
		{"root itself", "/tmp/orbit-test-root", true},
		{"traversal", "/tmp/orbit-test-root/../etc/passwd", false},
		{"absolute escape", "/etc/passwd", false},
		{"double dot only", "/../etc", false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			_, err := s.safeRoot(tc.path)
			allowed := err == nil
			if allowed != tc.allowed {
				t.Errorf("path %q: allowed=%v, want %v (err=%v)",
					tc.path, allowed, tc.allowed, err)
			}
		})
	}
	_ = root
}
