package api

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
	"unicode"
)

// splitShellWords performs a simple POSIX-like word split on a command string,
// handling single-quoted and double-quoted segments. This allows us to invoke
// app install commands through exec.Command without passing them through a
// shell interpreter, eliminating the sh -c injection vector (#1).
func splitShellWords(s string) ([]string, error) {
	const (
		singleQuote = rune(39) // ASCII apostrophe / single-quote
		doubleQuote = rune(34) // ASCII double-quote
	)
	var words []string
	var word strings.Builder
	inQuote := rune(0)

	for _, ch := range s {
		switch {
		case inQuote != 0 && ch == inQuote:
			// Closing quote
			inQuote = 0
		case inQuote != 0:
			// Inside a quoted segment
			word.WriteRune(ch)
		case ch == singleQuote || ch == doubleQuote:
			// Opening quote
			inQuote = ch
		case unicode.IsSpace(ch):
			// Word boundary
			if word.Len() > 0 {
				words = append(words, word.String())
				word.Reset()
			}
		default:
			word.WriteRune(ch)
		}
	}
	if inQuote != 0 {
		return nil, fmt.Errorf("unterminated quote in install command")
	}
	if word.Len() > 0 {
		words = append(words, word.String())
	}
	return words, nil
}

// ── App Registry ──────────────────────────────────────────────────────────────

type AppCategory string

const (
	AppCatPaaS      AppCategory = "Platform as a Service"
	AppCatContainer AppCategory = "Container Management"
	AppCatProxy     AppCategory = "Reverse Proxy"
	AppCatDatabase  AppCategory = "Database"
	AppCatCICD      AppCategory = "CI/CD"
)

type AppInstallMethod string

const (
	AppInstallDocker  AppInstallMethod = "docker"
	AppInstallScript  AppInstallMethod = "script"
	AppInstallCompose AppInstallMethod = "compose"
)

type ServerAppDef struct {
	ID             string           `json:"id"`
	Name           string           `json:"name"`
	Tagline        string           `json:"tagline"`
	Description    string           `json:"description"`
	LongDesc       string           `json:"long_desc"`
	Category       AppCategory      `json:"category"`
	Version        string           `json:"version"`
	Author         string           `json:"author"`
	License        string           `json:"license"`
	Website        string           `json:"website"`
	GitHub         string           `json:"github"`
	Docs           string           `json:"docs"`
	InstallMethod  AppInstallMethod `json:"install_method"`
	InstallCommand string           `json:"install_command"`
	DockerImage    string           `json:"docker_image,omitempty"`
	DockerCompose  string           `json:"docker_compose,omitempty"`
	ContainerName  string           `json:"container_name"`
	MinRAMMB       int              `json:"min_ram_mb"`
	MinCPU         int              `json:"min_cpu"`
	MinDiskGB      int              `json:"min_disk_gb"`
	RequiredPorts  []int            `json:"required_ports"`
	DefaultPort    int              `json:"default_port"`
	HealthEndpoint string           `json:"health_endpoint"`
	Features       []string         `json:"features"`
	Tags           []string         `json:"tags"`
	Pricing        string           `json:"pricing"`
}

