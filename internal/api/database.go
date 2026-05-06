package api

import (
        "bytes"
        "context"
        "database/sql"
        "encoding/json"
        "fmt"
        "net/http"
        "os/exec"
        "strconv"
        "strings"
        "time"
)

// ── Types ─────────────────────────────────────────────────────────────────────

type DBConnection struct {
        ID              int64  `json:"id"`
        Name            string `json:"name"`
        Type            string `json:"type"` // postgresql|mysql|mariadb|redis|sqlite|mongodb
        Host            string `json:"host"`
        Port            int    `json:"port"`
        Username        string `json:"username"`
        Password        string `json:"password,omitempty"`
        DatabaseName    string `json:"database_name"`
        SSLMode         string `json:"ssl_mode"`
        Extra           string `json:"extra"` // JSON extra options
        Status          string `json:"status"`
        Version         string `json:"version"`
        DatabaseCount   int    `json:"database_count"`
        ActiveConns     int    `json:"active_connections"`
        SizeBytes       int64  `json:"size_bytes"`
        UptimeSeconds   int64  `json:"uptime_seconds"`
        CreatedAt       int64  `json:"created_at"`
        LastConnectedAt *int64 `json:"last_connected_at"`
}

type DBDatabase struct {
        Name       string `json:"name"`
        SizeBytes  int64  `json:"size_bytes"`
        SizeHuman  string `json:"size_human"`
        TableCount int    `json:"table_count"`
        Encoding   string `json:"encoding"`
        Collation  string `json:"collation"`
        Owner      string `json:"owner"`
}

type DBTable struct {
        Name       string    `json:"name"`
        Schema     string    `json:"schema"`
        Type       string    `json:"type"` // table|view|materialized_view
        RowCount   int64     `json:"row_count"`
        SizeBytes  int64     `json:"size_bytes"`
        SizeHuman  string    `json:"size_human"`
        Columns    []DBColumn `json:"columns,omitempty"`
        HasPK      bool      `json:"has_pk"`
}

type DBColumn struct {
        Name         string `json:"name"`
        DataType     string `json:"data_type"`
        Nullable     bool   `json:"nullable"`
        DefaultValue string `json:"default_value"`
        IsPrimary    bool   `json:"is_primary"`
        IsUnique     bool   `json:"is_unique"`
        MaxLength    *int   `json:"max_length,omitempty"`
        Comment      string `json:"comment"`
}

type QueryResult struct {
        Columns       []string                 `json:"columns"`
        Rows          []map[string]interface{} `json:"rows"`
        RowCount      int                      `json:"row_count"`
        AffectedRows  int64                    `json:"affected_rows"`
        ExecutionTime float64                  `json:"execution_time_ms"`
        Query         string                   `json:"query"`
        Error         string                   `json:"error,omitempty"`
        Type          string                   `json:"type"` // select|insert|update|delete|ddl
}

type QueryHistoryEntry struct {
        ID            int64   `json:"id"`
        ConnectionID  int64   `json:"connection_id"`
        ConnectionName string `json:"connection_name"`
        DatabaseName  string  `json:"database_name"`
        Query         string  `json:"query"`
        RowCount      int     `json:"row_count"`
        ExecutionTime float64 `json:"execution_time_ms"`
        Success       bool    `json:"success"`
        Error         string  `json:"error"`
        ExecutedAt    int64   `json:"executed_at"`
}

type DBStats struct {
        TotalConnections int   `json:"total_connections"`
        ActiveConnections int  `json:"active_connections"`
        TotalDatabases   int   `json:"total_databases"`
        TotalTables      int   `json:"total_tables"`
        TotalSizeBytes   int64 `json:"total_size_bytes"`
        QueriesExecuted  int   `json:"queries_executed"`
        QueriesSuccess   int   `json:"queries_success"`
        QueriesFailed    int   `json:"queries_failed"`
        SlowQueries      int   `json:"slow_queries"`
}

// ── CRUD: Connections ──────────────────────────────────────────────────────────

func (s *Server) handleDBConnectionList(w http.ResponseWriter, r *http.Request) {
        rows, err := s.db.SQL.QueryContext(r.Context(), `
                SELECT id, name, type, host, port, username, database_name, ssl_mode, extra,
                       status, version, database_count, active_connections, size_bytes, uptime_seconds,
                       created_at, last_connected_at
                FROM database_connections ORDER BY created_at DESC
        `)
        if err != nil {
                jsonError(w, "db error", http.StatusInternalServerError)
                return
        }
        defer rows.Close()

        var conns []DBConnection
        for rows.Next() {
                var c DBConnection
                var lastConn *int64
                rows.Scan( //nolint:errcheck
                        &c.ID, &c.Name, &c.Type, &c.Host, &c.Port, &c.Username,
                        &c.DatabaseName, &c.SSLMode, &c.Extra,
                        &c.Status, &c.Version, &c.DatabaseCount, &c.ActiveConns,
                        &c.SizeBytes, &c.UptimeSeconds, &c.CreatedAt, &lastConn,
                )
                c.LastConnectedAt = lastConn
                c.Password = "" // never return password
                conns = append(conns, c)
        }
        if conns == nil {
                conns = []DBConnection{}
        }
        jsonOK(w, conns)
}

func (s *Server) handleDBConnectionCreate(w http.ResponseWriter, r *http.Request) {
        var req struct {
                Name         string `json:"name"`
                Type         string `json:"type"`
                Host         string `json:"host"`
                Port         int    `json:"port"`
                Username     string `json:"username"`
                Password     string `json:"password"`
                DatabaseName string `json:"database_name"`
                SSLMode      string `json:"ssl_mode"`
                Extra        string `json:"extra"`
        }
        if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
                jsonError(w, "bad request", http.StatusBadRequest)
                return
        }
        if req.Name == "" || req.Type == "" {
                jsonError(w, "name and type are required", http.StatusBadRequest)
                return
        }
        if req.Port == 0 {
                req.Port = defaultPort(req.Type)
        }
        if req.SSLMode == "" {
                req.SSLMode = "prefer"
        }
        now := time.Now().Unix()
        res, err := s.db.SQL.ExecContext(r.Context(), `
                INSERT INTO database_connections (name, type, host, port, username, password, database_name, ssl_mode, extra, status, created_at)
                VALUES (?,?,?,?,?,?,?,?,?,'offline',?)
        `, req.Name, req.Type, req.Host, req.Port, req.Username, req.Password, req.DatabaseName, req.SSLMode, req.Extra, now)
        if err != nil {
                jsonError(w, "db error", http.StatusInternalServerError)
                return
        }
        id, _ := res.LastInsertId()
        w.WriteHeader(http.StatusCreated)
        jsonOK(w, map[string]int64{"id": id})
}

