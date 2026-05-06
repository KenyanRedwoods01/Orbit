// Package config loads and validates the orbit.toml configuration file.
package config

import (
        "os"

        "github.com/BurntSushi/toml"
)

// Config is the top-level configuration for Orbit.
type Config struct {
        // ListenAddr is the address the HTTP/2 server binds to.
        // Default: "0.0.0.0:5000"
        ListenAddr string `toml:"listen_addr"`

        // DataDir is the directory for SQLite database and BoltDB metric ring.
        // Default: "/var/lib/orbit"
        DataDir string `toml:"data_dir"`

        // TLSCertFile and TLSKeyFile are optional paths to PEM-encoded TLS credentials.
        // If empty, Orbit generates a self-signed certificate on first run.
        TLSCertFile string `toml:"tls_cert_file"`
        TLSKeyFile  string `toml:"tls_key_file"`

        // SecretKey is used to sign JWT session tokens. Generated at first run if empty.
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
        SocketPath string `toml:"socket_path"` // Unix socket path, default /run/orbit/mcp.sock
        TCPAddr    string `toml:"tcp_addr"`    // Optional TCP listener, e.g. "127.0.0.1:5001"
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
                        // No config file — use defaults.
                        return cfg, nil
                }
                return nil, err
        }
        if err := toml.Unmarshal(data, cfg); err != nil {
                return nil, err
        }
        return cfg, nil
}

func defaults() *Config {
        return &Config{
                ListenAddr: "0.0.0.0:5000",
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