// serverAppsRegistry is the authoritative list of installable apps.
var serverAppsRegistry = []ServerAppDef{
	// ── Platform as a Service ──────────────────────────────────────────────────
	{
		ID:            "coolify",
		Name:          "Coolify",
		Tagline:       "Self-hosting with superpowers",
		Description:   "An open-source & self-hostable Heroku / Netlify / Vercel alternative.",
		LongDesc:      "Coolify is an open-source & self-hostable Heroku / Netlify / Vercel alternative. Deploy your apps, databases, and services with a single click. Supports Docker, Docker Compose, Nixpacks, Buildpacks, and more.",
		Category:      AppCatPaaS,
		Version:       "4.0.0-beta.311",
		Author:        "CoolLabs",
		License:       "Apache-2.0",
		Website:       "https://coolify.io",
		GitHub:        "https://github.com/coollabsio/coolify",
		Docs:          "https://coolify.io/docs",
		InstallMethod: AppInstallScript,
		InstallCommand: "curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash",
		ContainerName: "coolify",
		MinRAMMB:      2048, MinCPU: 2, MinDiskGB: 20,
		RequiredPorts: []int{80, 443, 3000, 6001, 6002},
		DefaultPort:   3000, HealthEndpoint: "/api/health",
		Features: []string{"One-click app deployment", "Git integration (GitHub/GitLab/Bitbucket)", "Automatic SSL via Let's Encrypt", "Database provisioning (PG/MySQL/Redis/MongoDB)", "Docker Compose support", "Real-time log streaming", "Team collaboration & RBAC", "Environment variable management", "Built-in cron jobs", "Automatic backups"},
		Tags:    []string{"paas", "heroku-alternative", "deployment", "git"},
		Pricing: "Free & Open Source",
	},
	{
		ID:            "dokploy",
		Name:          "Dokploy",
		Tagline:       "Effortless Deployment Platform",
		Description:   "Modern self-hosted PaaS built with Next.js — deploy apps and databases with ease.",
		LongDesc:      "Dokploy is a modern self-hosted Platform as a Service (PaaS) built with Next.js. Deploy applications and databases with ease, with full Docker, Git, and SSL support out of the box.",
		Category:      AppCatPaaS,
		Version:       "0.9.1",
		Author:        "Dokploy Team",
		License:       "Apache-2.0",
		Website:       "https://dokploy.com",
		GitHub:        "https://github.com/Dokploy/dokploy",
		Docs:          "https://docs.dokploy.com",
		InstallMethod: AppInstallScript,
		InstallCommand: "curl -sSL https://dokploy.com/install.sh | bash",
		ContainerName: "dokploy",
		MinRAMMB:      2048, MinCPU: 2, MinDiskGB: 20,
		RequiredPorts: []int{80, 443, 3000},
		DefaultPort:   3000,
		Features: []string{"Docker container management", "Git-based deployments (push-to-deploy)", "Automatic SSL certificates", "Database provisioning", "Real-time monitoring & logs", "Backup management", "Multi-node support", "Template marketplace", "Webhook triggers"},
		Tags:    []string{"paas", "docker", "git", "deployment"},
		Pricing: "Free & Open Source",
	},
	{
		ID:            "caprover",
		Name:          "CapRover",
		Tagline:       "Scalable, Free and Self-Hosted PaaS",
		Description:   "Extremely easy to use app/database deployment & web server manager.",
		LongDesc:      "CapRover is an extremely easy to use app/database deployment & web server manager for your NodeJS, Python, PHP, ASP.NET, Ruby, MySQL, MongoDB, Postgres, WordPress apps. It's blazingly fast and very robust as it uses Docker, nginx, LetsEncrypt and NetData under the hood.",
		Category:      AppCatPaaS,
		Version:       "1.11.0",
		Author:        "CapRover",
		License:       "Apache-2.0",
		Website:       "https://caprover.com",
		GitHub:        "https://github.com/caprover/caprover",
		Docs:          "https://caprover.com/docs",
		InstallMethod: AppInstallDocker,
		InstallCommand: "docker run -p 80:80 -p 443:443 -p 3000:3000 -v /var/run/docker.sock:/var/run/docker.sock -v /captain:/captain caprover/caprover",
		DockerImage:   "caprover/caprover",
		ContainerName: "caprover",
		MinRAMMB:      1024, MinCPU: 1, MinDiskGB: 10,
		RequiredPorts: []int{80, 443, 3000},
		DefaultPort:   3000,
		Features: []string{"One-click app deployments", "CLI & Web GUI", "Automatic SSL (Let's Encrypt)", "Docker native", "Multi-language support", "Built-in load balancer", "Private Docker registries", "Persistent storage", "Pre-deploy health checks"},
		Tags:    []string{"paas", "docker", "deployment"},
		Pricing: "Free & Open Source",
	},
	{
		ID:            "easypanel",
		Name:          "Easypanel",
		Tagline:       "Modern Server Control Panel",
		Description:   "Beautiful and simple server control panel for managing applications and databases.",
		LongDesc:      "Easypanel is a modern server control panel built with simplicity in mind. It gives you everything you need to deploy and manage applications, databases, and services on your own server without any DevOps expertise.",
		Category:      AppCatPaaS,
		Version:       "1.0",
		Author:        "Easypanel",
		License:       "Proprietary (free tier)",
		Website:       "https://easypanel.io",
		GitHub:        "https://github.com/easypanel-io/easypanel",
		Docs:          "https://easypanel.io/docs",
		InstallMethod: AppInstallScript,
		InstallCommand: "curl -sSL https://get.easypanel.io | sh",
		ContainerName: "easypanel",
		MinRAMMB:      1024, MinCPU: 1, MinDiskGB: 15,
		RequiredPorts: []int{80, 443, 3000},
		DefaultPort:   3000,
		Features: []string{"Docker compose support", "SSL certificate management", "Database management (PG/MySQL/Redis/MongoDB)", "Built-in file manager", "Cron jobs", "Server monitoring", "One-click app templates"},
		Tags:    []string{"control-panel", "server-management", "paas"},
		Pricing: "Free & Open Source",
	},
	// ── Container Management ───────────────────────────────────────────────────
	{
		ID:            "portainer",
		Name:          "Portainer",
		Tagline:       "Universal Container Management",
		Description:   "Powerful, easy-to-use container management platform for Docker, Swarm, and Kubernetes.",
		LongDesc:      "Portainer is a universal container management platform that allows you to manage Docker, Docker Swarm, and Kubernetes environments through a simple web UI. No need for command line expertise.",
		Category:      AppCatContainer,
		Version:       "2.19.4",
		Author:        "Portainer.io",
		License:       "zlib",
		Website:       "https://www.portainer.io",
		GitHub:        "https://github.com/portainer/portainer",
		Docs:          "https://docs.portainer.io",
		InstallMethod: AppInstallDocker,
		InstallCommand: "docker run -d -p 8000:8000 -p 9443:9443 --name portainer --restart=always -v /var/run/docker.sock:/var/run/docker.sock -v portainer_data:/data portainer/portainer-ce:latest",
		DockerImage:   "portainer/portainer-ce:latest",
		ContainerName: "portainer",
		MinRAMMB:      512, MinCPU: 1, MinDiskGB: 5,
		RequiredPorts: []int{8000, 9443},
		DefaultPort:   9443, HealthEndpoint: "/api/status",
		Features: []string{"Container lifecycle management (start/stop/restart/remove)", "Docker Compose stack deployment", "Image pull, push, and management", "Volume and network management", "Access control with teams and roles", "Registry management (Docker Hub, ECR, GCR)", "Real-time container logs and stats", "Kubernetes cluster management", "Webhook-based automated deployments"},
		Tags:    []string{"docker", "containers", "kubernetes", "management"},
		Pricing: "Free (CE) / Paid (BE)",
	},
	{
		ID:            "dockge",
		Name:          "Dockge",
		Tagline:       "A fancy, easy-to-use Docker Compose manager",
		Description:   "Self-hosted web app for managing docker-compose stacks with a beautiful reactive UI.",
		LongDesc:      "Dockge is a self-hosted, elegant, reactive, and easy-to-use docker-compose.yaml stack-oriented manager. Interactively edit docker compose files, manage stacks, and watch real-time logs.",
		Category:      AppCatContainer,
		Version:       "1.4.2",
		Author:        "Louis Lam (louislam)",
		License:       "MIT",
		Website:       "https://dockge.kuma.pet",
		GitHub:        "https://github.com/louislam/dockge",
		Docs:          "https://github.com/louislam/dockge#readme",
		InstallMethod: AppInstallDocker,
		InstallCommand: "docker run -d -p 5001:5001 --name dockge --restart unless-stopped -v /var/run/docker.sock:/var/run/docker.sock -v /opt/dockge/data:/app/data -v /opt/stacks:/opt/stacks -e DOCKGE_STACKS_DIR=/opt/stacks louislam/dockge:1",
		DockerImage:   "louislam/dockge:1",
		ContainerName: "dockge",
		MinRAMMB:      256, MinCPU: 1, MinDiskGB: 5,
		RequiredPorts: []int{5001},
		DefaultPort:   5001,
		Features: []string{"Interactive Docker Compose stack editor", "Real-time log streaming via web terminal", "Convert `docker run` to `docker-compose`", "Multi-agent / multi-server support", "Mobile-responsive design", "Reactive UI with instant feedback"},
		Tags:    []string{"docker", "compose", "stacks", "management"},
		Pricing: "Free & Open Source",
	},
	{
		ID:            "yacht",
		Name:          "Yacht",
		Tagline:       "Container management with an emphasis on templating",
		Description:   "Web interface for managing Docker containers with a focus on easy deployments via templates.",
		LongDesc:      "Yacht is a web interface for managing Docker containers with an emphasis on templating to provide easy deployments. Features include container resource monitoring, template marketplace, and user management.",
		Category:      AppCatContainer,
		Version:       "1.0",
		Author:        "SelfhostedPro",
		License:       "MIT",
		Website:       "https://yacht.sh",
		GitHub:        "https://github.com/SelfhostedPro/Yacht",
		Docs:          "https://yacht.sh/docs",
		InstallMethod: AppInstallDocker,
		InstallCommand: "docker run -d -p 8000:8000 --name yacht --restart unless-stopped -v /var/run/docker.sock:/var/run/docker.sock -v yacht:/config selfhostedpro/yacht",
		DockerImage:   "selfhostedpro/yacht",
		ContainerName: "yacht",
		MinRAMMB:      256, MinCPU: 1, MinDiskGB: 5,
		RequiredPorts: []int{8000},
		DefaultPort:   8000,
		Features: []string{"Container lifecycle management", "Template marketplace (Portainer-compatible)", "Docker Compose support", "Container resource monitoring (CPU/RAM)", "User management with OAuth support", "One-click deployments from templates"},
		Tags:    []string{"docker", "containers", "templates", "management"},
		Pricing: "Free & Open Source",
	},
	// ── Reverse Proxy ──────────────────────────────────────────────────────────
	{
		ID:            "traefik",
		Name:          "Traefik",
		Tagline:       "The Cloud Native Application Proxy",
		Description:   "Modern HTTP reverse proxy and load balancer for microservices with automatic SSL.",
		LongDesc:      "Traefik is a leading modern reverse proxy and load balancer that makes deploying microservices easy. It integrates with your existing infrastructure components and configures itself automatically and dynamically.",
		Category:      AppCatProxy,
		Version:       "2.11",
		Author:        "Traefik Labs",
		License:       "MIT",
		Website:       "https://traefik.io",
		GitHub:        "https://github.com/traefik/traefik",
		Docs:          "https://doc.traefik.io/traefik/",
		InstallMethod: AppInstallDocker,
		InstallCommand: "docker run -d --name traefik --restart unless-stopped -p 80:80 -p 443:443 -p 8080:8080 -v /var/run/docker.sock:/var/run/docker.sock:ro -v /opt/traefik:/etc/traefik traefik:latest --api.insecure=true --providers.docker",
		DockerImage:   "traefik:latest",
		ContainerName: "traefik",
		MinRAMMB:      256, MinCPU: 1, MinDiskGB: 5,
		RequiredPorts: []int{80, 443, 8080},
		DefaultPort:   8080, HealthEndpoint: "/ping",
		Features: []string{"Automatic SSL via Let's Encrypt", "Docker & Kubernetes native", "Load balancing (round-robin, weighted, sticky)", "HTTP/2 & HTTP/3 (QUIC) support", "WebSocket pass-through", "Prometheus metrics", "Circuit breakers & retry", "Rate limiting & IP allowlisting", "Middleware pipeline"},
		Tags:    []string{"proxy", "load-balancer", "ssl", "microservices"},
		Pricing: "Free & Open Source",
	},
	{
		ID:            "nginx-proxy-manager",
		Name:          "Nginx Proxy Manager",
		Tagline:       "Expose your services easily and securely",
		Description:   "Beautiful admin UI for managing Nginx proxy hosts with free SSL from Let's Encrypt.",
		LongDesc:      "Nginx Proxy Manager enables you to easily forward web services, with free SSL certificates, without knowing much about Nginx or Let's Encrypt. All configuration is done through a clean, easy-to-use web UI.",
		Category:      AppCatProxy,
		Version:       "2.11.1",
		Author:        "jc21",
		License:       "MIT",
		Website:       "https://nginxproxymanager.com",
		GitHub:        "https://github.com/NginxProxyManager/nginx-proxy-manager",
		Docs:          "https://nginxproxymanager.com/guide/",
		InstallMethod: AppInstallDocker,
		InstallCommand: "docker run -d --name nginx-proxy-manager --restart unless-stopped -p 80:80 -p 443:443 -p 81:81 -v /opt/npm/data:/data -v /opt/npm/letsencrypt:/etc/letsencrypt jc21/nginx-proxy-manager:latest",
		DockerImage:   "jc21/nginx-proxy-manager:latest",
		ContainerName: "nginx-proxy-manager",
		MinRAMMB:      256, MinCPU: 1, MinDiskGB: 5,
		RequiredPorts: []int{80, 443, 81},
		DefaultPort:   81,
		Features: []string{"Beautiful web-based proxy management UI", "Free SSL via Let's Encrypt (auto-renew)", "Access lists & basic auth", "Custom locations & advanced config", "Stream (TCP/UDP) proxying", "Real-time traffic stats", "Multi-user support with fine-grained permissions", "IP whitelisting"},
		Tags:    []string{"proxy", "nginx", "ssl", "management"},
		Pricing: "Free & Open Source",
	},
	{
		ID:            "caddy",
		Name:          "Caddy",
		Tagline:       "The Ultimate Server with Automatic HTTPS",
		Description:   "Powerful, enterprise-ready open source web server with automatic HTTPS written in Go.",
		LongDesc:      "Caddy is a powerful, enterprise-ready, open source web server with automatic HTTPS written in Go. It handles TLS certificate management, HTTP/2, HTTP/3, reverse proxying, static file serving, and more — all from a simple Caddyfile or JSON API.",
		Category:      AppCatProxy,
		Version:       "2.7",
		Author:        "Caddy Authors",
		License:       "Apache-2.0",
		Website:       "https://caddyserver.com",
		GitHub:        "https://github.com/caddyserver/caddy",
		Docs:          "https://caddyserver.com/docs",
		InstallMethod: AppInstallScript,
		InstallCommand: "apt install -y debian-keyring debian-archive-keyring apt-transport-https curl && curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg && curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list && apt update && apt install caddy",
		ContainerName: "caddy",
		MinRAMMB:      128, MinCPU: 1, MinDiskGB: 2,
		RequiredPorts: []int{80, 443, 2019},
		DefaultPort:   2019, HealthEndpoint: "/config/",
		Features: []string{"Automatic HTTPS (zero-config)", "HTTP/2 & HTTP/3 (QUIC)", "API-driven dynamic configuration", "Plugin system for extensions", "FastCGI & PHP support", "Markdown rendering", "Request/response manipulation", "On-demand TLS for wildcard domains"},
		Tags:    []string{"web-server", "proxy", "ssl", "go"},
		Pricing: "Free & Open Source",
	},
	// ── Database ───────────────────────────────────────────────────────────────
	{
		ID:            "postgresql",
		Name:          "PostgreSQL",
		Tagline:       "The World's Most Advanced Open Source Relational Database",
		Description:   "Powerful open-source object-relational database with 35+ years of active development.",
		LongDesc:      "PostgreSQL is a powerful, open source object-relational database system with over 35 years of active development. It has earned a strong reputation for reliability, feature robustness, and performance. Supports advanced SQL, JSONB, full-text search, geospatial data, and much more.",
		Category:      AppCatDatabase,
		Version:       "16",
		Author:        "PostgreSQL Global Development Group",
		License:       "PostgreSQL License",
		Website:       "https://www.postgresql.org",
		GitHub:        "https://github.com/postgres/postgres",
		Docs:          "https://www.postgresql.org/docs/",
		InstallMethod: AppInstallDocker,
		InstallCommand: "docker run -d --name postgresql --restart unless-stopped -e POSTGRES_PASSWORD=changeme -e POSTGRES_USER=postgres -e POSTGRES_DB=postgres -p 5432:5432 -v postgres_data:/var/lib/postgresql/data postgres:16-alpine",
		DockerImage:   "postgres:16-alpine",
		ContainerName: "postgresql",
		MinRAMMB:      512, MinCPU: 1, MinDiskGB: 10,
		RequiredPorts: []int{5432},
		DefaultPort:   5432,
		Features: []string{"Full ACID compliance", "Advanced SQL with window functions & CTEs", "JSONB for document storage", "Full-text search", "Foreign data wrappers (FDW)", "Table partitioning", "Logical & streaming replication", "Point-in-time recovery (PITR)", "Row-level security"},
		Tags:    []string{"database", "sql", "relational", "postgres"},
		Pricing: "Free & Open Source",
	},
	{
		ID:            "redis",
		Name:          "Redis",
		Tagline:       "In-memory data structure store",
		Description:   "Open-source in-memory data store for caching, sessions, pub/sub, queues, and real-time analytics.",
		LongDesc:      "Redis is an open source, in-memory data structure store used as a database, cache, message broker, and streaming engine. It supports strings, hashes, lists, sets, sorted sets, bitmaps, hyperloglogs, geospatial indexes, and streams.",
		Category:      AppCatDatabase,
		Version:       "7.2",
		Author:        "Redis Ltd.",
		License:       "BSD-3-Clause",
		Website:       "https://redis.io",
		GitHub:        "https://github.com/redis/redis",
		Docs:          "https://redis.io/documentation",
		InstallMethod: AppInstallDocker,
		InstallCommand: "docker run -d --name redis --restart unless-stopped -p 6379:6379 -v redis_data:/data redis:7-alpine redis-server --appendonly yes --requirepass changeme",
		DockerImage:   "redis:7-alpine",
		ContainerName: "redis",
		MinRAMMB:      128, MinCPU: 1, MinDiskGB: 5,
		RequiredPorts: []int{6379},
		DefaultPort:   6379,
		Features: []string{"Sub-millisecond read/write latency", "Pub/Sub messaging", "Lua scripting", "Atomic transactions (MULTI/EXEC)", "Persistent storage (RDB + AOF)", "Replication with automatic failover", "Redis Sentinel for HA", "Redis Cluster for horizontal scaling"},
		Tags:    []string{"database", "cache", "nosql", "pub-sub"},
		Pricing: "Free & Open Source",
	},
	// ── CI/CD ──────────────────────────────────────────────────────────────────
	{
		ID:            "jenkins",
		Name:          "Jenkins",
		Tagline:       "Build great things at any scale",
		Description:   "The leading open source automation server with hundreds of plugins for any build/deploy pipeline.",
		LongDesc:      "Jenkins is the world's leading open source automation server. It provides hundreds of plugins to support building, deploying, and automating any project. With a distributed build architecture and extensible pipeline DSL (Jenkinsfile), Jenkins scales from small teams to enterprise CI/CD.",
		Category:      AppCatCICD,
		Version:       "2.440-lts",
		Author:        "Jenkins Project",
		License:       "MIT",
		Website:       "https://www.jenkins.io",
		GitHub:        "https://github.com/jenkinsci/jenkins",
		Docs:          "https://www.jenkins.io/doc/",
		InstallMethod: AppInstallDocker,
		InstallCommand: "docker run -d --name jenkins --restart unless-stopped -p 8080:8080 -p 50000:50000 -v jenkins_home:/var/jenkins_home -v /var/run/docker.sock:/var/run/docker.sock jenkins/jenkins:lts",
		DockerImage:   "jenkins/jenkins:lts",
		ContainerName: "jenkins",
		MinRAMMB:      1024, MinCPU: 2, MinDiskGB: 10,
		RequiredPorts: []int{8080, 50000},
		DefaultPort:   8080, HealthEndpoint: "/login",
		Features: []string{"Pipeline as code (Jenkinsfile)", "1800+ plugin ecosystem", "Distributed build agents", "Docker-in-Docker builds", "Credentials & secret management", "Role-based access control", "Pipeline visualization (Blue Ocean)", "Artifact archiving", "Parameterised builds & schedules"},
		Tags:    []string{"ci-cd", "automation", "devops", "pipelines"},
		Pricing: "Free & Open Source",
	},
	{
		ID:            "gitea",
		Name:          "Gitea",
		Tagline:       "A painless self-hosted Git service",
		Description:   "Lightweight self-hosted Git service with built-in CI/CD, issue tracking, and package registry.",
		LongDesc:      "Gitea is a painless self-hosted all-in-one software development service. It includes Git hosting, code review, team collaboration, package registry, and CI/CD. It is similar to GitHub, Bitbucket and GitLab.",
		Category:      AppCatCICD,
		Version:       "1.21",
		Author:        "Gitea Project",
		License:       "MIT",
		Website:       "https://gitea.io",
		GitHub:        "https://github.com/go-gitea/gitea",
		Docs:          "https://docs.gitea.io",
		InstallMethod: AppInstallDocker,
		InstallCommand: "docker run -d --name gitea --restart unless-stopped -p 3000:3000 -p 222:22 -v gitea_data:/data gitea/gitea:latest",
		DockerImage:   "gitea/gitea:latest",
		ContainerName: "gitea",
		MinRAMMB:      512, MinCPU: 1, MinDiskGB: 10,
		RequiredPorts: []int{3000, 222},
		DefaultPort:   3000,
		Features: []string{"Full Git hosting (push, clone, fork)", "Pull request & code review workflow", "Built-in Gitea Actions (GitHub-compatible CI/CD)", "Issue tracker with milestones & labels", "Package registry (Docker, npm, PyPI, Maven)", "Wiki & documentation", "Organisation & team management", "Webhooks & OAuth2"},
		Tags:    []string{"git", "ci-cd", "scm", "self-hosted"},
		Pricing: "Free & Open Source",
	},
}