func (s *Server) handleDBConnectionUpdate(w http.ResponseWriter, r *http.Request) {
        idStr := r.PathValue("id")
        id, _ := strconv.ParseInt(idStr, 10, 64)

        var req struct {
                Name         string `json:"name"`
                Type         string `json:"type"`
                Host         string `json:"host"`
                Port         int    `json:"port"`
                Username     string `json:"username"`
                Password     string `json:"password"`
                DatabaseName string `json:"database_name"`
                SSLMode      string `json:"ssl_mode"`
                Extra        string `json:"extra"`
        }
        if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
                jsonError(w, "bad request", http.StatusBadRequest)
                return
        }

        // Only update password if provided
        if req.Password != "" {
                s.db.SQL.ExecContext(r.Context(), `UPDATE database_connections SET password=? WHERE id=?`, req.Password, id) //nolint:errcheck
        }

        _, err := s.db.SQL.ExecContext(r.Context(), `
                UPDATE database_connections SET name=?, type=?, host=?, port=?, username=?, database_name=?, ssl_mode=?, extra=?
                WHERE id=?
        `, req.Name, req.Type, req.Host, req.Port, req.Username, req.DatabaseName, req.SSLMode, req.Extra, id)
        if err != nil {
                jsonError(w, "db error", http.StatusInternalServerError)
                return
        }
        w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleDBConnectionDelete(w http.ResponseWriter, r *http.Request) {
        idStr := r.PathValue("id")
        id, _ := strconv.ParseInt(idStr, 10, 64)
        s.db.SQL.ExecContext(r.Context(), `DELETE FROM database_connections WHERE id=?`, id) //nolint:errcheck
        w.WriteHeader(http.StatusNoContent)
}

// ── Test connection ────────────────────────────────────────────────────────────

func (s *Server) handleDBConnectionTest(w http.ResponseWriter, r *http.Request) {
        idStr := r.PathValue("id")
        id, _ := strconv.ParseInt(idStr, 10, 64)

        var c DBConnection
        err := s.db.SQL.QueryRowContext(r.Context(), `
                SELECT id, name, type, host, port, username, password, database_name, ssl_mode
                FROM database_connections WHERE id=?
        `, id).Scan(&c.ID, &c.Name, &c.Type, &c.Host, &c.Port, &c.Username, &c.Password, &c.DatabaseName, &c.SSLMode)
        if err != nil {
                jsonError(w, "connection not found", http.StatusNotFound)
                return
        }

        start := time.Now()
        version, connErr := testDBConnection(r.Context(), c)
        elapsed := time.Since(start).Milliseconds()

        status := "online"
        errMsg := ""
        if connErr != nil {
                status = "offline"
                errMsg = connErr.Error()
        }

        // Update status in DB
        now := time.Now().Unix()
        if connErr == nil {
                s.db.SQL.ExecContext(r.Context(), //nolint:errcheck
                        `UPDATE database_connections SET status=?, version=?, last_connected_at=? WHERE id=?`,
                        status, version, now, id)
        } else {
                s.db.SQL.ExecContext(r.Context(), //nolint:errcheck
                        `UPDATE database_connections SET status=? WHERE id=?`, status, id)
        }

        jsonOK(w, map[string]interface{}{
                "ok":           connErr == nil,
                "status":       status,
                "version":      version,
                "error":        errMsg,
                "latency_ms":   elapsed,
        })
}

// ── List databases ─────────────────────────────────────────────────────────────

func (s *Server) handleDBListDatabases(w http.ResponseWriter, r *http.Request) {
        idStr := r.PathValue("id")
        id, _ := strconv.ParseInt(idStr, 10, 64)

        c := s.dbConnByID(r.Context(), id)
        if c == nil {
                jsonError(w, "connection not found", http.StatusNotFound)
                return
        }

        dbs, err := listDatabases(r.Context(), *c)
        if err != nil {
                jsonOK(w, map[string]interface{}{"error": err.Error(), "databases": []DBDatabase{}})
                return
        }
        jsonOK(w, map[string]interface{}{"databases": dbs})
}

// ── List tables ────────────────────────────────────────────────────────────────

func (s *Server) handleDBListTables(w http.ResponseWriter, r *http.Request) {
        idStr := r.PathValue("id")
        id, _ := strconv.ParseInt(idStr, 10, 64)
        dbName := r.PathValue("db")

        c := s.dbConnByID(r.Context(), id)
        if c == nil {
                jsonError(w, "connection not found", http.StatusNotFound)
                return
        }

        tables, err := listTables(r.Context(), *c, dbName)
        if err != nil {
                jsonOK(w, map[string]interface{}{"error": err.Error(), "tables": []DBTable{}})
                return
        }
        jsonOK(w, map[string]interface{}{"tables": tables})
}

// ── List columns ───────────────────────────────────────────────────────────────

func (s *Server) handleDBListColumns(w http.ResponseWriter, r *http.Request) {
        idStr := r.PathValue("id")
        id, _ := strconv.ParseInt(idStr, 10, 64)
        dbName := r.PathValue("db")
        tableName := r.PathValue("table")

        c := s.dbConnByID(r.Context(), id)
        if c == nil {
                jsonError(w, "connection not found", http.StatusNotFound)
                return
        }

        cols, err := listColumns(r.Context(), *c, dbName, tableName)
        if err != nil {
                jsonOK(w, map[string]interface{}{"error": err.Error(), "columns": []DBColumn{}})
                return
        }
        jsonOK(w, map[string]interface{}{"columns": cols})
}

// ── Get table data ─────────────────────────────────────────────────────────────

func (s *Server) handleDBTableData(w http.ResponseWriter, r *http.Request) {
        idStr := r.PathValue("id")
        id, _ := strconv.ParseInt(idStr, 10, 64)
        dbName := r.PathValue("db")
        tableName := r.PathValue("table")

        limit := 100
        if lStr := r.URL.Query().Get("limit"); lStr != "" {
                if l, err := strconv.Atoi(lStr); err == nil && l > 0 && l <= 1000 {
                        limit = l
                }
        }
        offset := 0
        if oStr := r.URL.Query().Get("offset"); oStr != "" {
                if o, err := strconv.Atoi(oStr); err == nil && o >= 0 {
                        offset = o
                }
        }

        c := s.dbConnByID(r.Context(), id)
        if c == nil {
                jsonError(w, "connection not found", http.StatusNotFound)
                return
        }

        var query string
        switch c.Type {
        case "postgresql":
                query = fmt.Sprintf(`SELECT * FROM %q LIMIT %d OFFSET %d`, tableName, limit, offset)
        case "mysql", "mariadb":
                query = fmt.Sprintf("SELECT * FROM `%s` LIMIT %d OFFSET %d", tableName, limit, offset)
        case "sqlite":
                query = fmt.Sprintf("SELECT * FROM \"%s\" LIMIT %d OFFSET %d", tableName, limit, offset)
        default:
                jsonError(w, "unsupported database type", http.StatusBadRequest)
                return
        }

        result := executeQuery(r.Context(), *c, dbName, query)
        jsonOK(w, result)
}

// ── Execute query ─────────────────────────────────────────────────────────────

