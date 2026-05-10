package api

// security_validators.go — central input-validation library used across all API handlers.
// Every user-supplied value that flows into a shell command, SQL identifier, or filesystem
// path MUST pass through one of these validators before use.

import (
	"fmt"
	"net"
	"regexp"
	"strings"
)

// ── SQL identifier validation ─────────────────────────────────────────────────
// SQL table and database names cannot be safely parameterized (they are identifiers,
// not values). We validate them against a strict allowlist before interpolating.

var reDBIdentifier = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_$\-]{0,127}$`)

// validateDBIdentifier returns nil if name is a safe SQL identifier.
// Only allows letters, digits, underscores, dollar signs, hyphens (max 128 chars).
// Rejects anything containing quotes, semicolons, spaces, or other special chars.
func validateDBIdentifier(name string) error {
	if name == "" {
		return fmt.Errorf("identifier must not be empty")
	}
	if !reDBIdentifier.MatchString(name) {
		return fmt.Errorf("identifier %q contains disallowed characters", name)
	}
	return nil
}

// quotePGIdent wraps a pre-validated identifier in double quotes for PostgreSQL.
// Escapes embedded double-quotes per the SQL standard (double them).
func quotePGIdent(name string) string {
	return `"` + strings.ReplaceAll(name, `"`, `""`) + `"`
}

// quoteMyIdent wraps a pre-validated identifier in backticks for MySQL/MariaDB.
func quoteMyIdent(name string) string {
	return "`" + strings.ReplaceAll(name, "`", "``") + "`"
}

// quoteSQLiteIdent wraps a pre-validated identifier in double quotes for SQLite.
func quoteSQLiteIdent(name string) string {
	return `"` + strings.ReplaceAll(name, `"`, `""`) + `"`
}

// ── IP / CIDR validation ──────────────────────────────────────────────────────

// validateIP returns nil if s is a valid single IP address (v4 or v6).
func validateIP(s string) error {
	if net.ParseIP(s) == nil {
		return fmt.Errorf("%q is not a valid IP address", s)
	}
	return nil
}

// validateIPOrCIDR returns nil if s is a valid IP or CIDR notation, or a
// firewall wildcard ("any" / "anywhere" / empty).
func validateIPOrCIDR(s string) error {
	if s == "" || s == "any" || s == "anywhere" {
		return nil
	}
	if net.ParseIP(s) != nil {
		return nil
	}
	if _, _, err := net.ParseCIDR(s); err == nil {
		return nil
	}
	return fmt.Errorf("%q is not a valid IP address or CIDR block", s)
}

// ── Fail2ban jail name validation ─────────────────────────────────────────────

var reJailName = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9_\-]{0,63}$`)

// validateJailName returns nil if name is a safe fail2ban jail identifier.
func validateJailName(name string) error {
	if !reJailName.MatchString(name) {
		return fmt.Errorf("jail name %q contains disallowed characters", name)
	}
	return nil
}

// ── Firewall policy / direction / protocol validation ────────────────────────

var validFWPolicies = map[string]bool{
	"allow": true, "deny": true, "reject": true, "limit": true,
}

var validFWDirections = map[string]bool{
	"incoming": true, "outgoing": true, "routed": true,
	"in": true, "out": true,
}

var validFWProtocols = map[string]bool{
	"tcp": true, "udp": true, "both": true, "any": true,
	"icmp": true, "icmpv6": true, "esp": true, "ah": true,
}

// validateFWPolicy returns nil if policy is one of the safe allow values.
func validateFWPolicy(p string) error {
	if !validFWPolicies[strings.ToLower(p)] {
		return fmt.Errorf("invalid firewall policy %q; must be allow|deny|reject|limit", p)
	}
	return nil
}

// validateFWDirection returns nil if direction is a recognised value.
func validateFWDirection(d string) error {
	if !validFWDirections[strings.ToLower(d)] {
		return fmt.Errorf("invalid firewall direction %q; must be incoming|outgoing|routed|in|out", d)
	}
	return nil
}

// validateFWProtocol returns nil if protocol is a recognised value.
func validateFWProtocol(p string) error {
	if p == "" {
		return nil
	}
	if !validFWProtocols[strings.ToLower(p)] {
		return fmt.Errorf("invalid protocol %q", p)
	}
	return nil
}

// ── Port spec validation ──────────────────────────────────────────────────────

var rePortSpec = regexp.MustCompile(`^[0-9]{1,5}(:[0-9]{1,5})?(/[a-z]{2,4})?$`)

// validatePortSpec accepts a single port, port range (80:90), or empty/"any".
// Each port number must be in the valid range 1-65535.
func validatePortSpec(p string) error {
	if p == "" || p == "any" {
		return nil
	}
	if !rePortSpec.MatchString(p) {
		return fmt.Errorf("invalid port specification %q", p)
	}
	// Validate port range for each port in the spec
	parts := strings.Split(p, ":")
	for _, part := range parts {
		// Strip protocol suffix if present
		if idx := strings.Index(part, "/"); idx >= 0 {
			part = part[:idx]
		}
		portNum, err := strconv.Atoi(part)
		if err != nil || portNum < 1 || portNum > 65535 {
			return fmt.Errorf("port %q out of range (1-65535)", part)
		}
	}
	return nil
}

// ── Filesystem safety ─────────────────────────────────────────────────────────

// kernelVirtualPrefixes lists filesystem paths that should never be served via
// the file manager API even to authenticated administrators, because they expose
// raw kernel state (memory mappings, devices, process info, etc.).
var kernelVirtualPrefixes = []string{"/proc/", "/sys/", "/dev/"}

// isKernelVirtualPath returns true when cleanPath starts with a kernel virtual filesystem.
func isKernelVirtualPath(cleanPath string) bool {
	for _, pfx := range kernelVirtualPrefixes {
		if strings.HasPrefix(cleanPath, pfx) {
			return true
		}
	}
	return false
}

// ── Nginx identifier validation ───────────────────────────────────────────────

var reNginxServiceName = regexp.MustCompile(`^[A-Za-z][A-Za-z0-9_\-]{0,63}$`)

// validateSystemdService ensures a service name is safe to pass to systemctl.
// Only pre-approved service names are allowed; this is a secondary defense
// behind the pluginServiceName allowlist.
func validateSystemdService(name string) error {
	if !reNginxServiceName.MatchString(name) {
		return fmt.Errorf("service name %q contains disallowed characters", name)
	}
	return nil
}

var reHostname = regexp.MustCompile(`^[A-Za-z0-9]([A-Za-z0-9\-]{0,61}[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9\-]{0,61}[A-Za-z0-9])?)*$`)

// isValidHostOrIP returns true if s is a valid IP address or a non-empty hostname.
func isValidHostOrIP(s string) bool {
        if s == "" {
                return false
        }
        if net.ParseIP(s) != nil {
                return true
        }
        return reHostname.MatchString(s)
}

var reDomainName = regexp.MustCompile(`^[A-Za-z0-9]([A-Za-z0-9\-]{0,61}[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9\-]{0,61}[A-Za-z0-9])?)*$`)

func validateDomain(domain string) error {
	if domain == "" {
		return fmt.Errorf("domain must not be empty")
	}
	if strings.Contains(domain, "..") {
		return fmt.Errorf("domain %q contains path traversal", domain)
	}
	if strings.ContainsAny(domain, "/\\") {
		return fmt.Errorf("domain %q contains path separators", domain)
	}
	if !reDomainName.MatchString(domain) {
		return fmt.Errorf("domain %q contains invalid characters", domain)
	}
	return nil
}