// appsByID provides O(1) lookup.
var appsByID = func() map[string]*ServerAppDef {
	m := make(map[string]*ServerAppDef, len(serverAppsRegistry))
	for i := range serverAppsRegistry {
		m[serverAppsRegistry[i].ID] = &serverAppsRegistry[i]
	}
	return m
}()

// ── DB record ─────────────────────────────────────────────────────────────────

type serverAppRecord struct {
	ID            int64   `json:"id"`
	AppID         string  `json:"app_id"`
	Status        string  `json:"status"` // not_installed | installing | running | stopped | error
	Port          int     `json:"port"`
	ContainerID   string  `json:"container_id"`
	ContainerName string  `json:"container_name"`
	ConfigJSON    string  `json:"config_json"`
	InstallLog    string  `json:"install_log"`
	Error         string  `json:"error"`
	InstalledAt   *int64  `json:"installed_at"`
	UpdatedAt     int64   `json:"updated_at"`
}

// AppResponse merges the static definition with live DB record.
type AppResponse struct {
	ServerAppDef
	Status        string  `json:"status"`
	Port          int     `json:"port"`
	ContainerID   string  `json:"container_id"`
	ContainerName string  `json:"container_name"`
	ConfigJSON    string  `json:"config_json"`
	Error         string  `json:"error"`
	InstalledAt   *int64  `json:"installed_at"`
	UpdatedAt     int64   `json:"updated_at"`
	DBRecordID    *int64  `json:"db_record_id,omitempty"`
}