func (s *Server) handleDBExecuteQuery(w http.ResponseWriter, r *http.Request) {
        var req struct {
                ConnectionID int64  `json:"connection_id"`
                Database     string `json:"database"`
                Query        string `json:"query"`
        }
        if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
                jsonError(w, "bad request", http.StatusBadRequest)
                return
        }

        c := s.dbConnByID(r.Context(), req.ConnectionID)
        if c == nil {
                jsonError(w, "connection not found", http.StatusNotFound)
                return
        }

        result := executeQuery(r.Context(), *c, req.Database, req.Query)

        // Store in history
        success := result.Error == ""
        s.db.SQL.ExecContext(r.Context(), `
                INSERT INTO db_query_history (connection_id, database_name, query, row_count, execution_time_ms, success, error, executed_at)
                VALUES (?,?,?,?,?,?,?,?)
        `, req.ConnectionID, req.Database, req.Query, result.RowCount, result.ExecutionTime, boolInt(success), result.Error, time.Now().Unix()) //nolint:errcheck

        jsonOK(w, result)
}

// ── Query history ─────────────────────────────────────────────────────────────

func (s *Server) handleDBQueryHistory(w http.ResponseWriter, r *http.Request) {
        connIDStr := r.URL.Query().Get("connection_id")
        limit := 200

        var rows *sql.Rows
        var err error

        if connIDStr != "" {
                connID, _ := strconv.ParseInt(connIDStr, 10, 64)
                rows, err = s.db.SQL.QueryContext(r.Context(), `
                        SELECT h.id, h.connection_id, c.name, h.database_name, h.query, h.row_count,
                               h.execution_time_ms, h.success, h.error, h.executed_at
                        FROM db_query_history h
                        LEFT JOIN database_connections c ON h.connection_id = c.id
                        WHERE h.connection_id=?
                        ORDER BY h.executed_at DESC LIMIT ?
                `, connID, limit)
        } else {
                rows, err = s.db.SQL.QueryContext(r.Context(), `
                        SELECT h.id, h.connection_id, COALESCE(c.name,'') as conn_name, h.database_name, h.query, h.row_count,
                               h.execution_time_ms, h.success, h.error, h.executed_at
                        FROM db_query_history h
                        LEFT JOIN database_connections c ON h.connection_id = c.id
                        ORDER BY h.executed_at DESC LIMIT ?
                `, limit)
        }
        if err != nil {
                jsonError(w, "db error", http.StatusInternalServerError)
                return
        }
        defer rows.Close()

        var entries []QueryHistoryEntry
        for rows.Next() {
                var e QueryHistoryEntry
                var successInt int
                rows.Scan(&e.ID, &e.ConnectionID, &e.ConnectionName, &e.DatabaseName, &e.Query, //nolint:errcheck
                        &e.RowCount, &e.ExecutionTime, &successInt, &e.Error, &e.ExecutedAt)
                e.Success = successInt == 1
                entries = append(entries, e)
        }
        if entries == nil {
                entries = []QueryHistoryEntry{}
        }
        jsonOK(w, entries)
}

func (s *Server) handleDBQueryHistoryDelete(w http.ResponseWriter, r *http.Request) {
        idStr := r.PathValue("id")
        if idStr == "all" {
                connIDStr := r.URL.Query().Get("connection_id")
                if connIDStr != "" {
                        connID, _ := strconv.ParseInt(connIDStr, 10, 64)
                        s.db.SQL.ExecContext(r.Context(), `DELETE FROM db_query_history WHERE connection_id=?`, connID) //nolint:errcheck
                } else {
                        s.db.SQL.ExecContext(r.Context(), `DELETE FROM db_query_history`) //nolint:errcheck
                }
        } else {
                id, _ := strconv.ParseInt(idStr, 10, 64)
                s.db.SQL.ExecContext(r.Context(), `DELETE FROM db_query_history WHERE id=?`, id) //nolint:errcheck
        }
        w.WriteHeader(http.StatusNoContent)
}

// ── Overall stats ─────────────────────────────────────────────────────────────

func (s *Server) handleDBStats(w http.ResponseWriter, r *http.Request) {
        var stats DBStats

        s.db.SQL.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM database_connections`).Scan(&stats.TotalConnections) //nolint:errcheck
        s.db.SQL.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM database_connections WHERE status='online'`).Scan(&stats.ActiveConnections) //nolint:errcheck
        s.db.SQL.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM db_query_history`).Scan(&stats.QueriesExecuted) //nolint:errcheck
        s.db.SQL.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM db_query_history WHERE success=1`).Scan(&stats.QueriesSuccess) //nolint:errcheck
        s.db.SQL.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM db_query_history WHERE success=0`).Scan(&stats.QueriesFailed) //nolint:errcheck
        s.db.SQL.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM db_query_history WHERE execution_time_ms > 1000`).Scan(&stats.SlowQueries) //nolint:errcheck
        s.db.SQL.QueryRowContext(r.Context(), `SELECT COALESCE(SUM(size_bytes),0) FROM database_connections`).Scan(&stats.TotalSizeBytes) //nolint:errcheck
        s.db.SQL.QueryRowContext(r.Context(), `SELECT COALESCE(SUM(database_count),0) FROM database_connections`).Scan(&stats.TotalDatabases) //nolint:errcheck

        jsonOK(w, stats)
}

// ── Refresh connection stats ───────────────────────────────────────────────────

func (s *Server) handleDBConnectionRefresh(w http.ResponseWriter, r *http.Request) {
        idStr := r.PathValue("id")
        id, _ := strconv.ParseInt(idStr, 10, 64)

        c := s.dbConnByID(r.Context(), id)
        if c == nil {
                jsonError(w, "connection not found", http.StatusNotFound)
                return
        }

        version, err := testDBConnection(r.Context(), *c)
        status := "online"
        if err != nil {
                status = "offline"
        }

        dbCount := 0
        if err == nil {
                dbs, dbErr := listDatabases(r.Context(), *c)
                if dbErr == nil {
                        dbCount = len(dbs)
                }
        }

        now := time.Now().Unix()
        s.db.SQL.ExecContext(r.Context(), //nolint:errcheck
                `UPDATE database_connections SET status=?, version=?, database_count=?, last_connected_at=? WHERE id=?`,
                status, version, dbCount, now, id)

        jsonOK(w, map[string]interface{}{
                "ok":      err == nil,
                "status":  status,
                "version": version,
                "db_count": dbCount,
        })
}

// ── Helper: get connection by ID ───────────────────────────────────────────────

func (s *Server) dbConnByID(ctx context.Context, id int64) *DBConnection {
        var c DBConnection
        err := s.db.SQL.QueryRowContext(ctx, `
                SELECT id, name, type, host, port, username, password, database_name, ssl_mode, extra, status, version
                FROM database_connections WHERE id=?
        `, id).Scan(&c.ID, &c.Name, &c.Type, &c.Host, &c.Port, &c.Username, &c.Password, &c.DatabaseName, &c.SSLMode, &c.Extra, &c.Status, &c.Version)
        if err != nil {
                return nil
        }
        return &c
}

