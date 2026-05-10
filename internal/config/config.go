// Package config loads and validates the orbit.toml configuration file.
package config

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"log"
	"os"
	"strings"

	"github.com/BurntSushi/toml"
)

// minSecretKeyLen is the minimum number of characters required for a secret key.
const minSecretKeyLen = 32

// knownWeakKeys is a set of default/example secret keys that should never be
// used in production. Orbit will log a loud warning if it detects one.
var knownWeakKeys = []string{
	"dev-secret-key-change-in-production-abc123xyz",
	"changeme",
	"secret",
	"orbit-secret",
	"your-secret-key",
	"please-change-me",
	"change-me-generate-with-openssl-rand-hex-32",
}

// Config is the top-level configuration for Orbit.
type Config struct {
	// ListenAddr is the address the HTTP/2 server binds to.
	// Default: "0.0.0.0:5000"
	ListenAddr string `toml:"listen_addr"`

	// DataDir is the directory for SQLite database and BoltDB metric ring.
	// Default: "/var/lib/orbit"
	DataDir string `toml:"data_dir"`

	// TLSCertFile and TLSKeyFile are optional paths to PEM-encoded TLS credentials.
	TLSCertFile string `toml:"tls_cert_file"`
	TLSKeyFile  string `toml:"tls_key_file"`

	// SecretKey is used to sign JWT session tokens. Auto-generated if empty.
	SecretKey string `toml:"secret_key"`

	// Modules lists which built-in modules are enabled (all enabled by default).
	Modules ModulesConfig `toml:"modules"`

	// MCP holds MCP server configuration.
	MCP MCPConfig `toml:"mcp"`

	// Servers holds remote server connections managed via SSH.
	Servers []ServerConfig `toml:"server"`
}

// ModulesConfig toggles individual built-in modules.
type ModulesConfig struct {
	Metrics     bool `toml:"metrics"`
	Services    bool `toml:"services"`
	Logs        bool `toml:"logs"`
	Firewall    bool `toml:"firewall"`
	WebServer   bool `toml:"web_server"`
	Deploy      bool `toml:"deploy"`
	Database    bool `toml:"database"`
	Uptime      bool `toml:"uptime"`
	Security    bool `toml:"security"`
	MultiServer bool `toml:"multi_server"`
	Containers  bool `toml:"containers"`
}

// MCPConfig controls the MCP socket server.
type MCPConfig struct {
	Enabled    bool   `toml:"enabled"`
	SocketPath string `toml:"socket_path"`
	TCPAddr    string `toml:"tcp_addr"`
}

// ServerConfig defines a remote server reachable via SSH jump.
type ServerConfig struct {
	Name    string `toml:"name"`
	Host    string `toml:"host"`
	User    string `toml:"user"`
	KeyFile string `toml:"key_file"`
}

// Load reads the TOML config file at path and returns a Config with defaults applied.
func Load(path string) (*Config, error) {
	cfg := defaults()
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			cfg.ensureSecretKey()
			return cfg, nil
		}
		return nil, err
	}
	if err := toml.Unmarshal(data, cfg); err != nil {
		return nil, err
	}
	cfg.ensureSecretKey()
	cfg.validate()
	return cfg, nil
}

// ensureSecretKey auto-generates a secure random secret_key if none is configured.
func (c *Config) ensureSecretKey() {
	if c.SecretKey == "" {
		b := make([]byte, 32)
		if _, err := rand.Read(b); err == nil {
			c.SecretKey = hex.EncodeToString(b)
			log.Println("[orbit] WARNING: no secret_key configured; using an ephemeral one. Sessions will not survive restarts. Set secret_key in orbit.toml.")
		}
	}
}

// validate checks for known insecure configuration combinations and panics on
// configuration that creates an unacceptable security risk.
func (c *Config) validate() {
	// Reject known default / weak secret keys outright
	lower := strings.ToLower(c.SecretKey)
	for _, weak := range knownWeakKeys {
		if lower == strings.ToLower(weak) {
			log.Fatalf("[orbit] FATAL: secret_key is set to a known default value (%q). "+
				"Generate a random 32+ character hex string and set it in orbit.toml.", c.SecretKey)
		}
	}
	if len(c.SecretKey) < minSecretKeyLen {
		log.Fatalf("[orbit] FATAL: secret_key is too short (%d chars). "+
			"Use at least %d random characters. Run: openssl rand -hex 32", len(c.SecretKey), minSecretKeyLen)
	}

	// Reject non-loopback bindings without TLS
	if c.TLSCertFile == "" {
		host := strings.Split(c.ListenAddr, ":")[0]
		if host == "" || host == "0.0.0.0" {
			log.Fatalf("[orbit] FATAL: listening on %q without TLS is insecure. "+
				"Set tls_cert_file and tls_key_file in orbit.toml, or bind to 127.0.0.1 behind a reverse proxy.", c.ListenAddr)
		}
	}

	// Warn if listening on all interfaces
	if strings.HasPrefix(c.ListenAddr, "0.0.0.0") {
		log.Println("[orbit] WARNING: listen_addr binds to all interfaces (0.0.0.0). " +
			"Consider binding to 127.0.0.1 and using a reverse proxy if the panel should not be directly internet-facing.")
	}

	// Warn about MCP TCP exposure
	if c.MCP.Enabled && c.MCP.TCPAddr != "" && !strings.HasPrefix(c.MCP.TCPAddr, "127.0.0.1") {
		log.Printf("[orbit] SECURITY WARNING: MCP TCP listener is bound to %q (non-loopback). "+
			"MCP gives AI agents direct server control — restrict to 127.0.0.1 unless you have firewall rules.", c.MCP.TCPAddr)
	}

	// Validate listen addr
	if c.ListenAddr == "" {
		panic(fmt.Sprintf("orbit: listen_addr must not be empty"))
	}
}

func defaults() *Config {
	return &Config{
		ListenAddr: "127.0.0.1:5000",
		DataDir:    "/var/lib/orbit",
		Modules: ModulesConfig{
			Metrics:     true,
			Services:    true,
			Logs:        true,
			Firewall:    true,
			WebServer:   true,
			Deploy:      true,
			Database:    true,
			Uptime:      true,
			Security:    true,
			MultiServer: true,
			Containers:  true,
		},
		MCP: MCPConfig{
			SocketPath: "/run/orbit/mcp.sock",
		},
	}
}