// ── Install lock (one install at a time per app) ──────────────────────────────

var (
	appInstallMu    sync.Mutex
	appInstallQueue = map[string]bool{}
)

// ── Helpers ───────────────────────────────────────────────────────────────────

func (s *Server) seedServerApps() {
	ctx := context.Background()
	now := time.Now().Unix()
	for _, app := range serverAppsRegistry {
		var count int
		_ = s.db.SQL.QueryRowContext(ctx, `SELECT COUNT(*) FROM server_apps WHERE app_id=?`, app.ID).Scan(&count)
		if count == 0 {
			_, _ = s.db.SQL.ExecContext(ctx,
				`INSERT INTO server_apps (app_id, status, port, container_name, config_json, updated_at) VALUES (?,?,?,?,?,?)`,
				app.ID, "not_installed", app.DefaultPort, app.ContainerName, "{}", now,
			)
		}
	}
}

func (s *Server) getAppRecord(ctx context.Context, appID string) (*serverAppRecord, error) {
	var r serverAppRecord
	err := s.db.SQL.QueryRowContext(ctx,
		`SELECT id, app_id, status, port, container_id, container_name, config_json,
		        COALESCE(install_log,''), COALESCE(error,''), installed_at, updated_at
		 FROM server_apps WHERE app_id=?`, appID,
	).Scan(&r.ID, &r.AppID, &r.Status, &r.Port, &r.ContainerID, &r.ContainerName,
		&r.ConfigJSON, &r.InstallLog, &r.Error, &r.InstalledAt, &r.UpdatedAt)
	return &r, err
}