// ── System-tool database operations ───────────────────────────────────────────

func testDBConnection(ctx context.Context, c DBConnection) (string, error) {
        ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
        defer cancel()

        switch c.Type {
        case "postgresql":
                env := pgEnv(c)
                cmd := exec.CommandContext(ctx, "psql", pgDSN(c), "-c", "SELECT version()", "-t", "-A")
                cmd.Env = append(cmd.Environ(), env...)
                out, err := cmd.Output()
                if err != nil {
                        return "", fmt.Errorf("psql: %s", stderr(err))
                }
                ver := strings.TrimSpace(string(out))
                if idx := strings.Index(ver, " ("); idx > 0 {
                        ver = ver[:idx]
                }
                return ver, nil

        case "mysql", "mariadb":
                args := mysqlArgs(c, []string{"-e", "SELECT VERSION()", "--skip-column-names", "--batch"})
                cmd := exec.CommandContext(ctx, "mysql", args...)
                out, err := cmd.Output()
                if err != nil {
                        return "", fmt.Errorf("mysql: %s", stderr(err))
                }
                return strings.TrimSpace(string(out)), nil

        case "redis":
                args := redisArgs(c, []string{"PING"})
                cmd := exec.CommandContext(ctx, "redis-cli", args...)
                out, err := cmd.Output()
                if err != nil {
                        return "", fmt.Errorf("redis-cli: %s", stderr(err))
                }
                if strings.TrimSpace(string(out)) != "PONG" {
                        return "", fmt.Errorf("unexpected response: %s", string(out))
                }
                // Get version
                verCmd := exec.CommandContext(ctx, "redis-cli", append(redisArgs(c, nil), "INFO", "server")...)
                verOut, _ := verCmd.Output()
                for _, line := range strings.Split(string(verOut), "\n") {
                        if strings.HasPrefix(line, "redis_version:") {
                                return "Redis " + strings.TrimSpace(strings.TrimPrefix(line, "redis_version:")), nil
                        }
                }
                return "Redis", nil

        case "sqlite":
                if c.Host == "" {
                        return "", fmt.Errorf("sqlite: database file path is required (host field)")
                }
                cmd := exec.CommandContext(ctx, "sqlite3", c.Host, "SELECT sqlite_version()")
                out, err := cmd.Output()
                if err != nil {
                        return "", fmt.Errorf("sqlite3: %s", stderr(err))
                }
                return "SQLite " + strings.TrimSpace(string(out)), nil

        case "mongodb":
                uri := mongoURI(c)
                cmd := exec.CommandContext(ctx, "mongosh", "--quiet", "--eval", "db.version()", uri)
                out, err := cmd.Output()
                if err != nil {
                        return "", fmt.Errorf("mongosh: %s", stderr(err))
                }
                return "MongoDB " + strings.TrimSpace(string(out)), nil

        default:
                return "", fmt.Errorf("unsupported database type: %s", c.Type)
        }
}

func listDatabases(ctx context.Context, c DBConnection) ([]DBDatabase, error) {
        ctx, cancel := context.WithTimeout(ctx, 15*time.Second)
        defer cancel()

        var dbs []DBDatabase

        switch c.Type {
        case "postgresql":
                query := `SELECT datname, pg_database_size(datname), pg_encoding_to_char(encoding) FROM pg_database WHERE datistemplate=false ORDER BY datname`
                cmd := exec.CommandContext(ctx, "psql", pgDSN(c), "-c", query, "-A", "-F", "\t", "--no-align", "-t")
                cmd.Env = append(cmd.Environ(), pgEnv(c)...)
                out, err := cmd.Output()
                if err != nil {
                        return nil, fmt.Errorf("psql: %s", stderr(err))
                }
                for _, line := range strings.Split(strings.TrimSpace(string(out)), "\n") {
                        parts := strings.Split(line, "\t")
                        if len(parts) < 2 || parts[0] == "" {
                                continue
                        }
                        var size int64
                        fmt.Sscanf(parts[1], "%d", &size)
                        enc := ""
                        if len(parts) > 2 {
                                enc = parts[2]
                        }
                        dbs = append(dbs, DBDatabase{
                                Name:      parts[0],
                                SizeBytes: size,
                                SizeHuman: formatBytesSize(size),
                                Encoding:  enc,
                        })
                }

        case "mysql", "mariadb":
                query := `SELECT schema_name, COALESCE(SUM(data_length+index_length),0) FROM information_schema.SCHEMATA LEFT JOIN information_schema.TABLES ON table_schema=schema_name WHERE schema_name NOT IN ('information_schema','performance_schema','sys') GROUP BY schema_name ORDER BY schema_name`
                args := mysqlArgs(c, []string{"-e", query, "--skip-column-names", "--batch", "information_schema"})
                cmd := exec.CommandContext(ctx, "mysql", args...)
                out, err := cmd.Output()
                if err != nil {
                        return nil, fmt.Errorf("mysql: %s", stderr(err))
                }
                for _, line := range strings.Split(strings.TrimSpace(string(out)), "\n") {
                        parts := strings.Split(line, "\t")
                        if len(parts) < 1 || parts[0] == "" {
                                continue
                        }
                        var size int64
                        if len(parts) > 1 {
                                fmt.Sscanf(parts[1], "%d", &size)
                        }
                        dbs = append(dbs, DBDatabase{
                                Name:      parts[0],
                                SizeBytes: size,
                                SizeHuman: formatBytesSize(size),
                        })
                }

        case "redis":
                // Redis doesn't have databases in the traditional sense - list numbered DBs
                args := redisArgs(c, []string{"INFO", "keyspace"})
                cmd := exec.CommandContext(ctx, "redis-cli", args...)
                out, _ := cmd.Output()
                for _, line := range strings.Split(string(out), "\n") {
                        if strings.HasPrefix(line, "db") {
                                parts := strings.SplitN(line, ":", 2)
                                if len(parts) == 2 {
                                        var keys int64
                                        fmt.Sscanf(strings.TrimPrefix(strings.Split(parts[1], ",")[0], "keys="), "%d", &keys)
                                        dbs = append(dbs, DBDatabase{Name: strings.TrimSpace(parts[0]), TableCount: int(keys)})
                                }
                        }
                }
                if len(dbs) == 0 {
                        dbs = append(dbs, DBDatabase{Name: "db0", TableCount: 0})
                }

        case "sqlite":
                dbs = append(dbs, DBDatabase{Name: c.Host, SizeHuman: "local file"})

        case "mongodb":
                uri := mongoURI(c)
                cmd := exec.CommandContext(ctx, "mongosh", "--quiet", "--eval",
                        `db.adminCommand({listDatabases:1}).databases.forEach(d=>print(d.name+"\t"+d.sizeOnDisk))`, uri)
                out, err := cmd.Output()
                if err != nil {
                        return nil, fmt.Errorf("mongosh: %s", stderr(err))
                }
                for _, line := range strings.Split(strings.TrimSpace(string(out)), "\n") {
                        parts := strings.Split(line, "\t")
                        if len(parts) < 1 || parts[0] == "" {
                                continue
                        }
                        var size int64
                        if len(parts) > 1 {
                                fmt.Sscanf(parts[1], "%d", &size)
                        }
                        dbs = append(dbs, DBDatabase{Name: parts[0], SizeBytes: size, SizeHuman: formatBytesSize(size)})
                }
        }

        if dbs == nil {
                dbs = []DBDatabase{}
        }
        return dbs, nil
}

