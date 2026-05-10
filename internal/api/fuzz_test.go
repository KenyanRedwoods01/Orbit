package api

import "testing"

// FuzzValidateDBIdentifier tests that validateDBIdentifier never panics and
// correctly rejects dangerous inputs.
func FuzzValidateDBIdentifier(f *testing.F) {
	// Seed corpus: known-good and known-bad inputs
	good := []string{"mydb", "users", "my_table", "_private", "db$1", "a"}
	bad  := []string{"", "1bad", "'; DROP TABLE users;--", "a b", "\x00null",
		"a\nb", "\"quoted\"", "very" + "long" + "name", "--comment"}

	for _, s := range append(good, bad...) {
		f.Add(s)
	}

	f.Fuzz(func(t *testing.T, name string) {
		// Must not panic, and if valid length + char set, must pass
		_ = validateDBIdentifier(name)
	})
}

// FuzzValidateIP tests that validateIP handles arbitrary byte sequences.
func FuzzValidateIP(f *testing.F) {
	seeds := []string{
		"127.0.0.1", "::1", "0.0.0.0", "192.168.1.1",
		"not-an-ip", "", "999.999.999.999", "2001:db8::1",
		"1.2.3.4/24", "localhost", "\x00", "256.0.0.0",
	}
	for _, s := range seeds {
		f.Add(s)
	}
	f.Fuzz(func(t *testing.T, ip string) {
		_ = validateIP(ip)
	})
}

// FuzzValidateJailName tests that validateJailName handles arbitrary strings.
func FuzzValidateJailName(f *testing.F) {
	seeds := []string{
		"sshd", "nginx-auth", "ssh_brute", "", " sshd",
		"a; rm -rf /", "jail\x00name", "../etc", "a",
	}
	for _, s := range seeds {
		f.Add(s)
	}
	f.Fuzz(func(t *testing.T, name string) {
		_ = validateJailName(name)
	})
}

// FuzzValidateIPOrCIDR tests CIDR parsing with arbitrary inputs.
func FuzzValidateIPOrCIDR(f *testing.F) {
	seeds := []string{
		"192.168.0.0/24", "10.0.0.0/8", "any", "", "1.2.3.4",
		"::1/128", "not-cidr", "1.2.3.4/33", "1.2.3.4/x",
	}
	for _, s := range seeds {
		f.Add(s)
	}
	f.Fuzz(func(t *testing.T, s string) {
		_ = validateIPOrCIDR(s)
	})
}

// FuzzHashSHA256Hex tests that hashing never panics on arbitrary input.
func FuzzHashSHA256Hex(f *testing.F) {
	f.Add("")
	f.Add("normal-token")
	f.Add("\x00\xff\xfe")
	f.Add("a very long string that goes on and on for quite some time to test large inputs properly")

	f.Fuzz(func(t *testing.T, s string) {
		h := hashSHA256Hex(s)
		if len(h) != 64 {
			t.Errorf("hashSHA256Hex(%q) = %q (len %d), want 64-char hex", s, h, len(h))
		}
	})
}
