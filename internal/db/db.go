// Package db initialises and exposes the two data stores used by Orbit:
//   - SQLite  — relational store for users, tokens, alert rules, deploy log, cron, backups
//   - BoltDB  — append-only ring buffer for the last-24h metric time-series
package db

import (
        "database/sql"
        "fmt"
        "log"
        "os"
        "path/filepath"
        "strings"

        bolt "go.etcd.io/bbolt"
        _ "github.com/mattn/go-sqlite3"
)

// DB holds both data store handles.
type DB struct {
        SQL    *sql.DB
        Metric *bolt.DB
}

// MetricsBucket is the BoltDB bucket name for time-series metric snapshots.
const MetricsBucket = "metrics"

// Open opens (or creates) the SQLite and BoltDB files inside dataDir.
func Open(dataDir string) (*DB, error) {
        if err := os.MkdirAll(dataDir, 0o750); err != nil {
                return nil, fmt.Errorf("create data dir: %w", err)
        }

        sqlDB, err := sql.Open("sqlite3", filepath.Join(dataDir, "orbit.db")+"?_journal_mode=WAL&_foreign_keys=on")
        if err != nil {
                return nil, fmt.Errorf("open sqlite: %w", err)
        }
        if err := migrate(sqlDB); err != nil {
                return nil, fmt.Errorf("migrate: %w", err)
        }

        boltDB, err := bolt.Open(filepath.Join(dataDir, "metrics.db"), 0o600, nil)
        if err != nil {
                return nil, fmt.Errorf("open boltdb: %w", err)
        }

        if err := boltDB.Update(func(tx *bolt.Tx) error {
                if _, err := tx.CreateBucketIfNotExists([]byte(MetricsBucket)); err != nil {
                        return err
                }
                return nil
        }); err != nil {
                return nil, fmt.Errorf("init bolt buckets: %w", err)
        }

        return &DB{SQL: sqlDB, Metric: boltDB}, nil
}

// Close closes both data stores.
func (d *DB) Close() error {
        if err := d.SQL.Close(); err != nil {
                return err
        }
        return d.Metric.Close()
}

// migrate runs the embedded schema and any ALTER TABLE migrations (idempotent).
func migrate(db *sql.DB) error {
        if _, err := db.Exec(schema); err != nil {
                return err
        }
        // Run column additions — SQLite does not support IF NOT EXISTS on ALTER TABLE,
        // so we ignore errors here (column already exists = harmless).
        alterations := []string{
                `ALTER TABLE plugins ADD COLUMN install_status TEXT NOT NULL DEFAULT 'installed'`,
                `ALTER TABLE plugins ADD COLUMN port_config TEXT NOT NULL DEFAULT '{}'`,
                `ALTER TABLE plugins ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0`,
        `ALTER TABLE users ADD COLUMN email TEXT`,
                `ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'admin'`,
                `ALTER TABLE alert_rules ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0`,
                `ALTER TABLE uptime_events ADD COLUMN http_code INTEGER`,
                `ALTER TABLE uptime_monitors ADD COLUMN ssl_expires_at INTEGER`,
                `ALTER TABLE database_connections ADD COLUMN active_connections INTEGER NOT NULL DEFAULT 0`,
                `ALTER TABLE database_connections ADD COLUMN uptime_seconds INTEGER NOT NULL DEFAULT 0`,
                `ALTER TABLE users ADD COLUMN display_name TEXT NOT NULL DEFAULT ''`,
                `ALTER TABLE users ADD COLUMN bio TEXT NOT NULL DEFAULT ''`,
                `ALTER TABLE users ADD COLUMN avatar_color TEXT NOT NULL DEFAULT '#3b82f6'`,
        }
        for _, stmt := range alterations {
                if _, err := db.Exec(stmt); err != nil {
                        // SQLite does not support IF NOT EXISTS on ALTER TABLE ADD COLUMN;
                        // "duplicate column" errors are expected on restarts.
                        if !strings.Contains(err.Error(), "duplicate column") {
                                log.Printf("[db] migration warning: %v (stmt: %s)", err, stmt)
                        }
                }
        }
        return nil
}