func listTables(ctx context.Context, c DBConnection, dbName string) ([]DBTable, error) {
        ctx, cancel := context.WithTimeout(ctx, 15*time.Second)
        defer cancel()

        var tables []DBTable

        switch c.Type {
        case "postgresql":
                query := `SELECT table_name, table_schema, table_type, COALESCE(s.n_live_tup,0), COALESCE(pg_total_relation_size(quote_ident(t.table_schema)||'.'||quote_ident(t.table_name)),0) FROM information_schema.tables t LEFT JOIN pg_stat_user_tables s ON t.table_name=s.relname AND t.table_schema=s.schemaname WHERE t.table_catalog='` + dbName + `' AND t.table_schema NOT IN ('pg_catalog','information_schema') ORDER BY t.table_schema, t.table_name`
                dsn := pgDSNwithDB(c, dbName)
                cmd := exec.CommandContext(ctx, "psql", dsn, "-c", query, "-A", "-F", "\t", "--no-align", "-t")
                cmd.Env = append(cmd.Environ(), pgEnv(c)...)
                out, err := cmd.Output()
                if err != nil {
                        return nil, fmt.Errorf("psql: %s", stderr(err))
                }
                for _, line := range strings.Split(strings.TrimSpace(string(out)), "\n") {
                        parts := strings.Split(line, "\t")
                        if len(parts) < 5 || parts[0] == "" {
                                continue
                        }
                        var rows, size int64
                        fmt.Sscanf(parts[3], "%d", &rows)
                        fmt.Sscanf(parts[4], "%d", &size)
                        tableType := "table"
                        if parts[2] == "VIEW" {
                                tableType = "view"
                        }
                        tables = append(tables, DBTable{
                                Name: parts[0], Schema: parts[1], Type: tableType,
                                RowCount: rows, SizeBytes: size, SizeHuman: formatBytesSize(size),
                        })
                }

        case "mysql", "mariadb":
                query := fmt.Sprintf("SELECT table_name, table_type, COALESCE(table_rows,0), COALESCE(data_length+index_length,0) FROM information_schema.tables WHERE table_schema='%s' ORDER BY table_name", dbName)
                args := mysqlArgs(c, []string{"-e", query, "--skip-column-names", "--batch", dbName})
                cmd := exec.CommandContext(ctx, "mysql", args...)
                out, err := cmd.Output()
                if err != nil {
                        return nil, fmt.Errorf("mysql: %s", stderr(err))
                }
                for _, line := range strings.Split(strings.TrimSpace(string(out)), "\n") {
                        parts := strings.Split(line, "\t")
                        if len(parts) < 4 || parts[0] == "" {
                                continue
                        }
                        var rows, size int64
                        fmt.Sscanf(parts[2], "%d", &rows)
                        fmt.Sscanf(parts[3], "%d", &size)
                        ttype := "table"
                        if parts[1] == "VIEW" {
                                ttype = "view"
                        }
                        tables = append(tables, DBTable{
                                Name: parts[0], Schema: dbName, Type: ttype,
                                RowCount: rows, SizeBytes: size, SizeHuman: formatBytesSize(size),
                        })
                }

        case "sqlite":
                cmd := exec.CommandContext(ctx, "sqlite3", c.Host, ".tables")
                out, err := cmd.Output()
                if err != nil {
                        return nil, fmt.Errorf("sqlite3: %s", stderr(err))
                }
                for _, name := range strings.Fields(string(out)) {
                        // Get row count
                        countCmd := exec.CommandContext(ctx, "sqlite3", c.Host, fmt.Sprintf("SELECT COUNT(*) FROM \"%s\"", name))
                        countOut, _ := countCmd.Output()
                        var rows int64
                        fmt.Sscanf(strings.TrimSpace(string(countOut)), "%d", &rows)
                        tables = append(tables, DBTable{Name: name, Schema: "main", Type: "table", RowCount: rows})
                }

        case "redis":
                // Treat Redis keys as "tables"
                args := redisArgs(c, []string{"KEYS", "*"})
                if dbName != "" && dbName != "db0" {
                        dbNum := strings.TrimPrefix(dbName, "db")
                        args = append(redisArgs(c, nil), "-n", dbNum, "KEYS", "*")
                }
                cmd := exec.CommandContext(ctx, "redis-cli", args...)
                out, _ := cmd.Output()
                for _, key := range strings.Split(strings.TrimSpace(string(out)), "\n") {
                        if key != "" {
                                tables = append(tables, DBTable{Name: key, Schema: dbName, Type: "key"})
                        }
                }

        case "mongodb":
                uri := mongoURI(c)
                script := fmt.Sprintf(`db.getSiblingDB('%s').getCollectionNames().forEach(n=>{var c=db.getSiblingDB('%s').getCollection(n);print(n+"\t"+c.countDocuments())})`, dbName, dbName)
                cmd := exec.CommandContext(ctx, "mongosh", "--quiet", "--eval", script, uri)
                out, err := cmd.Output()
                if err != nil {
                        return nil, fmt.Errorf("mongosh: %s", stderr(err))
                }
                for _, line := range strings.Split(strings.TrimSpace(string(out)), "\n") {
                        parts := strings.Split(line, "\t")
                        if len(parts) < 1 || parts[0] == "" {
                                continue
                        }
                        var rows int64
                        if len(parts) > 1 {
                                fmt.Sscanf(parts[1], "%d", &rows)
                        }
                        tables = append(tables, DBTable{Name: parts[0], Schema: dbName, Type: "collection", RowCount: rows})
                }
        }

        if tables == nil {
                tables = []DBTable{}
        }
        return tables, nil
}