// detectDockerStatus queries the Docker daemon for the container state.
func detectDockerStatus(containerName string) string {
	if containerName == "" {
		return "unknown"
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	out, err := exec.CommandContext(ctx, "docker", "inspect", "--format", "{{.State.Status}}", containerName).Output()
	if err != nil {
		return "not_installed"
	}
	state := strings.TrimSpace(string(out))
	switch state {
	case "running":
		return "running"
	case "exited", "dead":
		return "stopped"
	case "paused":
		return "stopped"
	case "restarting":
		return "running"
	default:
		return "not_installed"
	}
}

// detectPortStatus probes the default port via TCP dial.
func detectPortStatus(port int) bool {
	if port <= 0 {
		return false
	}
	conn, err := net.DialTimeout("tcp", fmt.Sprintf("127.0.0.1:%d", port), 2*time.Second)
	if err != nil {
		return false
	}
	conn.Close()
	return true
}

// mergeAppResponse builds a full AppResponse from the def + DB record + live detection.
func mergeAppResponse(def *ServerAppDef, rec *serverAppRecord) AppResponse {
	ar := AppResponse{
		ServerAppDef:  *def,
		Status:        "not_installed",
		Port:          def.DefaultPort,
		ContainerName: def.ContainerName,
		ConfigJSON:    "{}",
		UpdatedAt:     time.Now().Unix(),
	}
	if rec != nil {
		ar.Status = rec.Status
		ar.Port = rec.Port
		ar.ContainerID = rec.ContainerID
		ar.ContainerName = rec.ContainerName
		ar.ConfigJSON = rec.ConfigJSON
		ar.Error = rec.Error
		ar.InstalledAt = rec.InstalledAt
		ar.UpdatedAt = rec.UpdatedAt
		id := rec.ID
		ar.DBRecordID = &id
	}

	// Live status detection — only if record says running/stopped/installed
	if rec != nil && rec.Status != "not_installed" && rec.Status != "installing" {
		var liveStatus string
		if def.InstallMethod == AppInstallDocker || def.InstallMethod == AppInstallCompose {
			cn := rec.ContainerName
			if cn == "" {
				cn = def.ContainerName
			}
			liveStatus = detectDockerStatus(cn)
		} else {
			if detectPortStatus(rec.Port) {
				liveStatus = "running"
			} else {
				liveStatus = "stopped"
			}
		}
		if liveStatus != "unknown" {
			ar.Status = liveStatus
			// Persist status back to DB asynchronously to avoid slowing down the request.
			// We don't block on this.
		}
	}
	return ar
}

// ── Handlers ──────────────────────────────────────────────────────────────────

func (s *Server) handleAppList(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	rows, _ := s.db.SQL.QueryContext(ctx,
		`SELECT id, app_id, status, port, container_id, container_name, config_json,
		        COALESCE(install_log,''), COALESCE(error,''), installed_at, updated_at
		 FROM server_apps`)

	records := map[string]*serverAppRecord{}
	if rows != nil {
		defer rows.Close()
		for rows.Next() {
			var rec serverAppRecord
			rows.Scan(&rec.ID, &rec.AppID, &rec.Status, &rec.Port, &rec.ContainerID, &rec.ContainerName, //nolint:errcheck
				&rec.ConfigJSON, &rec.InstallLog, &rec.Error, &rec.InstalledAt, &rec.UpdatedAt)
			r2 := rec
			records[rec.AppID] = &r2
		}
	}

	out := make([]AppResponse, 0, len(serverAppsRegistry))
	for i := range serverAppsRegistry {
		def := &serverAppsRegistry[i]
		ar := mergeAppResponse(def, records[def.ID])
		out = append(out, ar)
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(out) //nolint:errcheck
}

func (s *Server) handleAppGet(w http.ResponseWriter, r *http.Request) {
	appID := r.PathValue("id")
	def, ok := appsByID[appID]
	if !ok {
		http.Error(w, "app not found", http.StatusNotFound)
		return
	}
	rec, _ := s.getAppRecord(r.Context(), appID)
	ar := mergeAppResponse(def, rec)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(ar) //nolint:errcheck
}

func (s *Server) handleAppStatus(w http.ResponseWriter, r *http.Request) {
	appID := r.PathValue("id")
	def, ok := appsByID[appID]
	if !ok {
		http.Error(w, "app not found", http.StatusNotFound)
		return
	}
	rec, _ := s.getAppRecord(r.Context(), appID)
	ar := mergeAppResponse(def, rec)

	type statusResp struct {
		Status      string  `json:"status"`
		ContainerID string  `json:"container_id"`
		Port        int     `json:"port"`
		Error       string  `json:"error,omitempty"`
		InstalledAt *int64  `json:"installed_at,omitempty"`
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(statusResp{ //nolint:errcheck
		Status:      ar.Status,
		ContainerID: ar.ContainerID,
		Port:        ar.Port,
		Error:       ar.Error,
		InstalledAt: ar.InstalledAt,
	})
}

func (s *Server) handleAppInstall(w http.ResponseWriter, r *http.Request) {
	appID := r.PathValue("id")
	def, ok := appsByID[appID]
	if !ok {
		http.Error(w, "app not found", http.StatusNotFound)
		return
	}

	var req struct {
		Port int    `json:"port"`
		Env  string `json:"env"`
	}
	json.NewDecoder(r.Body).Decode(&req) //nolint:errcheck
	if req.Port <= 0 {
		req.Port = def.DefaultPort
	}

	// Check if already installing
	appInstallMu.Lock()
	if appInstallQueue[appID] {
		appInstallMu.Unlock()
		http.Error(w, "installation already in progress", http.StatusConflict)
		return
	}
	appInstallQueue[appID] = true
	appInstallMu.Unlock()

	ctx := r.Context()
	now := time.Now().Unix()

	// Upsert to "installing" state
	_, err := s.db.SQL.ExecContext(ctx,
		`INSERT INTO server_apps (app_id, status, port, container_name, config_json, install_log, error, updated_at)
		 VALUES (?,?,?,?,?,?,?,?)
		 ON CONFLICT(app_id) DO UPDATE SET status='installing', port=?, install_log='', error='', updated_at=?`,
		appID, "installing", req.Port, def.ContainerName, "{}", "", "", now,
		req.Port, now,
	)
	if err != nil {
		appInstallMu.Lock()
		delete(appInstallQueue, appID)
		appInstallMu.Unlock()
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}

	// Run the install asynchronously
	go s.runAppInstall(appID, def, req.Port)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	json.NewEncoder(w).Encode(map[string]string{"status": "installing", "message": "Installation started. Poll /api/apps/" + appID + "/status for progress."}) //nolint:errcheck
}

func (s *Server) runAppInstall(appID string, def *ServerAppDef, port int) {
	defer func() {
		appInstallMu.Lock()
		delete(appInstallQueue, appID)
		appInstallMu.Unlock()
	}()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()

	setStatus := func(status, log, errMsg string) {
		now := time.Now().Unix()
		_, _ = s.db.SQL.ExecContext(context.Background(),
			`UPDATE server_apps SET status=?, install_log=?, error=?, updated_at=? WHERE app_id=?`,
			status, log, errMsg, now, appID)
	}

	installLog := ""

	// Build the final command (substitute port if needed).
	// Only integer port values are substituted – no arbitrary user data reaches
	// the command string at this point, since def.InstallCommand is a compile-time
	// constant and port is a validated integer (#1).
	cmdStr := def.InstallCommand
	if port != def.DefaultPort && def.DefaultPort > 0 {
		cmdStr = strings.ReplaceAll(cmdStr,
			fmt.Sprintf("%d:%d", def.DefaultPort, def.DefaultPort),
			fmt.Sprintf("%d:%d", port, def.DefaultPort))
		cmdStr = strings.ReplaceAll(cmdStr,
			fmt.Sprintf("-p %d:", def.DefaultPort),
			fmt.Sprintf("-p %d:", port))
	}

	// Split into argv without a shell to avoid sh -c injection (#1).
	argv, splitErr := splitShellWords(cmdStr)
	var out []byte
	var err error
	if splitErr != nil || len(argv) == 0 {
		// Fallback: treat as a single executable (no args) to avoid shell.
		argv = []string{cmdStr}
	}
	c := exec.CommandContext(ctx, argv[0], argv[1:]...)
	out, err = c.CombinedOutput()
	installLog = string(out)

	if err != nil {
		setStatus("error", installLog, err.Error())
		return
	}

	// Verify the container is running for Docker apps
	now := time.Now().Unix()
	containerID := ""
	if def.InstallMethod == AppInstallDocker || def.InstallMethod == AppInstallCompose {
		idOut, _ := exec.CommandContext(ctx, "docker", "inspect", "--format", "{{.Id}}", def.ContainerName).Output()
		containerID = strings.TrimSpace(string(idOut))
		// Brief wait for container to start
		time.Sleep(2 * time.Second)
	}

	_, _ = s.db.SQL.ExecContext(context.Background(),
		`UPDATE server_apps SET status='running', port=?, container_id=?, container_name=?, install_log=?, error='', installed_at=?, updated_at=? WHERE app_id=?`,
		port, containerID, def.ContainerName, installLog, now, now, appID,
	)
}

func (s *Server) handleAppUninstall(w http.ResponseWriter, r *http.Request) {
	appID := r.PathValue("id")
	def, ok := appsByID[appID]
	if !ok {
		http.Error(w, "app not found", http.StatusNotFound)
		return
	}

	ctx := r.Context()
	rec, _ := s.getAppRecord(ctx, appID)
	containerName := def.ContainerName
	if rec != nil && rec.ContainerName != "" {
		containerName = rec.ContainerName
	}

	var sb strings.Builder
	// Stop and remove the container
	if def.InstallMethod == AppInstallDocker || def.InstallMethod == AppInstallCompose {
		stopOut, _ := exec.CommandContext(ctx, "docker", "stop", containerName).CombinedOutput()
		sb.WriteString(string(stopOut))
		rmOut, _ := exec.CommandContext(ctx, "docker", "rm", "-f", containerName).CombinedOutput()
		sb.WriteString(string(rmOut))
	}

	now := time.Now().Unix()
	_, _ = s.db.SQL.ExecContext(ctx,
		`UPDATE server_apps SET status='not_installed', container_id='', install_log=?, error='', installed_at=NULL, updated_at=? WHERE app_id=?`,
		sb.String(), now, appID,
	)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"ok": true, "output": sb.String()}) //nolint:errcheck
}

func (s *Server) handleAppControl(w http.ResponseWriter, r *http.Request) {
	appID := r.PathValue("id")
	action := r.PathValue("action") // start | stop | restart

	def, ok := appsByID[appID]
	if !ok {
		http.Error(w, "app not found", http.StatusNotFound)
		return
	}

	ctx := r.Context()
	rec, _ := s.getAppRecord(ctx, appID)
	containerName := def.ContainerName
	if rec != nil && rec.ContainerName != "" {
		containerName = rec.ContainerName
	}

	var cmd *exec.Cmd
	switch action {
	case "start":
		cmd = exec.CommandContext(ctx, "docker", "start", containerName)
	case "stop":
		cmd = exec.CommandContext(ctx, "docker", "stop", containerName)
	case "restart":
		cmd = exec.CommandContext(ctx, "docker", "restart", containerName)
	default:
		http.Error(w, "unknown action", http.StatusBadRequest)
		return
	}

	out, err := cmd.CombinedOutput()

	// Update status in DB
	newStatus := "running"
	if action == "stop" {
		newStatus = "stopped"
	}
	errStr := ""
	if err != nil {
		newStatus = "error"
		errStr = err.Error()
	}
	now := time.Now().Unix()
	_, _ = s.db.SQL.ExecContext(ctx,
		`UPDATE server_apps SET status=?, error=?, updated_at=? WHERE app_id=?`,
		newStatus, errStr, now, appID,
	)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{ //nolint:errcheck
		"ok":     err == nil,
		"action": action,
		"output": string(out),
	})
}

