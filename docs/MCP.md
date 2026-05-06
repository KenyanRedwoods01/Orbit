# MCP Integration

Orbit exposes an [MCP (Model Context Protocol)](https://modelcontextprotocol.io) server that lets AI agents — including Claude Desktop and claude.ai — query your server, tail logs, and trigger deployments.

## Scopes

| Scope | Allowed tools |
|---|---|
| `read-only` | `get_metrics`, `list_services`, `tail_log`, `get_alerts`, `list_containers` |
| `deploy` | Everything in `read-only` + `trigger_deploy`, `get_deploy_log` |
| `admin` | Everything in `deploy` + `restart_service`, `add_firewall_rule`, `delete_firewall_rule` |

## Enabling MCP

```bash
# Enable the Unix socket (local agents only)
orbit mcp enable --scope read-only

# Enable TCP for remote agents (e.g. claude.ai cloud)
orbit mcp enable --scope read-only --tcp 127.0.0.1:3901
```

Each `enable` call issues a new bearer token. Tokens are stored in SQLite and can be revoked from the UI or CLI.

## Connecting Claude Desktop

1. Enable the Unix socket: `orbit mcp enable --scope read-only`
2. Add to `~/.config/claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "orbit": {
      "command": "orbit",
      "args": ["mcp", "proxy"],
      "env": {}
    }
  }
}
```

3. Restart Claude Desktop. The Orbit tools appear in the tool picker.

## Audit log

Every agent action is logged to the `mcp_audit` table in SQLite and visible in the **MCP** section of the Orbit UI.

## Tools reference

### `get_metrics`
Returns a snapshot of current system metrics.

```json
{
  "cpu": { "total_pct": 12.4, "per_core_pct": [8.1, 16.7] },
  "memory": { "used_pct": 62.3 },
  "disk": [{ "mount": "/", "used_pct": 41.0 }]
}
```

### `list_services`
Returns all systemd units with status.

### `tail_log`
Parameters: `source` (file path or unit name), `lines` (default 100).

### `trigger_deploy`
Parameters: `hook` (deploy hook name). Requires `deploy` scope.

### `get_alerts`
Returns currently firing alerts and recent history.