func listColumns(ctx context.Context, c DBConnection, dbName, tableName string) ([]DBColumn, error) {
        ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
        defer cancel()

        var cols []DBColumn

        switch c.Type {
        case "postgresql":
                query := fmt.Sprintf(`SELECT c.column_name, c.data_type, c.is_nullable, COALESCE(c.column_default,''), c.character_maximum_length, COALESCE(tc.constraint_type,'') FROM information_schema.columns c LEFT JOIN information_schema.key_column_usage kcu ON c.column_name=kcu.column_name AND c.table_name=kcu.table_name AND c.table_schema=kcu.table_schema LEFT JOIN information_schema.table_constraints tc ON kcu.constraint_name=tc.constraint_name AND kcu.table_schema=tc.table_schema WHERE c.table_name='%s' AND c.table_catalog='%s' ORDER BY c.ordinal_position`, tableName, dbName)
                dsn := pgDSNwithDB(c, dbName)
                cmd := exec.CommandContext(ctx, "psql", dsn, "-c", query, "-A", "-F", "\t", "--no-align", "-t")
                cmd.Env = append(cmd.Environ(), pgEnv(c)...)
                out, err := cmd.Output()
                if err != nil {
                        return nil, fmt.Errorf("psql: %s", stderr(err))
                }
                for _, line := range strings.Split(strings.TrimSpace(string(out)), "\n") {
                        parts := strings.Split(line, "\t")
                        if len(parts) < 6 || parts[0] == "" {
                                continue
                        }
                        col := DBColumn{
                                Name: parts[0], DataType: parts[1],
                                Nullable: parts[2] == "YES", DefaultValue: parts[3],
                                IsPrimary: parts[5] == "PRIMARY KEY",
                        }
                        if parts[4] != "" && parts[4] != "NULL" {
                                var ml int
                                fmt.Sscanf(parts[4], "%d", &ml)
                                col.MaxLength = &ml
                        }
                        cols = append(cols, col)
                }

        case "mysql", "mariadb":
                query := fmt.Sprintf("DESCRIBE `%s`.`%s`", dbName, tableName)
                args := mysqlArgs(c, []string{"-e", query, "--skip-column-names", "--batch"})
                cmd := exec.CommandContext(ctx, "mysql", args...)
                out, err := cmd.Output()
                if err != nil {
                        return nil, fmt.Errorf("mysql: %s", stderr(err))
                }
                for _, line := range strings.Split(strings.TrimSpace(string(out)), "\n") {
                        parts := strings.Split(line, "\t")
                        if len(parts) < 6 || parts[0] == "" {
                                continue
                        }
                        cols = append(cols, DBColumn{
                                Name: parts[0], DataType: parts[1],
                                Nullable: parts[2] == "YES",
                                DefaultValue: parts[4],
                                IsPrimary: strings.Contains(parts[3], "PRI"),
                                IsUnique: strings.Contains(parts[3], "UNI"),
                        })
                }

        case "sqlite":
                cmd := exec.CommandContext(ctx, "sqlite3", c.Host, fmt.Sprintf("PRAGMA table_info('%s')", tableName))
                out, err := cmd.Output()
                if err != nil {
                        return nil, fmt.Errorf("sqlite3: %s", stderr(err))
                }
                for _, line := range strings.Split(strings.TrimSpace(string(out)), "\n") {
                        parts := strings.Split(line, "|")
                        if len(parts) < 6 || parts[1] == "" {
                                continue
                        }
                        cols = append(cols, DBColumn{
                                Name: parts[1], DataType: parts[2],
                                Nullable: parts[3] == "0",
                                DefaultValue: parts[4],
                                IsPrimary: parts[5] == "1",
                        })
                }
        }

        if cols == nil {
                cols = []DBColumn{}
        }
        return cols, nil
}

func executeQuery(ctx context.Context, c DBConnection, dbName, query string) QueryResult {
        ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
        defer cancel()

        start := time.Now()
        result := QueryResult{
                Query:   query,
                Columns: []string{},
                Rows:    []map[string]interface{}{},
        }

        // Detect query type
        trimmed := strings.TrimSpace(strings.ToUpper(query))
        switch {
        case strings.HasPrefix(trimmed, "SELECT") || strings.HasPrefix(trimmed, "WITH") || strings.HasPrefix(trimmed, "EXPLAIN"):
                result.Type = "select"
        case strings.HasPrefix(trimmed, "INSERT"):
                result.Type = "insert"
        case strings.HasPrefix(trimmed, "UPDATE"):
                result.Type = "update"
        case strings.HasPrefix(trimmed, "DELETE"):
                result.Type = "delete"
        default:
                result.Type = "ddl"
        }

        switch c.Type {
        case "postgresql":
                dsn := pgDSNwithDB(c, dbName)
                cmd := exec.CommandContext(ctx, "psql", dsn, "-c", query, "--csv", "-A", "-q")
                cmd.Env = append(cmd.Environ(), pgEnv(c)...)
                out, err := cmd.Output()
                result.ExecutionTime = float64(time.Since(start).Microseconds()) / 1000
                if err != nil {
                        result.Error = stderr(err)
                        return result
                }
                parseCSVOutput(string(out), &result)

        case "mysql", "mariadb":
                args := mysqlArgs(c, []string{"-e", query, "--batch", "--skip-column-names", dbName})
                cmd := exec.CommandContext(ctx, "mysql", args...)
                out, err := cmd.Output()
                result.ExecutionTime = float64(time.Since(start).Microseconds()) / 1000
                if err != nil {
                        result.Error = stderr(err)
                        return result
                }
                parseTSVOutput(string(out), &result)

        case "redis":
                args := redisArgs(c, strings.Fields(query))
                cmd := exec.CommandContext(ctx, "redis-cli", args...)
                out, err := cmd.Output()
                result.ExecutionTime = float64(time.Since(start).Microseconds()) / 1000
                if err != nil {
                        result.Error = stderr(err)
                        return result
                }
                result.Columns = []string{"result"}
                result.Rows = []map[string]interface{}{{"result": strings.TrimSpace(string(out))}}
                result.RowCount = 1

        case "sqlite":
                cmd := exec.CommandContext(ctx, "sqlite3", c.Host, "-csv", "-header", query)
                out, err := cmd.Output()
                result.ExecutionTime = float64(time.Since(start).Microseconds()) / 1000
                if err != nil {
                        result.Error = stderr(err)
                        return result
                }
                parseCSVOutput(string(out), &result)

        default:
                result.Error = fmt.Sprintf("unsupported database type: %s", c.Type)
        }

        return result
}

// ── Connection string helpers ─────────────────────────────────────────────────

func pgDSN(c DBConnection) string {
        host := c.Host
        if host == "" {
                host = "localhost"
        }
        db := c.DatabaseName
        if db == "" {
                db = "postgres"
        }
        return fmt.Sprintf("postgresql://%s:%s@%s:%d/%s?sslmode=%s",
                c.Username, c.Password, host, c.Port, db, sslMode(c.SSLMode))
}

func pgDSNwithDB(c DBConnection, dbName string) string {
        host := c.Host
        if host == "" {
                host = "localhost"
        }
        return fmt.Sprintf("postgresql://%s:%s@%s:%d/%s?sslmode=%s",
                c.Username, c.Password, host, c.Port, dbName, sslMode(c.SSLMode))
}

func pgEnv(c DBConnection) []string {
        return []string{"PGPASSWORD=" + c.Password}
}

func mysqlArgs(c DBConnection, extra []string) []string {
        host := c.Host
        if host == "" {
                host = "localhost"
        }
        args := []string{
                "-h", host,
                "-P", strconv.Itoa(c.Port),
                "-u", c.Username,
                "-p" + c.Password,
        }
        return append(args, extra...)
}

