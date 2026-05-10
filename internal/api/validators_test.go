package api

import (
	"testing"
)

// ─── validateIP ───────────────────────────────────────────────────────────────

func TestValidateIP_ValidIPv4(t *testing.T) {
	t.Parallel()
	valid := []string{"192.168.1.1", "10.0.0.1", "127.0.0.1", "0.0.0.0", "255.255.255.255"}
	for _, ip := range valid {
		if err := validateIP(ip); err != nil {
			t.Errorf("validateIP(%q) unexpected error: %v", ip, err)
		}
	}
}

func TestValidateIP_InvalidIPv4(t *testing.T) {
	t.Parallel()
	invalid := []string{"999.0.0.1", "1.2.3", "1.2.3.4.5", "256.0.0.0", ""}
	for _, ip := range invalid {
		if err := validateIP(ip); err == nil {
			t.Errorf("validateIP(%q) = nil, want error", ip)
		}
	}
}

func TestValidateIP_ValidIPv6(t *testing.T) {
	t.Parallel()
	valid := []string{"::1", "2001:db8::1", "fe80::1"}
	for _, ip := range valid {
		if err := validateIP(ip); err != nil {
			t.Errorf("validateIP(%q) unexpected error for IPv6: %v", ip, err)
		}
	}
}

func TestValidateIP_RejectsNonIP(t *testing.T) {
	t.Parallel()
	invalid := []string{"localhost", "not-an-ip", "example.com", "http://1.1.1.1"}
	for _, s := range invalid {
		if err := validateIP(s); err == nil {
			t.Errorf("validateIP(%q) = nil, want error", s)
		}
	}
}

// ─── validateIPOrCIDR ─────────────────────────────────────────────────────────

func TestValidateIPOrCIDR_ValidCIDR(t *testing.T) {
	t.Parallel()
	valid := []string{"192.168.0.0/24", "10.0.0.0/8", "0.0.0.0/0", "::1/128"}
	for _, cidr := range valid {
		if err := validateIPOrCIDR(cidr); err != nil {
			t.Errorf("validateIPOrCIDR(%q) unexpected error: %v", cidr, err)
		}
	}
}

func TestValidateIPOrCIDR_AcceptsWildcards(t *testing.T) {
	t.Parallel()
	wildcards := []string{"any", "anywhere", ""}
	for _, w := range wildcards {
		if err := validateIPOrCIDR(w); err != nil {
			t.Errorf("validateIPOrCIDR(%q) should accept wildcard, got: %v", w, err)
		}
	}
}

func TestValidateIPOrCIDR_InvalidCIDR(t *testing.T) {
	t.Parallel()
	invalid := []string{"192.168.0.0/33", "not-a-cidr", "/24", "192.168.0.0/"}
	for _, cidr := range invalid {
		if err := validateIPOrCIDR(cidr); err == nil {
			t.Errorf("validateIPOrCIDR(%q) = nil, want error", cidr)
		}
	}
}

// ─── validateDBIdentifier ─────────────────────────────────────────────────────

func TestValidateDBIdentifier_Valid(t *testing.T) {
	t.Parallel()
	valid := []string{"mydb", "users", "my_table", "_private", "db1", "Abc123"}
	for _, id := range valid {
		if err := validateDBIdentifier(id); err != nil {
			t.Errorf("validateDBIdentifier(%q) unexpected error: %v", id, err)
		}
	}
}

func TestValidateDBIdentifier_Invalid(t *testing.T) {
	t.Parallel()
	invalid := []string{
		"",
		"1bad",
		"'; DROP TABLE users;--",
		"bad name",
		"a\nb",
		"has space",
	}
	for _, id := range invalid {
		if err := validateDBIdentifier(id); err == nil {
			t.Errorf("validateDBIdentifier(%q) = nil, want error", id)
		}
	}
}

func TestValidateDBIdentifier_TooLong(t *testing.T) {
	t.Parallel()
	long := ""
	for i := 0; i < 129; i++ {
		long += "a"
	}
	if err := validateDBIdentifier(long); err == nil {
		t.Error("validateDBIdentifier with 129 chars = nil, want error")
	}
}

// ─── validatePortSpec ─────────────────────────────────────────────────────────

func TestValidatePortSpec_Valid(t *testing.T) {
	t.Parallel()
	valid := []string{"80", "443", "8080", "22:80", "3000:3100", "any"}
	for _, p := range valid {
		if err := validatePortSpec(p); err != nil {
			t.Errorf("validatePortSpec(%q) unexpected error: %v", p, err)
		}
	}
}

func TestValidatePortSpec_Invalid(t *testing.T) {
	t.Parallel()
	invalid := []string{"65536", "0", "-1", "abc", "'; DROP--"}
	for _, p := range invalid {
		if err := validatePortSpec(p); err == nil {
			t.Errorf("validatePortSpec(%q) = nil, want error", p)
		}
	}
}