const schema = `
CREATE TABLE IF NOT EXISTS users (
        id          INTEGER PRIMARY KEY,
        username    TEXT NOT NULL UNIQUE,
        email       TEXT,
        pw_hash     TEXT,
        totp_secret TEXT,
        role        TEXT NOT NULL DEFAULT 'admin',
        created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS sessions (
        id         INTEGER PRIMARY KEY,
        user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL UNIQUE,
        scope      TEXT NOT NULL DEFAULT 'ui',
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS mcp_tokens (
        id         INTEGER PRIMARY KEY,
        label      TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        scope      TEXT NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        last_used  INTEGER
);

CREATE TABLE IF NOT EXISTS mcp_audit (
        id         INTEGER PRIMARY KEY,
        token_id   INTEGER REFERENCES mcp_tokens(id),
        tool       TEXT NOT NULL,
        args_json  TEXT,
        result     TEXT,
        ts         INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS deploy_hooks (
        id          INTEGER PRIMARY KEY,
        name        TEXT NOT NULL,
        project     TEXT NOT NULL,
        secret_hash TEXT NOT NULL,
        script_path TEXT NOT NULL,
        strategy    TEXT NOT NULL DEFAULT 'exec',
        created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS deploy_log (
        id         INTEGER PRIMARY KEY,
        hook_id    INTEGER NOT NULL REFERENCES deploy_hooks(id) ON DELETE CASCADE,
        status     TEXT NOT NULL,
        output     TEXT,
        started_at INTEGER NOT NULL DEFAULT (unixepoch()),
        ended_at   INTEGER
);

CREATE TABLE IF NOT EXISTS uptime_monitors (
        id         INTEGER PRIMARY KEY,
        name       TEXT NOT NULL,
        kind       TEXT NOT NULL,
        target     TEXT NOT NULL,
        interval_s INTEGER NOT NULL DEFAULT 60,
        enabled    INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS uptime_events (
        id         INTEGER PRIMARY KEY,
        monitor_id INTEGER NOT NULL REFERENCES uptime_monitors(id) ON DELETE CASCADE,
        status     TEXT NOT NULL,
        latency_ms INTEGER,
        http_code  INTEGER,
        ts         INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS uptime_incidents (
        id                   INTEGER PRIMARY KEY,
        monitor_id           INTEGER NOT NULL REFERENCES uptime_monitors(id) ON DELETE CASCADE,
        ref                  TEXT NOT NULL UNIQUE,
        cause                TEXT NOT NULL DEFAULT '',
        category             TEXT NOT NULL DEFAULT 'network',
        severity             TEXT NOT NULL DEFAULT 'major',
        started_at           INTEGER NOT NULL DEFAULT (unixepoch()),
        resolved_at          INTEGER,
        duration_min         INTEGER,
        failed_checks        INTEGER NOT NULL DEFAULT 0,
        mttd_sec             INTEGER NOT NULL DEFAULT 0,
        mttr_min             INTEGER,
        error_code           TEXT NOT NULL DEFAULT '',
        error_detail         TEXT NOT NULL DEFAULT '',
        root_cause           TEXT NOT NULL DEFAULT '',
        log_excerpt          TEXT NOT NULL DEFAULT '',
        resolution           TEXT NOT NULL DEFAULT '',
        prevention_json      TEXT NOT NULL DEFAULT '[]',
        impact_summary       TEXT NOT NULL DEFAULT '',
        latency_baseline     INTEGER NOT NULL DEFAULT 0,
        latency_peak         INTEGER NOT NULL DEFAULT 0,
        responder_name       TEXT NOT NULL DEFAULT 'orbit-monitor',
        affected_regions_json TEXT NOT NULL DEFAULT '["local"]',
        created_at           INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS alert_rules (
        id          INTEGER PRIMARY KEY,
        name        TEXT NOT NULL,
        metric      TEXT NOT NULL,
        operator    TEXT NOT NULL,
        threshold   REAL NOT NULL,
        channel     TEXT NOT NULL,
        channel_cfg TEXT,
        enabled     INTEGER NOT NULL DEFAULT 1,
        created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS alert_events (
        id         INTEGER PRIMARY KEY,
        rule_id    INTEGER NOT NULL,
        rule_name  TEXT NOT NULL,
        metric     TEXT NOT NULL DEFAULT '',
        value      REAL NOT NULL DEFAULT 0,
        threshold  REAL NOT NULL DEFAULT 0,
        ts         INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS cron_jobs (
        id          INTEGER PRIMARY KEY,
        name        TEXT NOT NULL,
        schedule    TEXT NOT NULL,
        command     TEXT NOT NULL,
        description TEXT,
        enabled     INTEGER NOT NULL DEFAULT 1,
        created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
        last_run_at INTEGER,
        next_run_at INTEGER
);

CREATE TABLE IF NOT EXISTS cron_history (
        id         INTEGER PRIMARY KEY,
        job_id     INTEGER NOT NULL REFERENCES cron_jobs(id) ON DELETE CASCADE,
        status     TEXT NOT NULL,
        output     TEXT,
        exit_code  INTEGER,
        started_at INTEGER NOT NULL DEFAULT (unixepoch()),
        ended_at   INTEGER
);

CREATE TABLE IF NOT EXISTS backup_configs (
        id          INTEGER PRIMARY KEY,
        name        TEXT NOT NULL,
        source_path TEXT NOT NULL,
        dest_path   TEXT NOT NULL,
        schedule    TEXT NOT NULL DEFAULT '@daily',
        retention   INTEGER NOT NULL DEFAULT 7,
        compress    INTEGER NOT NULL DEFAULT 1,
        enabled     INTEGER NOT NULL DEFAULT 1,
        created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
        last_run_at INTEGER
);

CREATE TABLE IF NOT EXISTS backup_runs (
        id         INTEGER PRIMARY KEY,
        config_id  INTEGER NOT NULL REFERENCES backup_configs(id) ON DELETE CASCADE,
        status     TEXT NOT NULL,
        size_bytes INTEGER,
        output     TEXT,
        started_at INTEGER NOT NULL DEFAULT (unixepoch()),
        ended_at   INTEGER
);

CREATE TABLE IF NOT EXISTS settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notification_channels (
        id         INTEGER PRIMARY KEY,
        name       TEXT NOT NULL,
        type       TEXT NOT NULL,
        config     TEXT NOT NULL DEFAULT '{}',
        enabled    INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS notification_events (
        id         INTEGER PRIMARY KEY,
        channel_id INTEGER REFERENCES notification_channels(id) ON DELETE SET NULL,
        severity   TEXT NOT NULL DEFAULT 'info',
        title      TEXT NOT NULL,
        message    TEXT,
        sent       INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS plugins (
        id           INTEGER PRIMARY KEY,
        plugin_id    TEXT NOT NULL UNIQUE,
        name         TEXT NOT NULL,
        description  TEXT,
        version      TEXT NOT NULL DEFAULT '1.0.0',
        author       TEXT,
        category     TEXT,
        enabled      INTEGER NOT NULL DEFAULT 0,
        config       TEXT NOT NULL DEFAULT '{}',
        installed_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS server_apps (
        id             INTEGER PRIMARY KEY,
        app_id         TEXT NOT NULL UNIQUE,
        status         TEXT NOT NULL DEFAULT 'not_installed',
        port           INTEGER NOT NULL DEFAULT 0,
        container_id   TEXT NOT NULL DEFAULT '',
        container_name TEXT NOT NULL DEFAULT '',
        config_json    TEXT NOT NULL DEFAULT '{}',
        install_log    TEXT NOT NULL DEFAULT '',
        error          TEXT NOT NULL DEFAULT '',
        installed_at   INTEGER,
        updated_at     INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS ssh_keys (
        id              INTEGER PRIMARY KEY,
        name            TEXT NOT NULL,
        type            TEXT NOT NULL DEFAULT 'ed25519',
        public_key      TEXT NOT NULL,
        private_key_enc TEXT NOT NULL,
        fingerprint     TEXT NOT NULL,
        comment         TEXT,
        created_at      INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS ssh_saved (
        id         INTEGER PRIMARY KEY,
        name       TEXT NOT NULL,
        host       TEXT NOT NULL,
        port       INTEGER NOT NULL DEFAULT 22,
        user       TEXT NOT NULL DEFAULT 'orbit',
        auth_type  TEXT NOT NULL DEFAULT 'key',
        key_id     INTEGER REFERENCES ssh_keys(id) ON DELETE SET NULL,
        jump_host  TEXT,
        tags       TEXT,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        last_used  INTEGER
);

CREATE TABLE IF NOT EXISTS ssh_sessions (
        id          INTEGER PRIMARY KEY,
        server      TEXT NOT NULL,
        user        TEXT NOT NULL,
        port        INTEGER NOT NULL DEFAULT 22,
        status      TEXT NOT NULL DEFAULT 'connecting',
        started_at  INTEGER NOT NULL DEFAULT (unixepoch()),
        ended_at    INTEGER,
        bytes_sent  INTEGER NOT NULL DEFAULT 0,
        bytes_recv  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS ssh_snippets (
        id          INTEGER PRIMARY KEY,
        name        TEXT NOT NULL,
        command     TEXT NOT NULL,
        description TEXT,
        category    TEXT,
        tags        TEXT,
        used_count  INTEGER NOT NULL DEFAULT 0,
        created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS ssh_port_forwards (
        id          INTEGER PRIMARY KEY,
        session_id  INTEGER REFERENCES ssh_sessions(id) ON DELETE CASCADE,
        type        TEXT NOT NULL DEFAULT 'local',
        local_port  INTEGER,
        remote_host TEXT,
        remote_port INTEGER,
        status      TEXT NOT NULL DEFAULT 'active',
        created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS ssh_recordings (
        id          INTEGER PRIMARY KEY,
        session_id  INTEGER REFERENCES ssh_sessions(id) ON DELETE CASCADE,
        server      TEXT NOT NULL,
        path        TEXT NOT NULL,
        duration_s  INTEGER NOT NULL DEFAULT 0,
        size_bytes  INTEGER NOT NULL DEFAULT 0,
        created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS pipelines (
        id          INTEGER PRIMARY KEY,
        name        TEXT NOT NULL,
        description TEXT,
        enabled     INTEGER NOT NULL DEFAULT 1,
        created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS pipeline_stages (
        id               INTEGER PRIMARY KEY,
        pipeline_id      INTEGER NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
        name             TEXT NOT NULL,
        command          TEXT NOT NULL,
        working_dir      TEXT,
        timeout_s        INTEGER NOT NULL DEFAULT 300,
        requires_approval INTEGER NOT NULL DEFAULT 0,
        continue_on_fail INTEGER NOT NULL DEFAULT 0,
        order_idx        INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS pipeline_runs (
        id           INTEGER PRIMARY KEY,
        pipeline_id  INTEGER NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
        status       TEXT NOT NULL DEFAULT 'pending',
        triggered_by TEXT,
        started_at   INTEGER NOT NULL DEFAULT (unixepoch()),
        ended_at     INTEGER
);

CREATE TABLE IF NOT EXISTS pipeline_stage_runs (
        id         INTEGER PRIMARY KEY,
        run_id     INTEGER NOT NULL REFERENCES pipeline_runs(id) ON DELETE CASCADE,
        stage_id   INTEGER NOT NULL REFERENCES pipeline_stages(id) ON DELETE CASCADE,
        status     TEXT NOT NULL DEFAULT 'pending',
        output     TEXT,
        exit_code  INTEGER,
        started_at INTEGER NOT NULL DEFAULT (unixepoch()),
        ended_at   INTEGER
);

CREATE TABLE IF NOT EXISTS pipeline_envs (
        id          INTEGER PRIMARY KEY,
        pipeline_id INTEGER NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
        key         TEXT NOT NULL,
        value       TEXT NOT NULL,
        secret      INTEGER NOT NULL DEFAULT 0,
        UNIQUE(pipeline_id, key)
);

CREATE TABLE IF NOT EXISTS agents (
        id            INTEGER PRIMARY KEY,
        name          TEXT NOT NULL,
        host          TEXT NOT NULL UNIQUE,
        token_hash    TEXT NOT NULL UNIQUE,
        version       TEXT,
        status        TEXT NOT NULL DEFAULT 'unknown',
        last_seen     INTEGER,
        registered_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS agent_metrics (
        id       INTEGER PRIMARY KEY,
        agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        snapshot TEXT NOT NULL,
        ts       INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS audit_log (
        id        INTEGER PRIMARY KEY,
        user      TEXT NOT NULL,
        method    TEXT NOT NULL,
        path      TEXT NOT NULL,
        status    INTEGER NOT NULL DEFAULT 0,
        ip        TEXT,
        body_hash TEXT,
        ts        INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS api_tokens (
        id         INTEGER PRIMARY KEY,
        name       TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        scopes     TEXT NOT NULL DEFAULT 'read:servers',
        ip_restrict TEXT,
        expires_at INTEGER,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        last_used  INTEGER
);

CREATE TABLE IF NOT EXISTS totp_backup_codes (
        id      INTEGER PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        code_hash TEXT NOT NULL,
        used    INTEGER NOT NULL DEFAULT 0,
        used_at INTEGER
);

CREATE TABLE IF NOT EXISTS certs (
        id          INTEGER PRIMARY KEY,
        domain      TEXT NOT NULL UNIQUE,
        issuer      TEXT NOT NULL DEFAULT 'letsencrypt',
        cert_path   TEXT,
        key_path    TEXT,
        expires_at  INTEGER,
        auto_renew  INTEGER NOT NULL DEFAULT 1,
        status      TEXT NOT NULL DEFAULT 'unknown',
        created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS ftp_users (
        id             INTEGER PRIMARY KEY,
        username       TEXT NOT NULL UNIQUE,
        pw_hash        TEXT NOT NULL,
        home_dir       TEXT NOT NULL,
        upload_limit   INTEGER NOT NULL DEFAULT 0,
        download_limit INTEGER NOT NULL DEFAULT 0,
        chroot         INTEGER NOT NULL DEFAULT 1,
        enabled        INTEGER NOT NULL DEFAULT 1,
        created_at     INTEGER NOT NULL DEFAULT (unixepoch()),
        last_login     INTEGER
);

CREATE TABLE IF NOT EXISTS ftp_quotas (
        id         INTEGER PRIMARY KEY,
        username   TEXT NOT NULL UNIQUE,
        soft_bytes INTEGER NOT NULL DEFAULT 0,
        hard_bytes INTEGER NOT NULL DEFAULT 0,
        grace_days INTEGER NOT NULL DEFAULT 7
);

CREATE TABLE IF NOT EXISTS managed_servers (
        id            INTEGER PRIMARY KEY,
        name          TEXT NOT NULL UNIQUE,
        host          TEXT NOT NULL,
        port          INTEGER NOT NULL DEFAULT 22,
        ssh_user      TEXT NOT NULL DEFAULT 'orbit',
        auth_method   TEXT NOT NULL DEFAULT 'key',
        key_file      TEXT NOT NULL DEFAULT '',
        jump_host     TEXT NOT NULL DEFAULT '',
        role          TEXT NOT NULL DEFAULT 'web',
        environment   TEXT NOT NULL DEFAULT 'production',
        region        TEXT NOT NULL DEFAULT 'us-east-1',
        tags_json     TEXT NOT NULL DEFAULT '[]',
        description   TEXT NOT NULL DEFAULT '',
        sort_order    INTEGER NOT NULL DEFAULT 0,
        status        TEXT NOT NULL DEFAULT 'unknown',
        latency_ms    INTEGER,
        last_ping_at  INTEGER,
        last_seen     INTEGER,
        metrics_json  TEXT,
        collect_cpu   INTEGER NOT NULL DEFAULT 1,
        collect_mem   INTEGER NOT NULL DEFAULT 1,
        collect_disk  INTEGER NOT NULL DEFAULT 1,
        collect_net   INTEGER NOT NULL DEFAULT 1,
        auto_backup   INTEGER NOT NULL DEFAULT 0,
        created_at    INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS server_groups (
        id         INTEGER PRIMARY KEY,
        name       TEXT NOT NULL UNIQUE,
        color      TEXT NOT NULL DEFAULT '#4a9eff',
        created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS server_group_members (
        group_id  INTEGER NOT NULL REFERENCES server_groups(id) ON DELETE CASCADE,
        server_id INTEGER NOT NULL REFERENCES managed_servers(id) ON DELETE CASCADE,
        PRIMARY KEY (group_id, server_id)
);

CREATE TABLE IF NOT EXISTS server_alerts (
        id        INTEGER PRIMARY KEY,
        server_id INTEGER NOT NULL REFERENCES managed_servers(id) ON DELETE CASCADE,
        severity  TEXT NOT NULL DEFAULT 'warning',
        message   TEXT NOT NULL,
        resolved  INTEGER NOT NULL DEFAULT 0,
        ts        INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS server_commands (
        id         INTEGER PRIMARY KEY,
        name       TEXT NOT NULL,
        command    TEXT NOT NULL,
        target_role TEXT NOT NULL DEFAULT 'all',
        sudo       INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS fw_rules (
        id           TEXT PRIMARY KEY,
        ord          INTEGER NOT NULL DEFAULT 0,
        direction    TEXT NOT NULL DEFAULT 'in',
        protocol     TEXT NOT NULL DEFAULT 'tcp',
        port         TEXT NOT NULL DEFAULT '',
        port_label   TEXT NOT NULL DEFAULT '',
        source_ip    TEXT NOT NULL DEFAULT 'anywhere',
        dest_ip      TEXT NOT NULL DEFAULT 'any',
        iface        TEXT NOT NULL DEFAULT 'any',
        action       TEXT NOT NULL DEFAULT 'allow',
        logging      TEXT NOT NULL DEFAULT 'off',
        comment      TEXT NOT NULL DEFAULT '',
        hits         INTEGER NOT NULL DEFAULT 0,
        service_color TEXT NOT NULL DEFAULT '',
        created_at   INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS fw_nat_rules (
        id          TEXT PRIMARY KEY,
        public_port INTEGER NOT NULL,
        proto       TEXT NOT NULL DEFAULT 'tcp',
        dest_ip     TEXT NOT NULL,
        dest_port   INTEGER NOT NULL,
        comment     TEXT NOT NULL DEFAULT '',
        enabled     INTEGER NOT NULL DEFAULT 1,
        created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS fw_app_profiles (
        id      TEXT PRIMARY KEY,
        name    TEXT NOT NULL,
        ports   TEXT NOT NULL,
        proto   TEXT NOT NULL DEFAULT 'tcp',
        service TEXT NOT NULL DEFAULT '',
        enabled INTEGER NOT NULL DEFAULT 0,
        color   TEXT NOT NULL DEFAULT '#4a9eff',
        created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS fw_jails (
        name         TEXT PRIMARY KEY,
        status       TEXT NOT NULL DEFAULT 'active',
        banned       INTEGER NOT NULL DEFAULT 0,
        failed       INTEGER NOT NULL DEFAULT 0,
        total_failed INTEGER NOT NULL DEFAULT 0,
        filter       TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS fw_banned_ips (
        ip       TEXT NOT NULL,
        jail     TEXT NOT NULL,
        since    TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        country  TEXT NOT NULL DEFAULT '',
        PRIMARY KEY (ip, jail)
);

CREATE TABLE IF NOT EXISTS fw_logs (
        id       TEXT PRIMARY KEY,
        ts       TEXT NOT NULL,
        type     TEXT NOT NULL DEFAULT 'BLOCK',
        iface    TEXT NOT NULL DEFAULT 'eth0',
        src_ip   TEXT NOT NULL DEFAULT '',
        dst_ip   TEXT NOT NULL DEFAULT '',
        src_port INTEGER NOT NULL DEFAULT 0,
        dst_port INTEGER NOT NULL DEFAULT 0,
        proto    TEXT NOT NULL DEFAULT 'TCP',
        rule_id  TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS fw_state (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS git_workflows (
        id               TEXT PRIMARY KEY,
        name             TEXT NOT NULL,
        description      TEXT NOT NULL DEFAULT '',
        repo_url         TEXT NOT NULL DEFAULT '',
        branch           TEXT NOT NULL DEFAULT 'main',
        provider         TEXT NOT NULL DEFAULT 'github',
        trigger_type     TEXT NOT NULL DEFAULT 'push',
        build_command    TEXT NOT NULL DEFAULT '',
        deploy_command   TEXT NOT NULL DEFAULT '',
        pre_commands     TEXT NOT NULL DEFAULT '[]',
        post_commands    TEXT NOT NULL DEFAULT '[]',
        env_vars         TEXT NOT NULL DEFAULT '{}',
        timeout_secs     INTEGER NOT NULL DEFAULT 600,
        retry_count      INTEGER NOT NULL DEFAULT 0,
        notify_on_success INTEGER NOT NULL DEFAULT 1,
        notify_on_failure INTEGER NOT NULL DEFAULT 1,
        enabled          INTEGER NOT NULL DEFAULT 1,
        webhook_secret   TEXT NOT NULL DEFAULT '',
        created_at       INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS git_runs (
        id             TEXT PRIMARY KEY,
        workflow_id    TEXT NOT NULL REFERENCES git_workflows(id) ON DELETE CASCADE,
        status         TEXT NOT NULL DEFAULT 'pending',
        trigger_type   TEXT NOT NULL DEFAULT 'manual',
        commit_sha     TEXT NOT NULL DEFAULT '',
        commit_message TEXT NOT NULL DEFAULT '',
        author         TEXT NOT NULL DEFAULT '',
        branch         TEXT NOT NULL DEFAULT '',
        started_at     INTEGER NOT NULL DEFAULT (unixepoch()),
        finished_at    INTEGER,
        error_msg      TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS git_run_logs (
        id      INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id  TEXT NOT NULL REFERENCES git_runs(id) ON DELETE CASCADE,
        ts      INTEGER NOT NULL DEFAULT (unixepoch()),
        level   TEXT NOT NULL DEFAULT 'info',
        message TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS git_settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS database_connections (
        id                  INTEGER PRIMARY KEY,
        name                TEXT NOT NULL,
        type                TEXT NOT NULL,
        host                TEXT NOT NULL DEFAULT '',
        port                INTEGER NOT NULL DEFAULT 0,
        username            TEXT NOT NULL DEFAULT '',
        password            TEXT NOT NULL DEFAULT '',
        database_name       TEXT NOT NULL DEFAULT '',
        ssl_mode            TEXT NOT NULL DEFAULT 'prefer',
        extra               TEXT NOT NULL DEFAULT '{}',
        status              TEXT NOT NULL DEFAULT 'offline',
        version             TEXT NOT NULL DEFAULT '',
        database_count      INTEGER NOT NULL DEFAULT 0,
        active_connections  INTEGER NOT NULL DEFAULT 0,
        size_bytes          INTEGER NOT NULL DEFAULT 0,
        uptime_seconds      INTEGER NOT NULL DEFAULT 0,
        created_at          INTEGER NOT NULL DEFAULT (unixepoch()),
        last_connected_at   INTEGER
);

CREATE TABLE IF NOT EXISTS db_query_history (
        id               INTEGER PRIMARY KEY,
        connection_id    INTEGER NOT NULL REFERENCES database_connections(id) ON DELETE CASCADE,
        database_name    TEXT NOT NULL DEFAULT '',
        query            TEXT NOT NULL,
        row_count        INTEGER NOT NULL DEFAULT 0,
        execution_time_ms REAL NOT NULL DEFAULT 0,
        success          INTEGER NOT NULL DEFAULT 1,
        error            TEXT NOT NULL DEFAULT '',
        executed_at      INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS ssh_collab_sessions (
        id          INTEGER PRIMARY KEY,
        name        TEXT NOT NULL,
        token       TEXT NOT NULL UNIQUE,
        created_by  TEXT NOT NULL DEFAULT '',
        created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS ssh_collab_participants (
        id          INTEGER PRIMARY KEY,
        session_id  INTEGER NOT NULL REFERENCES ssh_collab_sessions(id) ON DELETE CASCADE,
        username    TEXT NOT NULL,
        email       TEXT NOT NULL DEFAULT '',
        role        TEXT NOT NULL DEFAULT 'read-only',
        joined_at   INTEGER NOT NULL DEFAULT (unixepoch())
);
`