func redisArgs(c DBConnection, extra []string) []string {
        host := c.Host
        if host == "" {
                host = "localhost"
        }
        args := []string{"-h", host, "-p", strconv.Itoa(c.Port)}
        if c.Password != "" {
                args = append(args, "-a", c.Password)
        }
        return append(args, extra...)
}

func mongoURI(c DBConnection) string {
        host := c.Host
        if host == "" {
                host = "localhost"
        }
        if c.Username != "" && c.Password != "" {
                return fmt.Sprintf("mongodb://%s:%s@%s:%d/%s", c.Username, c.Password, host, c.Port, c.DatabaseName)
        }
        return fmt.Sprintf("mongodb://%s:%d/%s", host, c.Port, c.DatabaseName)
}

func sslMode(mode string) string {
        if mode == "" {
                return "prefer"
        }
        return mode
}

func defaultPort(dbType string) int {
        switch dbType {
        case "postgresql":
                return 5432
        case "mysql", "mariadb":
                return 3306
        case "redis":
                return 6379
        case "mongodb":
                return 27017
        default:
                return 0
        }
}

// ── CSV/TSV parsing ────────────────────────────────────────────────────────────

func parseCSVOutput(raw string, result *QueryResult) {
        lines := strings.Split(strings.TrimRight(raw, "\n"), "\n")
        if len(lines) == 0 || (len(lines) == 1 && lines[0] == "") {
                return
        }
        headers := parseCSVLine(lines[0])
        result.Columns = headers
        for _, line := range lines[1:] {
                if line == "" {
                        continue
                }
                vals := parseCSVLine(line)
                row := make(map[string]interface{}, len(headers))
                for i, h := range headers {
                        if i < len(vals) {
                                row[h] = vals[i]
                        } else {
                                row[h] = nil
                        }
                }
                result.Rows = append(result.Rows, row)
        }
        result.RowCount = len(result.Rows)
}

func parseTSVOutput(raw string, result *QueryResult) {
        lines := strings.Split(strings.TrimRight(raw, "\n"), "\n")
        if len(lines) == 0 {
                return
        }
        if len(lines[0]) == 0 {
                return
        }
        headers := strings.Split(lines[0], "\t")
        result.Columns = headers
        for _, line := range lines[1:] {
                if line == "" {
                        continue
                }
                vals := strings.Split(line, "\t")
                row := make(map[string]interface{}, len(headers))
                for i, h := range headers {
                        if i < len(vals) {
                                row[h] = vals[i]
                        } else {
                                row[h] = nil
                        }
                }
                result.Rows = append(result.Rows, row)
        }
        result.RowCount = len(result.Rows)
}

func parseCSVLine(line string) []string {
        var fields []string
        var current bytes.Buffer
        inQuote := false
        for i := 0; i < len(line); i++ {
                ch := line[i]
                if ch == '"' {
                        if inQuote && i+1 < len(line) && line[i+1] == '"' {
                                current.WriteByte('"')
                                i++
                        } else {
                                inQuote = !inQuote
                        }
                } else if ch == ',' && !inQuote {
                        fields = append(fields, current.String())
                        current.Reset()
                } else {
                        current.WriteByte(ch)
                }
        }
        fields = append(fields, current.String())
        return fields
}

func stderr(err error) string {
        if exitErr, ok := err.(*exec.ExitError); ok {
                return strings.TrimSpace(string(exitErr.Stderr))
        }
        return err.Error()
}

func boolInt(b bool) int {
        if b {
                return 1
        }
        return 0
}

// ── Helper responses ──────────────────────────────────────────────────────────

func jsonOK(w http.ResponseWriter, v interface{}) {
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(v) //nolint:errcheck
}

func jsonError(w http.ResponseWriter, msg string, code int) {
        w.Header().Set("Content-Type", "application/json")
        w.WriteHeader(code)
        json.NewEncoder(w).Encode(map[string]string{"error": msg}) //nolint:errcheck
}

// ── Saved Queries ──────────────────────────────────────────────────────────────

type SavedQuery struct {
	ID           int64  `json:"id"`
	Name         string `json:"name"`
	Description  string `json:"description"`
	Query        string `json:"query"`
	ConnectionID int64  `json:"connection_id"`
	DatabaseName string `json:"database_name"`
	CreatedAt    int64  `json:"created_at"`
	UpdatedAt    int64  `json:"updated_at"`
}

func (s *Server) ensureSavedQueriesTable(ctx context.Context) {
	s.db.SQL.ExecContext(ctx, `
		CREATE TABLE IF NOT EXISTS database_saved_queries (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL,
			description TEXT DEFAULT '',
			query TEXT NOT NULL,
			connection_id INTEGER NOT NULL DEFAULT 0,
			database_name TEXT DEFAULT '',
			created_at INTEGER NOT NULL,
			updated_at INTEGER NOT NULL
		)
	`) //nolint:errcheck
}

func (s *Server) handleDBSavedQueryList(w http.ResponseWriter, r *http.Request) {
	s.ensureSavedQueriesTable(r.Context())
	rows, err := s.db.SQL.QueryContext(r.Context(), `
		SELECT id, name, description, query, connection_id, database_name, created_at, updated_at
		FROM database_saved_queries ORDER BY updated_at DESC
	`)
	if err != nil {
		jsonError(w, "db error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()
	var queries []SavedQuery
	for rows.Next() {
		var q SavedQuery
		rows.Scan(&q.ID, &q.Name, &q.Description, &q.Query, &q.ConnectionID, &q.DatabaseName, &q.CreatedAt, &q.UpdatedAt) //nolint:errcheck
		queries = append(queries, q)
	}
	if queries == nil {
		queries = []SavedQuery{}
	}
	jsonOK(w, queries)
}

func (s *Server) handleDBSavedQueryCreate(w http.ResponseWriter, r *http.Request) {
	s.ensureSavedQueriesTable(r.Context())
	var req SavedQuery
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "bad request", http.StatusBadRequest)
		return
	}
	now := time.Now().Unix()
	result, err := s.db.SQL.ExecContext(r.Context(), `
		INSERT INTO database_saved_queries (name, description, query, connection_id, database_name, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`, req.Name, req.Description, req.Query, req.ConnectionID, req.DatabaseName, now, now)
	if err != nil {
		jsonError(w, "db error", http.StatusInternalServerError)
		return
	}
	id, _ := result.LastInsertId()
	w.WriteHeader(http.StatusCreated)
	jsonOK(w, map[string]int64{"id": id})
}

func (s *Server) handleDBSavedQueryUpdate(w http.ResponseWriter, r *http.Request) {
	s.ensureSavedQueriesTable(r.Context())
	id, _ := strconv.ParseInt(r.PathValue("id"), 10, 64)
	var req SavedQuery
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "bad request", http.StatusBadRequest)
		return
	}
	now := time.Now().Unix()
	s.db.SQL.ExecContext(r.Context(), //nolint:errcheck
		`UPDATE database_saved_queries SET name=?, description=?, query=?, connection_id=?, database_name=?, updated_at=? WHERE id=?`,
		req.Name, req.Description, req.Query, req.ConnectionID, req.DatabaseName, now, id,
	)
	jsonOK(w, map[string]bool{"ok": true})
}

