package api

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

// TestRequireAuth_NoCookie verifies that requests without any session cookie
// receive 401 Unauthorized — not HTML (SPA catch-all must not intercept).
func TestRequireAuth_NoCookie(t *testing.T) {
	t.Parallel()

	s := &Server{cfg: mockConfig(t.TempDir())}

	called := false
	handler := s.requireAuth(func(w http.ResponseWriter, r *http.Request) {
		called = true
		w.WriteHeader(http.StatusOK)
	})

	req := httptest.NewRequest(http.MethodGet, "/api/profile", nil)
	w := httptest.NewRecorder()
	handler(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 Unauthorized, got %d (body: %q)", w.Code, w.Body.String())
	}
	if called {
		t.Error("inner handler should not be called when there is no session cookie")
	}
	// The response must be plain text, NOT HTML (SPA index.html starts with '<')
	body := w.Body.String()
	if len(body) > 0 && body[0] == '<' {
		t.Error("profile/auth endpoint returned HTML — SPA catch-all is incorrectly intercepting API routes")
	}
}

// TestRequireAuth_InvalidJWT verifies that a malformed JWT cookie yields 401.
func TestRequireAuth_InvalidJWT(t *testing.T) {
	t.Parallel()

	s := &Server{cfg: mockConfig(t.TempDir())}

	handler := s.requireAuth(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	req := httptest.NewRequest(http.MethodGet, "/api/profile", nil)
	req.AddCookie(&http.Cookie{Name: "orbit_session", Value: "not.a.valid.jwt"})
	w := httptest.NewRecorder()
	handler(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 for invalid JWT, got %d", w.Code)
	}
}

// TestRequireAdmin_NoCookie verifies that admin endpoints also return 401
// when no session is present.
func TestRequireAdmin_NoCookie(t *testing.T) {
	t.Parallel()

	s := &Server{cfg: mockConfig(t.TempDir())}

	handler := s.requireAdmin(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	req := httptest.NewRequest(http.MethodGet, "/api/users", nil)
	w := httptest.NewRecorder()
	handler(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 Unauthorized for admin endpoint, got %d", w.Code)
	}
}

// TestScopeAllowsWrite verifies the write-scope logic is correct and mirrors
// the frontend permission checks.
func TestScopeAllowsWrite(t *testing.T) {
	t.Parallel()

	allowed := []string{"admin", "write", "ui", "deploy"}
	for _, scope := range allowed {
		if !scopeAllowsWrite(scope) {
			t.Errorf("scopeAllowsWrite(%q) = false, want true", scope)
		}
	}

	denied := []string{"read-only", "read:servers", "mcp_read", "unknown", ""}
	for _, scope := range denied {
		if scopeAllowsWrite(scope) {
			t.Errorf("scopeAllowsWrite(%q) = true, want false", scope)
		}
	}
}