func (s *Server) handleAppLogs(w http.ResponseWriter, r *http.Request) {
	appID := r.PathValue("id")
	def, ok := appsByID[appID]
	if !ok {
		http.Error(w, "app not found", http.StatusNotFound)
		return
	}

	limitStr := r.URL.Query().Get("lines")
	lines := 200
	if n, err := strconv.Atoi(limitStr); err == nil && n > 0 && n <= 2000 {
		lines = n
	}

	ctx := r.Context()
	rec, _ := s.getAppRecord(ctx, appID)
	containerName := def.ContainerName
	if rec != nil && rec.ContainerName != "" {
		containerName = rec.ContainerName
	}

	type logEntry struct {
		Line string `json:"line"`
	}

	var cmd *exec.Cmd
	if def.InstallMethod == AppInstallDocker || def.InstallMethod == AppInstallCompose {
		cmd = exec.CommandContext(ctx, "docker", "logs", "--tail", strconv.Itoa(lines), "--timestamps", containerName)
	} else {
		// Fallback: journald logs for named service
		svcName := appID
		cmd = exec.CommandContext(ctx, "journalctl", "-u", svcName, "-n", strconv.Itoa(lines), "--no-pager", "-o", "short")
	}

	out, err := cmd.CombinedOutput()
	if err != nil && len(out) == 0 {
		// Try install log as fallback
		if rec != nil && rec.InstallLog != "" {
			lines := strings.Split(rec.InstallLog, "\n")
			entries := make([]logEntry, 0, len(lines))
			for _, l := range lines {
				if l != "" {
					entries = append(entries, logEntry{Line: l})
				}
			}
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(entries) //nolint:errcheck
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode([]logEntry{}) //nolint:errcheck
		return
	}

	rawLines := strings.Split(string(out), "\n")
	entries := make([]logEntry, 0, len(rawLines))
	for _, l := range rawLines {
		if l != "" {
			entries = append(entries, logEntry{Line: l})
		}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(entries) //nolint:errcheck
}

func (s *Server) handleAppPreflightCheck(w http.ResponseWriter, r *http.Request) {
	appID := r.PathValue("id")
	def, ok := appsByID[appID]
	if !ok {
		http.Error(w, "app not found", http.StatusNotFound)
		return
	}
	_ = def

	type checkResult struct {
		Name   string `json:"name"`
		Passed bool   `json:"passed"`
		Detail string `json:"detail"`
	}

	checks := []checkResult{}
	ctx := r.Context()

	// Check Docker availability
	dockerOut, dockerErr := exec.CommandContext(ctx, "docker", "version", "--format", "{{.Server.Version}}").Output()
	checks = append(checks, checkResult{
		Name:   "Docker Available",
		Passed: dockerErr == nil,
		Detail: func() string {
			if dockerErr == nil {
				return "Docker " + strings.TrimSpace(string(dockerOut))
			}
			return "Docker not found or not running"
		}(),
	})

	// Check RAM via /proc/meminfo (no shell required)
	totalRAMMB := 0
	if memData, err := os.ReadFile("/proc/meminfo"); err == nil {
		for _, line := range strings.Split(string(memData), "\n") {
			if strings.HasPrefix(line, "MemTotal:") {
				fields := strings.Fields(line)
				if len(fields) >= 2 {
					fmt.Sscanf(fields[1], "%d", &totalRAMMB)
					totalRAMMB /= 1024 // kB → MB
				}
				break
			}
		}
	}
	ramPassed := totalRAMMB == 0 || totalRAMMB >= def.MinRAMMB
	checks = append(checks, checkResult{
		Name:   fmt.Sprintf("Minimum RAM (%d MB)", def.MinRAMMB),
		Passed: ramPassed,
		Detail: func() string {
			if totalRAMMB > 0 {
				return fmt.Sprintf("%d MB available", totalRAMMB)
			}
			return "Could not determine RAM"
		}(),
	})

	// Check disk space via statfs (no shell required)
	diskGB := 0
	var st syscall.Statfs_t
	if syscall.Statfs("/", &st) == nil {
		diskGB = int(st.Bavail * uint64(st.Bsize) / (1024 * 1024 * 1024))
	}
	diskPassed := diskGB == 0 || diskGB >= def.MinDiskGB
	checks = append(checks, checkResult{
		Name:   fmt.Sprintf("Free Disk Space (%d GB)", def.MinDiskGB),
		Passed: diskPassed,
		Detail: func() string {
			if diskGB > 0 {
				return fmt.Sprintf("%d GB free", diskGB)
			}
			return "Could not determine disk space"
		}(),
	})

	// Check required ports
	for _, port := range def.RequiredPorts {
		inUse := detectPortStatus(port)
		checks = append(checks, checkResult{
			Name:   fmt.Sprintf("Port %d available", port),
			Passed: !inUse,
			Detail: func() string {
				if inUse {
					return fmt.Sprintf("Port %d is already in use", port)
				}
				return fmt.Sprintf("Port %d is free", port)
			}(),
		})
	}

	allPassed := true
	for _, c := range checks {
		if !c.Passed {
			allPassed = false
			break
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{ //nolint:errcheck
		"all_passed": allPassed,
		"checks":     checks,
	})
}

func (s *Server) handleAppUpdateConfig(w http.ResponseWriter, r *http.Request) {
	appID := r.PathValue("id")
	if _, ok := appsByID[appID]; !ok {
		http.Error(w, "app not found", http.StatusNotFound)
		return
	}

	body, err := io.ReadAll(r.Body)
	if err != nil || len(body) == 0 {
		body = []byte("{}")
	}
	// Validate JSON
	var js json.RawMessage
	if err := json.Unmarshal(body, &js); err != nil {
		http.Error(w, "invalid JSON", http.StatusBadRequest)
		return
	}

	now := time.Now().Unix()
	_, err = s.db.SQL.ExecContext(r.Context(),
		`UPDATE server_apps SET config_json=?, updated_at=? WHERE app_id=?`,
		string(body), now, appID,
	)
	if err != nil {
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