func (s *Server) handleDBSavedQueryDelete(w http.ResponseWriter, r *http.Request) {
	s.ensureSavedQueriesTable(r.Context())
	id, _ := strconv.ParseInt(r.PathValue("id"), 10, 64)
	s.db.SQL.ExecContext(r.Context(), `DELETE FROM database_saved_queries WHERE id = ?`, id) //nolint:errcheck
	jsonOK(w, map[string]bool{"ok": true})
}

// ── Table Indexes ──────────────────────────────────────────────────────────────

type DBIndex struct {
	Name    string   `json:"name"`
	Columns []string `json:"columns"`
	Unique  bool     `json:"unique"`
	Primary bool     `json:"primary"`
	Type    string   `json:"type"`
}

func (s *Server) handleDBTableIndexes(w http.ResponseWriter, r *http.Request) {
	connIDStr := r.PathValue("id")
	dbName := r.PathValue("db")
	tableName := r.PathValue("table")
	connID, err := strconv.ParseInt(connIDStr, 10, 64)
	if err != nil {
		jsonError(w, "invalid id", http.StatusBadRequest)
		return
	}

	var c DBConnection
	qErr := s.db.SQL.QueryRowContext(r.Context(), `
		SELECT id, name, type, host, port, username, password, database_name, ssl_mode
		FROM database_connections WHERE id=?
	`, connID).Scan(&c.ID, &c.Name, &c.Type, &c.Host, &c.Port, &c.Username, &c.Password, &c.DatabaseName, &c.SSLMode)
	if qErr != nil {
		jsonError(w, "connection not found", http.StatusNotFound)
		return
	}

	indexes := listIndexes(r.Context(), c, dbName, tableName)
	if indexes == nil {
		indexes = []DBIndex{}
	}
	jsonOK(w, map[string][]DBIndex{"indexes": indexes})
}

func listIndexes(ctx context.Context, c DBConnection, dbName, tableName string) []DBIndex {
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	var indexes []DBIndex

	switch c.Type {
	case "postgresql":
		query := fmt.Sprintf(`
			SELECT i.relname as index_name,
			       ix.indisprimary,
			       ix.indisunique,
			       am.amname as index_type,
			       array_to_string(ARRAY(
			         SELECT a.attname
			         FROM pg_attribute a
			         WHERE a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
			         ORDER BY array_position(ix.indkey, a.attnum)
			       ), ',') as cols
			FROM pg_class t
			JOIN pg_index ix ON t.oid = ix.indrelid
			JOIN pg_class i ON i.oid = ix.indexrelid
			JOIN pg_am am ON i.relam = am.oid
			WHERE t.relkind = 'r' AND t.relname = '%s'
			ORDER BY ix.indisprimary DESC, i.relname
		`, strings.ReplaceAll(tableName, "'", "''"))
		dsn := pgDSNwithDB(c, dbName)
		out, err := runPSQL(ctx, c, dsn, query)
		if err == nil {
			for _, line := range strings.Split(strings.TrimSpace(out), "\n") {
				parts := strings.Split(line, "\t")
				if len(parts) < 5 || parts[0] == "" {
					continue
				}
				cols := []string{}
				if parts[4] != "" {
					cols = strings.Split(parts[4], ",")
				}
				indexes = append(indexes, DBIndex{
					Name:    parts[0],
					Primary: parts[1] == "t",
					Unique:  parts[2] == "t",
					Type:    parts[3],
					Columns: cols,
				})
			}
		}

	case "mysql", "mariadb":
		query := fmt.Sprintf("SHOW INDEX FROM `%s` FROM `%s`",
			strings.ReplaceAll(tableName, "`", "``"),
			strings.ReplaceAll(dbName, "`", "``"))
		args := mysqlArgs(c, []string{"-e", query, "--skip-column-names", "--batch"})
		out, err := runCmd(ctx, "mysql", args...)
		if err == nil {
			idxMap := map[string]*DBIndex{}
			var idxOrder []string
			for _, line := range strings.Split(strings.TrimSpace(out), "\n") {
				parts := strings.Split(line, "\t")
				if len(parts) < 5 || parts[0] == "" {
					continue
				}
				name := parts[2]
				col := parts[4]
				nonUnique := parts[1]
				if _, ok := idxMap[name]; !ok {
					idxMap[name] = &DBIndex{
						Name:    name,
						Primary: name == "PRIMARY",
						Unique:  nonUnique == "0",
						Type:    "BTREE",
					}
					idxOrder = append(idxOrder, name)
				}
				if col != "" {
					idxMap[name].Columns = append(idxMap[name].Columns, col)
				}
			}
			for _, name := range idxOrder {
				indexes = append(indexes, *idxMap[name])
			}
		}

	case "sqlite":
		out, err := runCmd(ctx, "sqlite3", c.Host, fmt.Sprintf("PRAGMA index_list('%s')", strings.ReplaceAll(tableName, "'", "''")))
		if err == nil {
			for _, line := range strings.Split(strings.TrimSpace(out), "\n") {
				parts := strings.Split(line, "|")
				if len(parts) < 3 || parts[1] == "" {
					continue
				}
				name := parts[1]
				unique := parts[2] == "1"
				origin := ""
				if len(parts) > 3 {
					origin = parts[3]
				}
				primary := origin == "pk"
				// get columns
				colOut, _ := runCmd(ctx, "sqlite3", c.Host, fmt.Sprintf("PRAGMA index_info('%s')", strings.ReplaceAll(name, "'", "''")))
				var cols []string
				for _, cl := range strings.Split(strings.TrimSpace(colOut), "\n") {
					cp := strings.Split(cl, "|")
					if len(cp) >= 3 && cp[2] != "" {
						cols = append(cols, cp[2])
					}
				}
				if cols == nil {
					cols = []string{}
				}
				indexes = append(indexes, DBIndex{Name: name, Columns: cols, Unique: unique, Primary: primary, Type: "btree"})
			}
		}
	}

	return indexes
}

func runPSQL(ctx context.Context, c DBConnection, dsn, query string) (string, error) {
	import_exec := func() ([]byte, error) {
		cmd := execCmd(ctx, "psql", dsn, "-c", query, "-A", "-F", "\t", "--no-align", "-t")
		cmd.Env = append(cmd.Environ(), pgEnv(c)...)
		return cmd.Output()
	}
	out, err := import_exec()
	if err != nil {
		return "", err
	}
	return string(out), nil
}

func runCmd(ctx context.Context, name string, args ...string) (string, error) {
	cmd := execCmd(ctx, name, args...)
	out, err := cmd.Output()
	return string(out), err
}

func execCmd(ctx context.Context, name string, args ...string) *exec.Cmd {
	return exec.CommandContext(ctx, name, args...)
}
