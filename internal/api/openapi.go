package api

import (
	"encoding/json"
	"net/http"
)

// handleOpenAPIDocs serves a hand-authored OpenAPI 3.1 schema covering all Orbit routes.
func (s *Server) handleOpenAPIDocs(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(orbitOpenAPISchema) //nolint:errcheck
}

// handleSwaggerUI serves a minimal HTML page that loads Swagger UI from a CDN.
func (s *Server) handleSwaggerUI(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Write([]byte(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Orbit VPS API Docs</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css">
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    SwaggerUIBundle({ url: '/api/docs/openapi.json', dom_id: '#swagger-ui',
      presets: [SwaggerUIBundle.presets.apis, SwaggerUIBundle.SwaggerUIStandalonePreset],
      layout: 'StandaloneLayout', deepLinking: true })
  </script>
</body>
</html>`)) //nolint:errcheck
}

var orbitOpenAPISchema = map[string]interface{}{
	"openapi": "3.1.0",
	"info": map[string]interface{}{
		"title":       "Orbit VPS Management API",
		"description": "Enterprise server management panel REST API",
		"version":     "1.0.0",
		"contact":     map[string]string{"name": "Orbit VPS", "url": "https://github.com/orbit-sh/orbit"},
	},
	"servers": []map[string]string{
		{"url": "/", "description": "Current server"},
	},
	"components": map[string]interface{}{
		"securitySchemes": map[string]interface{}{
			"cookieAuth": map[string]interface{}{
				"type": "apiKey",
				"in":   "cookie",
				"name": "orbit_session",
			},
		},
	},
	"security": []map[string][]string{{"cookieAuth": {}}},
	"tags": []map[string]string{
		{"name": "auth", "description": "Authentication and session management"},
		{"name": "users", "description": "User management and RBAC"},
		{"name": "settings", "description": "Server settings and configuration"},
		{"name": "metrics", "description": "Real-time system metrics"},
		{"name": "processes", "description": "Process management"},
		{"name": "services", "description": "Systemd service control"},
		{"name": "logs", "description": "Log streaming"},
		{"name": "firewall", "description": "UFW firewall management"},
		{"name": "webserver", "description": "Nginx web server management"},
		{"name": "deploy", "description": "Deploy hooks and CI/CD pipelines"},
		{"name": "containers", "description": "Docker container management"},
		{"name": "uptime", "description": "Uptime monitoring"},
		{"name": "alerts", "description": "Alert rules and events"},
		{"name": "cron", "description": "Cron job scheduling"},
		{"name": "backups", "description": "Backup management"},
		{"name": "notifications", "description": "Notification channels and delivery"},
		{"name": "ssh", "description": "SSH key vault and session management"},
		{"name": "files", "description": "File system management"},
		{"name": "ftp", "description": "FTP server control"},
		{"name": "certificates", "description": "TLS certificate management"},
		{"name": "pipelines", "description": "CI/CD pipeline management"},
		{"name": "agents", "description": "Remote server agent protocol"},
		{"name": "audit", "description": "Audit log"},
		{"name": "totp", "description": "Two-factor authentication (TOTP)"},
		{"name": "mcp", "description": "MCP token management"},
		{"name": "plugins", "description": "Plugin management"},
	},
	"paths": map[string]interface{}{
		"/api/auth/login": map[string]interface{}{
			"post": map[string]interface{}{
				"tags":    []string{"auth"},
				"summary": "Login with username and password",
				"requestBody": map[string]interface{}{
					"required": true,
					"content": map[string]interface{}{
						"application/json": map[string]interface{}{
							"schema": map[string]interface{}{
								"type": "object",
								"properties": map[string]interface{}{
									"username": map[string]string{"type": "string"},
									"password": map[string]string{"type": "string", "format": "password"},
								},
								"required": []string{"username", "password"},
							},
						},
					},
				},
				"responses": map[string]interface{}{
					"200": map[string]interface{}{"description": "Successful login, sets orbit_session cookie"},
					"401": map[string]interface{}{"description": "Invalid credentials"},
				},
			},
		},
		"/api/auth/logout": map[string]interface{}{
			"post": map[string]interface{}{
				"tags":    []string{"auth"},
				"summary": "Logout and clear session cookie",
				"responses": map[string]interface{}{
					"204": map[string]interface{}{"description": "Logged out"},
				},
			},
		},
		"/api/metrics/snapshot": map[string]interface{}{
			"get": map[string]interface{}{
				"tags":    []string{"metrics"},
				"summary": "Get current system metrics snapshot (CPU, memory, disk, network)",
				"responses": map[string]interface{}{
					"200": map[string]interface{}{"description": "Metrics snapshot"},
				},
			},
		},
		"/api/metrics/history": map[string]interface{}{
			"get": map[string]interface{}{
				"tags":    []string{"metrics"},
				"summary": "Get historical metrics time-series (last 24h from BoltDB)",
				"responses": map[string]interface{}{
					"200": map[string]interface{}{"description": "Array of metric snapshots"},
				},
			},
		},
		"/api/processes": map[string]interface{}{
			"get": map[string]interface{}{
				"tags":    []string{"processes"},
				"summary": "List all running processes with CPU/memory/IO stats",
				"responses": map[string]interface{}{
					"200": map[string]interface{}{"description": "Process list"},
				},
			},
		},
		"/api/processes/{pid}/signal": map[string]interface{}{
			"post": map[string]interface{}{
				"tags":    []string{"processes"},
				"summary": "Send a signal to a process (SIGTERM, SIGKILL, SIGHUP, etc.)",
				"responses": map[string]interface{}{
					"200": map[string]interface{}{"description": "Signal sent"},
				},
			},
		},
		"/api/processes/{pid}/nice": map[string]interface{}{
			"post": map[string]interface{}{
				"tags":    []string{"processes"},
				"summary": "Renice (change priority) of a process (-20 to 19)",
				"responses": map[string]interface{}{
					"200": map[string]interface{}{"description": "Nice value changed"},
				},
			},
		},
		"/api/services": map[string]interface{}{
			"get": map[string]interface{}{
				"tags":    []string{"services"},
				"summary": "List all systemd services",
				"responses": map[string]interface{}{
					"200": map[string]interface{}{"description": "Service list"},
				},
			},
		},
		"/api/firewall/rules": map[string]interface{}{
			"get": map[string]interface{}{
				"tags":    []string{"firewall"},
				"summary": "List UFW firewall rules",
				"responses": map[string]interface{}{
					"200": map[string]interface{}{"description": "Firewall rules"},
				},
			},
			"post": map[string]interface{}{
				"tags":    []string{"firewall"},
				"summary": "Add a UFW firewall rule",
				"responses": map[string]interface{}{
					"201": map[string]interface{}{"description": "Rule added"},
				},
			},
		},
		"/api/ssh/keys": map[string]interface{}{
			"get": map[string]interface{}{
				"tags":    []string{"ssh"},
				"summary": "List stored SSH keys (public keys and metadata only)",
				"responses": map[string]interface{}{
					"200": map[string]interface{}{"description": "SSH key list"},
				},
			},
		},
		"/api/ssh/keys/generate": map[string]interface{}{
			"post": map[string]interface{}{
				"tags":    []string{"ssh"},
				"summary": "Generate a new Ed25519 or RSA key pair server-side",
				"responses": map[string]interface{}{
					"201": map[string]interface{}{"description": "Key pair generated — private key shown only once"},
				},
			},
		},
		"/api/files/list": map[string]interface{}{
			"get": map[string]interface{}{
				"tags":    []string{"files"},
				"summary": "List directory contents with permissions, owner, mtime",
				"parameters": []map[string]interface{}{
					{"name": "path", "in": "query", "required": false, "schema": map[string]string{"type": "string", "default": "/"}},
				},
				"responses": map[string]interface{}{
					"200": map[string]interface{}{"description": "Directory listing"},
				},
			},
		},
		"/api/files/read": map[string]interface{}{
			"get": map[string]interface{}{
				"tags":    []string{"files"},
				"summary": "Read file content (max 10 MB)",
				"parameters": []map[string]interface{}{
					{"name": "path", "in": "query", "required": true, "schema": map[string]string{"type": "string"}},
				},
				"responses": map[string]interface{}{
					"200": map[string]interface{}{"description": "File content"},
				},
			},
		},
		"/api/files/write": map[string]interface{}{
			"post": map[string]interface{}{
				"tags":    []string{"files"},
				"summary": "Write content to a file (creates parent dirs automatically)",
				"responses": map[string]interface{}{
					"200": map[string]interface{}{"description": "File written"},
				},
			},
		},
		"/api/files/upload": map[string]interface{}{
			"post": map[string]interface{}{
				"tags":    []string{"files"},
				"summary": "Upload a file via multipart/form-data",
				"responses": map[string]interface{}{
					"201": map[string]interface{}{"description": "File uploaded"},
				},
			},
		},
		"/api/certs": map[string]interface{}{
			"get": map[string]interface{}{
				"tags":    []string{"certificates"},
				"summary": "List all tracked TLS certificates with expiry status",
				"responses": map[string]interface{}{
					"200": map[string]interface{}{"description": "Certificate list"},
				},
			},
		},
		"/api/certs/issue": map[string]interface{}{
			"post": map[string]interface{}{
				"tags":    []string{"certificates"},
				"summary": "Issue a Let's Encrypt certificate via certbot",
				"responses": map[string]interface{}{
					"200": map[string]interface{}{"description": "Certificate issued"},
				},
			},
		},
		"/api/pipelines": map[string]interface{}{
			"get": map[string]interface{}{
				"tags":    []string{"pipelines"},
				"summary": "List CI/CD pipelines",
				"responses": map[string]interface{}{
					"200": map[string]interface{}{"description": "Pipeline list"},
				},
			},
			"post": map[string]interface{}{
				"tags":    []string{"pipelines"},
				"summary": "Create a new pipeline with optional stages",
				"responses": map[string]interface{}{
					"201": map[string]interface{}{"description": "Pipeline created"},
				},
			},
		},
		"/api/agents": map[string]interface{}{
			"get": map[string]interface{}{
				"tags":    []string{"agents"},
				"summary": "List all registered remote server agents",
				"responses": map[string]interface{}{
					"200": map[string]interface{}{"description": "Agent list"},
				},
			},
		},
		"/api/audit/logs": map[string]interface{}{
			"get": map[string]interface{}{
				"tags":    []string{"audit"},
				"summary": "Query the admin audit log (filterable by user, method, path)",
				"parameters": []map[string]interface{}{
					{"name": "user", "in": "query", "schema": map[string]string{"type": "string"}},
					{"name": "method", "in": "query", "schema": map[string]string{"type": "string"}},
					{"name": "limit", "in": "query", "schema": map[string]interface{}{"type": "integer", "default": 200}},
				},
				"responses": map[string]interface{}{
					"200": map[string]interface{}{"description": "Audit log entries"},
				},
			},
		},
		"/api/auth/totp/setup": map[string]interface{}{
			"post": map[string]interface{}{
				"tags":    []string{"totp"},
				"summary": "Initiate TOTP setup — returns secret and otpauth:// QR URI",
				"responses": map[string]interface{}{
					"200": map[string]interface{}{"description": "TOTP provisioning data"},
				},
			},
		},
		"/api/auth/totp/verify": map[string]interface{}{
			"post": map[string]interface{}{
				"tags":    []string{"totp"},
				"summary": "Verify a TOTP code and activate 2FA for the current user",
				"responses": map[string]interface{}{
					"200": map[string]interface{}{"description": "TOTP activated, backup codes returned"},
				},
			},
		},
		"/api/notifications/channels": map[string]interface{}{
			"get": map[string]interface{}{
				"tags":    []string{"notifications"},
				"summary": "List notification channels (Slack, Discord, SMTP, Telegram, PagerDuty)",
				"responses": map[string]interface{}{
					"200": map[string]interface{}{"description": "Channel list"},
				},
			},
		},
		"/api/ftp/config": map[string]interface{}{
			"get": map[string]interface{}{
				"tags":    []string{"ftp"},
				"summary": "Read vsftpd.conf (raw and parsed key-value map)",
				"responses": map[string]interface{}{
					"200": map[string]interface{}{"description": "FTP server configuration"},
				},
			},
			"put": map[string]interface{}{
				"tags":    []string{"ftp"},
				"summary": "Write vsftpd.conf (raw string or parsed map)",
				"responses": map[string]interface{}{
					"200": map[string]interface{}{"description": "Config saved"},
				},
			},
		},
	},
}
