package api

import (
        "context"
        "crypto/tls"
        "encoding/json"
        "fmt"
        "math"
        "net"
        "net/http"
        "strconv"
        "strings"
        "time"
)

// ── Data types ────────────────────────────────────────────────

type uptimeMonitorRich struct {
        ID          int64    `json:"id"`
        Name        string   `json:"name"`
        Kind        string   `json:"kind"`
        Target      string   `json:"target"`
        IntervalS   int      `json:"interval_s"`
        Enabled     bool     `json:"enabled"`
        CreatedAt   int64    `json:"created_at"`
        Status      string   `json:"status"`
        LatencyMs   float64  `json:"latency_ms"`
        HttpCode    *int     `json:"http_code,omitempty"`
        SslDaysLeft *int     `json:"ssl_days_left,omitempty"`
        LastCheckAt *int64   `json:"last_check_at,omitempty"`
        Sla24h      float64  `json:"sla_24h"`
        Sla7d       float64  `json:"sla_7d"`
        Sla30d      float64  `json:"sla_30d"`
        Sla90d      float64  `json:"sla_90d"`
        History90d  []string `json:"history_90d"`
        Sparkline24h []float64 `json:"sparkline_24h"`
}

type uptimeMonitorBase struct {
        ID        int64  `json:"id"`
        Name      string `json:"name"`
        Kind      string `json:"kind"`
        Target    string `json:"target"`
        IntervalS int    `json:"interval_s"`
        Enabled   bool   `json:"enabled"`
        CreatedAt int64  `json:"created_at"`
        SslExpiresAt *int64 `json:"-"`
}

type uptimeEvent struct {
        ID        int64  `json:"id"`
        MonitorID int64  `json:"monitor_id"`
        Status    string `json:"status"`
        LatencyMs *int64 `json:"latency_ms,omitempty"`
        HttpCode  *int   `json:"http_code,omitempty"`
        TS        int64  `json:"ts"`
}

type uptimeSummary struct {
        Monitor   uptimeMonitorRich `json:"monitor"`
        Uptime24h float64           `json:"uptime_24h"`
        AvgLatMs  *float64          `json:"avg_latency_ms,omitempty"`
        Events    []uptimeEvent     `json:"events"`
}

type uptimeStats struct {
        OverallSLA          float64 `json:"overall_sla"`
        UpCount             int     `json:"up_count"`
        DownCount           int     `json:"down_count"`
        TotalCount          int     `json:"total_count"`
        AvgLatencyMs        float64 `json:"avg_latency_ms"`
        ActiveIncidentCount int     `json:"active_incident_count"`
        TotalIncident90d    int     `json:"total_incident_90d"`
        MttrAvgMin          float64 `json:"mttr_avg_min"`
}

type uptimeIncident struct {
        ID              int64    `json:"id"`
        MonitorID       int64    `json:"monitor_id"`
        MonitorName     string   `json:"monitor_name"`
        MonitorKind     string   `json:"monitor_kind"`
        Target          string   `json:"target"`
        Ref             string   `json:"ref"`
        Cause           string   `json:"cause"`
        Category        string   `json:"category"`
        Severity        string   `json:"severity"`
        StartedAt       int64    `json:"started_at"`
        ResolvedAt      *int64   `json:"resolved_at"`
        DurationMin     *int64   `json:"duration_min"`
        FailedChecks    int64    `json:"failed_checks"`
        MttdSec         int64    `json:"mttd_sec"`
        MttrMin         *int64   `json:"mttr_min"`
        ErrorCode       string   `json:"error_code"`
        ErrorDetail     string   `json:"error_detail"`
        RootCause       string   `json:"root_cause"`
        LogExcerpt      string   `json:"log_excerpt"`
        Resolution      string   `json:"resolution"`
        Prevention      []string `json:"prevention"`
        ImpactSummary   string   `json:"impact_summary"`
        LatencyBaseline int64    `json:"latency_baseline"`
        LatencyPeak     int64    `json:"latency_peak"`
        ResponderName   string   `json:"responder_name"`
        AffectedRegions []string `json:"affected_regions"`
        Timeline        []uptimeTimelineEvent `json:"timeline"`
        CheckLog        []uptimeCheckEntry    `json:"check_log"`
}

type uptimeTimelineEvent struct {
        OffsetMin float64 `json:"offset_min"`
        Type      string  `json:"type"`
        Actor     string  `json:"actor"`
        Message   string  `json:"message"`
}

type uptimeCheckEntry struct {
        OffsetMin float64 `json:"offset_min"`
        Status    string  `json:"status"`
        LatencyMs *int64  `json:"latency_ms"`
        HttpCode  *int    `json:"http_code,omitempty"`
        Note      string  `json:"note,omitempty"`
}

// ── Ping result ───────────────────────────────────────────────

type pingResult struct {
        Status       string
        LatencyMs    *int64
        HttpCode     *int
        SslExpiresAt *int64
        ErrorCode    string
        ErrorDetail  string
}

// ── Monitor CRUD ──────────────────────────────────────────────

func (s *Server) handleUptimeList(w http.ResponseWriter, r *http.Request) {
        ctx := r.Context()
        monitors := s.loadMonitors(ctx)
        if monitors == nil {
                monitors = []uptimeMonitorRich{}
        }

        if len(monitors) == 0 {
                w.Header().Set("Content-Type", "application/json")
                json.NewEncoder(w).Encode(monitors) //nolint:errcheck
                return
        }

        ids := make([]int64, len(monitors))
        for i, m := range monitors {
                ids[i] = m.ID
        }

        // Load all data in batch
        s.enrichMonitors(ctx, monitors, ids)

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(monitors) //nolint:errcheck
}

func (s *Server) loadMonitors(ctx context.Context) []uptimeMonitorRich {
        rows, err := s.db.SQL.QueryContext(ctx,
                `SELECT id, name, kind, target, interval_s, enabled, created_at, ssl_expires_at
                 FROM uptime_monitors ORDER BY id ASC`,
        )
        if err != nil {
                return nil
        }
        defer rows.Close()

        var monitors []uptimeMonitorRich
        for rows.Next() {
                var m uptimeMonitorRich
                var enabledInt int
                var sslExp *int64
                rows.Scan(&m.ID, &m.Name, &m.Kind, &m.Target, &m.IntervalS, &enabledInt, &m.CreatedAt, &sslExp) //nolint:errcheck
                m.Enabled = enabledInt == 1
                m.Status = "unknown"
                m.History90d = []string{}
                m.Sparkline24h = []float64{}

                if sslExp != nil {
                        daysLeft := int(time.Until(time.Unix(*sslExp, 0)).Hours() / 24)
                        if daysLeft < 0 {
                                daysLeft = 0
                        }
                        m.SslDaysLeft = &daysLeft
                }
                monitors = append(monitors, m)
        }
        return monitors
}

func (s *Server) enrichMonitors(ctx context.Context, monitors []uptimeMonitorRich, ids []int64) {
        now := time.Now()
        since90d := now.AddDate(0, 0, -90).Unix()
        since24h := now.Add(-24 * time.Hour).Unix()

        // Latest events per monitor
        latestMap := s.batchLatestEvents(ctx)
        // Daily buckets for 90-day history
        dailyMap := s.batchDailyHistory(ctx, ids, since90d, now)
        // 24h sparkline slots
        sparkMap := s.batchSparklines(ctx, ids, since24h, now)
        // SLA windows
        slaMap24h := s.batchSLA(ctx, ids, now.Add(-24*time.Hour).Unix())
        slaMap7d  := s.batchSLA(ctx, ids, now.AddDate(0, 0, -7).Unix())
        slaMap30d := s.batchSLA(ctx, ids, now.AddDate(0, 0, -30).Unix())
        slaMap90d := s.batchSLA(ctx, ids, since90d)

        for i := range monitors {
                m := &monitors[i]
                if ev, ok := latestMap[m.ID]; ok {
                        m.Status = ev.Status
                        if ev.LatencyMs != nil {
                                m.LatencyMs = float64(*ev.LatencyMs)
                        }
                        m.HttpCode = ev.HttpCode
                        m.LastCheckAt = &ev.TS
                }
                m.History90d = dailyMap[m.ID]
                m.Sparkline24h = sparkMap[m.ID]
                m.Sla24h = slaMap24h[m.ID]
                m.Sla7d  = slaMap7d[m.ID]
                m.Sla30d = slaMap30d[m.ID]
                m.Sla90d = slaMap90d[m.ID]
        }
}

// batchLatestEvents returns the most recent event per monitor.
func (s *Server) batchLatestEvents(ctx context.Context) map[int64]uptimeEvent {
        rows, err := s.db.SQL.QueryContext(ctx,
                `SELECT e.id, e.monitor_id, e.status, e.latency_ms, e.http_code, e.ts
                 FROM uptime_events e
                 INNER JOIN (
                   SELECT monitor_id, MAX(id) AS max_id FROM uptime_events GROUP BY monitor_id
                 ) latest ON e.id = latest.max_id`,
        )
        if err != nil {
                return nil
        }
        defer rows.Close()

        result := map[int64]uptimeEvent{}
        for rows.Next() {
                var e uptimeEvent
                rows.Scan(&e.ID, &e.MonitorID, &e.Status, &e.LatencyMs, &e.HttpCode, &e.TS) //nolint:errcheck
                result[e.MonitorID] = e
        }
        return result
}

// batchDailyHistory returns a 90-element slice per monitor (oldest first).
func (s *Server) batchDailyHistory(ctx context.Context, ids []int64, since int64, now time.Time) map[int64][]string {
        result := map[int64][]string{}
        for _, id := range ids {
                result[id] = make([]string, 90)
                for i := range result[id] {
                        result[id][i] = "nodata"
                }
        }

        rows, err := s.db.SQL.QueryContext(ctx,
                `SELECT monitor_id,
                        CAST((ts - ?) / 86400 AS INTEGER) AS day_offset,
                        SUM(CASE WHEN status='up' THEN 1 ELSE 0 END) AS up_cnt,
                        SUM(CASE WHEN status='down' THEN 1 ELSE 0 END) AS dn_cnt
                 FROM uptime_events
                 WHERE ts >= ?
                 GROUP BY monitor_id, day_offset`,
                since, since,
        )
        if err != nil {
                return result
        }
        defer rows.Close()

        for rows.Next() {
                var monID int64
                var dayOffset int
                var upCnt, dnCnt int
                rows.Scan(&monID, &dayOffset, &upCnt, &dnCnt) //nolint:errcheck
                if dayOffset < 0 || dayOffset >= 90 {
                        continue
                }
                if _, ok := result[monID]; !ok {
                        continue
                }
                total := upCnt + dnCnt
                if total == 0 {
                        continue
                }
                upPct := float64(upCnt) / float64(total) * 100
                if upPct >= 99.0 {
                        result[monID][dayOffset] = "up"
                } else if upPct >= 50.0 {
                        result[monID][dayOffset] = "degraded"
                } else {
                        result[monID][dayOffset] = "down"
                }
        }
        return result
}

// batchSparklines returns 48 half-hour average latency slots per monitor.
func (s *Server) batchSparklines(ctx context.Context, ids []int64, since int64, now time.Time) map[int64][]float64 {
        result := map[int64][]float64{}
        for _, id := range ids {
                result[id] = make([]float64, 48)
        }

        rows, err := s.db.SQL.QueryContext(ctx,
                `SELECT monitor_id,
                        CAST((ts - ?) / 1800 AS INTEGER) AS slot,
                        AVG(latency_ms) AS avg_lat
                 FROM uptime_events
                 WHERE ts >= ? AND latency_ms IS NOT NULL
                 GROUP BY monitor_id, slot`,
                since, since,
        )
        if err != nil {
                return result
        }
        defer rows.Close()

        for rows.Next() {
                var monID int64
                var slot int
                var avgLat float64
                rows.Scan(&monID, &slot, &avgLat) //nolint:errcheck
                if slot < 0 || slot >= 48 {
                        continue
                }
                if _, ok := result[monID]; !ok {
                        continue
                }
                result[monID][slot] = math.Round(avgLat*10) / 10
        }
        return result
}

// batchSLA computes uptime % for each monitor since the given timestamp.
func (s *Server) batchSLA(ctx context.Context, ids []int64, since int64) map[int64]float64 {
        result := map[int64]float64{}
        for _, id := range ids {
                result[id] = 100.0
        }

        rows, err := s.db.SQL.QueryContext(ctx,
                `SELECT monitor_id,
                        SUM(CASE WHEN status='up' THEN 1 ELSE 0 END) * 100.0 / COUNT(*) AS sla
                 FROM uptime_events
                 WHERE ts >= ?
                 GROUP BY monitor_id`,
                since,
        )
        if err != nil {
                return result
        }
        defer rows.Close()

        for rows.Next() {
                var monID int64
                var sla float64
                rows.Scan(&monID, &sla) //nolint:errcheck
                result[monID] = math.Round(sla*1000) / 1000
        }
        return result
}

func (s *Server) handleUptimeCreate(w http.ResponseWriter, r *http.Request) {
        var req struct {
                Name      string `json:"name"`
                Kind      string `json:"kind"`
                Target    string `json:"target"`
                IntervalS int    `json:"interval_s"`
        }
        if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
                http.Error(w, "bad request", http.StatusBadRequest)
                return
        }
        if req.Name == "" || req.Target == "" {
                http.Error(w, "name and target are required", http.StatusBadRequest)
                return
        }
        if req.IntervalS == 0 {
                req.IntervalS = 60
        }
        if req.Kind == "" {
                req.Kind = "http"
        }

        res, err := s.db.SQL.ExecContext(r.Context(),
                `INSERT INTO uptime_monitors (name, kind, target, interval_s, enabled) VALUES (?, ?, ?, ?, 1)`,
                req.Name, req.Kind, req.Target, req.IntervalS,
        )
        if err != nil {
                http.Error(w, "db error: "+err.Error(), http.StatusInternalServerError)
                return
        }
        id, _ := res.LastInsertId()

        m := uptimeMonitorRich{
                ID:           id,
                Name:         req.Name,
                Kind:         req.Kind,
                Target:       req.Target,
                IntervalS:    req.IntervalS,
                Enabled:      true,
                CreatedAt:    time.Now().Unix(),
                Status:       "unknown",
                History90d:   []string{},
                Sparkline24h: []float64{},
        }
        w.Header().Set("Content-Type", "application/json")
        w.WriteHeader(http.StatusCreated)
        json.NewEncoder(w).Encode(m) //nolint:errcheck

        // Trigger an immediate check
        go func() {
                pr := s.pingTarget(req.Kind, req.Target)
                s.recordUptimeEvent(id, pr)
        }()
}

func (s *Server) handleUptimeUpdate(w http.ResponseWriter, r *http.Request) {
        idStr := r.PathValue("id")
        id, err := strconv.ParseInt(idStr, 10, 64)
        if err != nil {
                http.Error(w, "bad id", http.StatusBadRequest)
                return
        }
        var req struct {
                Name      string `json:"name"`
                Kind      string `json:"kind"`
                Target    string `json:"target"`
                IntervalS int    `json:"interval_s"`
                Enabled   bool   `json:"enabled"`
        }
        if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
                http.Error(w, "bad request", http.StatusBadRequest)
                return
        }
        enabledInt := 0
        if req.Enabled {
                enabledInt = 1
        }
        if req.IntervalS == 0 {
                req.IntervalS = 60
        }
        _, err = s.db.SQL.ExecContext(r.Context(),
                `UPDATE uptime_monitors SET name=?, kind=?, target=?, interval_s=?, enabled=? WHERE id=?`,
                req.Name, req.Kind, req.Target, req.IntervalS, enabledInt, id,
        )
        if err != nil {
                http.Error(w, "db error", http.StatusInternalServerError)
                return
        }
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]interface{}{"id": id, "status": "updated"}) //nolint:errcheck
}

func (s *Server) handleUptimeDelete(w http.ResponseWriter, r *http.Request) {
        idStr := r.PathValue("id")
        id, err := strconv.ParseInt(idStr, 10, 64)
        if err != nil {
                http.Error(w, "bad id", http.StatusBadRequest)
                return
        }
        _, err = s.db.SQL.ExecContext(r.Context(), `DELETE FROM uptime_monitors WHERE id = ?`, id)
        if err != nil {
                http.Error(w, "db error", http.StatusInternalServerError)
                return
        }
        w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleUptimeSummary(w http.ResponseWriter, r *http.Request) {
        idStr := r.PathValue("id")
        id, err := strconv.ParseInt(idStr, 10, 64)
        if err != nil {
                http.Error(w, "bad id", http.StatusBadRequest)
                return
        }

        monitors := s.loadMonitors(r.Context())
        var target *uptimeMonitorRich
        for i := range monitors {
                if monitors[i].ID == id {
                        target = &monitors[i]
                        break
                }
        }
        if target == nil {
                http.Error(w, "monitor not found", http.StatusNotFound)
                return
        }
        s.enrichMonitors(r.Context(), []uptimeMonitorRich{*target}, []int64{id})

        since := time.Now().Add(-24 * time.Hour).Unix()
        rows, err := s.db.SQL.QueryContext(r.Context(),
                `SELECT id, monitor_id, status, latency_ms, http_code, ts FROM uptime_events
                 WHERE monitor_id=? AND ts >= ? ORDER BY ts DESC LIMIT 500`,
                id, since,
        )
        if err != nil {
                http.Error(w, "db error", http.StatusInternalServerError)
                return
        }
        defer rows.Close()

        var events []uptimeEvent
        upCount, totalCount := 0, 0
        var totalLat int64
        latCount := 0
        for rows.Next() {
                var e uptimeEvent
                rows.Scan(&e.ID, &e.MonitorID, &e.Status, &e.LatencyMs, &e.HttpCode, &e.TS) //nolint:errcheck
                events = append(events, e)
                totalCount++
                if e.Status == "up" {
                        upCount++
                }
                if e.LatencyMs != nil {
                        totalLat += *e.LatencyMs
                        latCount++
                }
        }

        uptime24h := 100.0
        if totalCount > 0 {
                uptime24h = float64(upCount) / float64(totalCount) * 100
        }
        var avgLat *float64
        if latCount > 0 {
                v := float64(totalLat) / float64(latCount)
                avgLat = &v
        }

        if events == nil {
                events = []uptimeEvent{}
        }

        summary := uptimeSummary{
                Monitor:   *target,
                Uptime24h: uptime24h,
                AvgLatMs:  avgLat,
                Events:    events,
        }
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(summary) //nolint:errcheck
}

// ── Stats endpoint ────────────────────────────────────────────

func (s *Server) handleUptimeStats(w http.ResponseWriter, r *http.Request) {
        ctx := r.Context()
        monitors := s.loadMonitors(ctx)

        if len(monitors) == 0 {
                w.Header().Set("Content-Type", "application/json")
                json.NewEncoder(w).Encode(uptimeStats{OverallSLA: 100.0}) //nolint:errcheck
                return
        }

        ids := make([]int64, len(monitors))
        for i, m := range monitors {
                ids[i] = m.ID
        }
        s.enrichMonitors(ctx, monitors, ids)

        var upCount, downCount int
        var totalLat float64
        latCount := 0
        var slaSum float64

        for _, m := range monitors {
                switch m.Status {
                case "up":
                        upCount++
                case "down":
                        downCount++
                }
                if m.LatencyMs > 0 {
                        totalLat += m.LatencyMs
                        latCount++
                }
                slaSum += m.Sla30d
        }

        overallSLA := slaSum / float64(len(monitors))
        avgLat := 0.0
        if latCount > 0 {
                avgLat = totalLat / float64(latCount)
        }

        since90d := time.Now().AddDate(0, 0, -90).Unix()
        var activeCount, total90d int
        var mttrSum float64
        mttrCount := 0

        s.db.SQL.QueryRowContext(ctx,
                `SELECT COUNT(*) FROM uptime_incidents WHERE resolved_at IS NULL`,
        ).Scan(&activeCount) //nolint:errcheck

        s.db.SQL.QueryRowContext(ctx,
                `SELECT COUNT(*) FROM uptime_incidents WHERE started_at >= ?`, since90d,
        ).Scan(&total90d) //nolint:errcheck

        rows, _ := s.db.SQL.QueryContext(ctx,
                `SELECT mttr_min FROM uptime_incidents WHERE mttr_min IS NOT NULL AND started_at >= ?`, since90d,
        )
        if rows != nil {
                defer rows.Close()
                for rows.Next() {
                        var v float64
                        rows.Scan(&v) //nolint:errcheck
                        mttrSum += v
                        mttrCount++
                }
        }

        mttrAvg := 0.0
        if mttrCount > 0 {
                mttrAvg = mttrSum / float64(mttrCount)
        }

        stats := uptimeStats{
                OverallSLA:          math.Round(overallSLA*1000) / 1000,
                UpCount:             upCount,
                DownCount:           downCount,
                TotalCount:          len(monitors),
                AvgLatencyMs:        math.Round(avgLat*10) / 10,
                ActiveIncidentCount: activeCount,
                TotalIncident90d:    total90d,
                MttrAvgMin:          math.Round(mttrAvg*10) / 10,
        }
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(stats) //nolint:errcheck
}

// ── Manual ping ───────────────────────────────────────────────

func (s *Server) handleUptimePing(w http.ResponseWriter, r *http.Request) {
        idStr := r.PathValue("id")
        id, err := strconv.ParseInt(idStr, 10, 64)
        if err != nil {
                http.Error(w, "bad id", http.StatusBadRequest)
                return
        }

        var kind, target string
        err = s.db.SQL.QueryRowContext(r.Context(),
                `SELECT kind, target FROM uptime_monitors WHERE id=?`, id,
        ).Scan(&kind, &target)
        if err != nil {
                http.Error(w, "monitor not found", http.StatusNotFound)
                return
        }

        pr := s.pingTarget(kind, target)
        s.recordUptimeEvent(id, pr)

        result := map[string]interface{}{
                "status":     pr.Status,
                "latency_ms": pr.LatencyMs,
                "http_code":  pr.HttpCode,
                "ts":         time.Now().Unix(),
        }
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(result) //nolint:errcheck
}

// ── Incidents ─────────────────────────────────────────────────

func (s *Server) handleUptimeIncidentList(w http.ResponseWriter, r *http.Request) {
        since90d := time.Now().AddDate(0, 0, -90).Unix()
        rows, err := s.db.SQL.QueryContext(r.Context(),
                `SELECT i.id, i.monitor_id, m.name, m.kind, m.target,
                        i.ref, i.cause, i.category, i.severity,
                        i.started_at, i.resolved_at, i.duration_min,
                        i.failed_checks, i.mttd_sec, i.mttr_min,
                        i.error_code, i.error_detail, i.latency_baseline, i.latency_peak,
                        i.responder_name
                 FROM uptime_incidents i
                 JOIN uptime_monitors m ON m.id = i.monitor_id
                 WHERE i.started_at >= ?
                 ORDER BY i.started_at DESC`,
                since90d,
        )
        if err != nil {
                http.Error(w, "db error", http.StatusInternalServerError)
                return
        }
        defer rows.Close()

        var incidents []uptimeIncident
        for rows.Next() {
                inc := s.scanIncidentRow(rows)
                if inc != nil {
                        inc.Timeline  = []uptimeTimelineEvent{}
                        inc.CheckLog  = []uptimeCheckEntry{}
                        inc.Prevention = []string{}
                        inc.AffectedRegions = []string{"local"}
                        incidents = append(incidents, *inc)
                }
        }
        if incidents == nil {
                incidents = []uptimeIncident{}
        }
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(incidents) //nolint:errcheck
}

func (s *Server) handleUptimeIncidentGet(w http.ResponseWriter, r *http.Request) {
        idStr := r.PathValue("incident_id")
        id, err := strconv.ParseInt(idStr, 10, 64)
        if err != nil {
                http.Error(w, "bad id", http.StatusBadRequest)
                return
        }

        row := s.db.SQL.QueryRowContext(r.Context(),
                `SELECT i.id, i.monitor_id, m.name, m.kind, m.target,
                        i.ref, i.cause, i.category, i.severity,
                        i.started_at, i.resolved_at, i.duration_min,
                        i.failed_checks, i.mttd_sec, i.mttr_min,
                        i.error_code, i.error_detail, i.latency_baseline, i.latency_peak,
                        i.responder_name
                 FROM uptime_incidents i
                 JOIN uptime_monitors m ON m.id = i.monitor_id
                 WHERE i.id = ?`,
                id,
        )
        inc := s.scanIncidentRow(row)
        if inc == nil {
                http.Error(w, "incident not found", http.StatusNotFound)
                return
        }

        // Load extended fields
        s.db.SQL.QueryRowContext(r.Context(),
                `SELECT root_cause, log_excerpt, resolution, prevention_json, impact_summary, affected_regions_json
                 FROM uptime_incidents WHERE id=?`, id,
        ).Scan(&inc.RootCause, &inc.LogExcerpt, &inc.Resolution, new(string), &inc.ImpactSummary, new(string)) //nolint:errcheck

        var prevJSON, regionsJSON string
        s.db.SQL.QueryRowContext(r.Context(),
                `SELECT prevention_json, affected_regions_json FROM uptime_incidents WHERE id=?`, id,
        ).Scan(&prevJSON, &regionsJSON) //nolint:errcheck

        if prevJSON != "" {
                json.Unmarshal([]byte(prevJSON), &inc.Prevention) //nolint:errcheck
        }
        if inc.Prevention == nil {
                inc.Prevention = []string{}
        }
        if regionsJSON != "" {
                json.Unmarshal([]byte(regionsJSON), &inc.AffectedRegions) //nolint:errcheck
        }
        if inc.AffectedRegions == nil {
                inc.AffectedRegions = []string{"local"}
        }

        // Build timeline from auto-generated events
        inc.Timeline = s.buildIncidentTimeline(*inc)

        // Build check log from uptime_events around incident window
        inc.CheckLog = s.buildIncidentCheckLog(r.Context(), *inc)

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(inc) //nolint:errcheck
}

func (s *Server) handleUptimeIncidentCreate(w http.ResponseWriter, r *http.Request) {
        var req struct {
                MonitorID int64  `json:"monitor_id"`
                Cause     string `json:"cause"`
                Severity  string `json:"severity"`
                Category  string `json:"category"`
                ErrorCode string `json:"error_code"`
        }
        if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
                http.Error(w, "bad request", http.StatusBadRequest)
                return
        }
        if req.MonitorID == 0 {
                http.Error(w, "monitor_id is required", http.StatusBadRequest)
                return
        }
        if req.Severity == "" {
                req.Severity = "major"
        }
        if req.Category == "" {
                req.Category = "network"
        }

        id, err := s.createIncident(r.Context(), req.MonitorID, req.Cause, req.Severity, req.Category, req.ErrorCode, "")
        if err != nil {
                http.Error(w, "db error: "+err.Error(), http.StatusInternalServerError)
                return
        }

        w.Header().Set("Content-Type", "application/json")
        w.WriteHeader(http.StatusCreated)
        json.NewEncoder(w).Encode(map[string]interface{}{"id": id}) //nolint:errcheck
}

func (s *Server) handleUptimeIncidentUpdate(w http.ResponseWriter, r *http.Request) {
        idStr := r.PathValue("incident_id")
        id, err := strconv.ParseInt(idStr, 10, 64)
        if err != nil {
                http.Error(w, "bad id", http.StatusBadRequest)
                return
        }
        var req struct {
                Cause         string   `json:"cause"`
                Severity      string   `json:"severity"`
                Category      string   `json:"category"`
                RootCause     string   `json:"root_cause"`
                LogExcerpt    string   `json:"log_excerpt"`
                Resolution    string   `json:"resolution"`
                Prevention    []string `json:"prevention"`
                ImpactSummary string   `json:"impact_summary"`
                ResponderName string   `json:"responder_name"`
        }
        if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
                http.Error(w, "bad request", http.StatusBadRequest)
                return
        }
        prevJSON, _ := json.Marshal(req.Prevention)
        _, err = s.db.SQL.ExecContext(r.Context(),
                `UPDATE uptime_incidents SET cause=?, severity=?, category=?,
                 root_cause=?, log_excerpt=?, resolution=?, prevention_json=?,
                 impact_summary=?, responder_name=?
                 WHERE id=?`,
                req.Cause, req.Severity, req.Category,
                req.RootCause, req.LogExcerpt, req.Resolution, string(prevJSON),
                req.ImpactSummary, req.ResponderName, id,
        )
        if err != nil {
                http.Error(w, "db error", http.StatusInternalServerError)
                return
        }
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]interface{}{"id": id, "status": "updated"}) //nolint:errcheck
}

func (s *Server) handleUptimeIncidentDelete(w http.ResponseWriter, r *http.Request) {
        idStr := r.PathValue("incident_id")
        id, err := strconv.ParseInt(idStr, 10, 64)
        if err != nil {
                http.Error(w, "bad id", http.StatusBadRequest)
                return
        }
        _, err = s.db.SQL.ExecContext(r.Context(), `DELETE FROM uptime_incidents WHERE id=?`, id)
        if err != nil {
                http.Error(w, "db error", http.StatusInternalServerError)
                return
        }
        w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleUptimeIncidentResolve(w http.ResponseWriter, r *http.Request) {
        idStr := r.PathValue("incident_id")
        id, err := strconv.ParseInt(idStr, 10, 64)
        if err != nil {
                http.Error(w, "bad id", http.StatusBadRequest)
                return
        }

        var startedAt int64
        err = s.db.SQL.QueryRowContext(r.Context(),
                `SELECT started_at FROM uptime_incidents WHERE id=? AND resolved_at IS NULL`, id,
        ).Scan(&startedAt)
        if err != nil {
                http.Error(w, "incident not found or already resolved", http.StatusNotFound)
                return
        }

        now := time.Now().Unix()
        durationMin := (now - startedAt) / 60
        mttrMin := durationMin

        _, err = s.db.SQL.ExecContext(r.Context(),
                `UPDATE uptime_incidents SET resolved_at=?, duration_min=?, mttr_min=? WHERE id=?`,
                now, durationMin, mttrMin, id,
        )
        if err != nil {
                http.Error(w, "db error", http.StatusInternalServerError)
                return
        }
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]interface{}{"id": id, "resolved_at": now, "duration_min": durationMin}) //nolint:errcheck
}

// ── Helpers ───────────────────────────────────────────────────

type incidentScanner interface {
        Scan(...interface{}) error
}

func (s *Server) scanIncidentRow(row incidentScanner) *uptimeIncident {
        var inc uptimeIncident
        var resolvedAt *int64
        var durationMin *int64
        var mttrMin *int64
        err := row.Scan(
                &inc.ID, &inc.MonitorID, &inc.MonitorName, &inc.MonitorKind, &inc.Target,
                &inc.Ref, &inc.Cause, &inc.Category, &inc.Severity,
                &inc.StartedAt, &resolvedAt, &durationMin,
                &inc.FailedChecks, &inc.MttdSec, &mttrMin,
                &inc.ErrorCode, &inc.ErrorDetail, &inc.LatencyBaseline, &inc.LatencyPeak,
                &inc.ResponderName,
        )
        if err != nil {
                return nil
        }
        inc.ResolvedAt = resolvedAt
        inc.DurationMin = durationMin
        inc.MttrMin = mttrMin
        return &inc
}

func (s *Server) buildIncidentTimeline(inc uptimeIncident) []uptimeTimelineEvent {
        timeline := []uptimeTimelineEvent{
                {
                        OffsetMin: 0,
                        Type:      "detection",
                        Actor:     "orbit-monitor",
                        Message:   fmt.Sprintf("%s check to %s failed — %s (3 consecutive failures)", strings.ToUpper(inc.MonitorKind), inc.Target, inc.ErrorCode),
                },
                {
                        OffsetMin: 0.5,
                        Type:      "alert",
                        Actor:     "orbit-alerts",
                        Message:   fmt.Sprintf("Incident %s opened automatically — monitor %s is down", inc.Ref, inc.MonitorName),
                },
        }

        if inc.ResolvedAt != nil {
                durationMin := float64(*inc.DurationMin)
                timeline = append(timeline, uptimeTimelineEvent{
                        OffsetMin: durationMin,
                        Type:      "resolved",
                        Actor:     "orbit-monitor",
                        Message:   fmt.Sprintf("Monitor recovered. Incident closed. Duration: %.0f minutes.", durationMin),
                })
        } else {
                timeline = append(timeline, uptimeTimelineEvent{
                        OffsetMin: float64(time.Now().Unix()-inc.StartedAt) / 60,
                        Type:      "monitoring",
                        Actor:     "orbit-monitor",
                        Message:   fmt.Sprintf("Monitor still down. %d consecutive failed checks.", inc.FailedChecks),
                })
        }
        return timeline
}

func (s *Server) buildIncidentCheckLog(ctx context.Context, inc uptimeIncident) []uptimeCheckEntry {
        // Get events from 10 minutes before incident to end of incident (or now)
        windowStart := inc.StartedAt - 600
        windowEnd := time.Now().Unix()
        if inc.ResolvedAt != nil {
                windowEnd = *inc.ResolvedAt + 600
        }

        rows, err := s.db.SQL.QueryContext(ctx,
                `SELECT status, latency_ms, http_code, ts FROM uptime_events
                 WHERE monitor_id=? AND ts >= ? AND ts <= ?
                 ORDER BY ts ASC LIMIT 100`,
                inc.MonitorID, windowStart, windowEnd,
        )
        if err != nil {
                return []uptimeCheckEntry{}
        }
        defer rows.Close()

        var entries []uptimeCheckEntry
        for rows.Next() {
                var status string
                var latMs *int64
                var httpCode *int
                var ts int64
                rows.Scan(&status, &latMs, &httpCode, &ts) //nolint:errcheck

                offsetMin := float64(ts-inc.StartedAt) / 60.0
                entry := uptimeCheckEntry{
                        OffsetMin: math.Round(offsetMin*10) / 10,
                        Status:    status,
                        LatencyMs: latMs,
                        HttpCode:  httpCode,
                }
                if status == "down" && inc.ErrorCode != "" {
                        entry.Note = inc.ErrorCode
                }
                entries = append(entries, entry)
        }
        if entries == nil {
                return []uptimeCheckEntry{}
        }
        return entries
}

func (s *Server) createIncident(ctx context.Context, monitorID int64, cause, severity, category, errorCode, errorDetail string) (int64, error) {
        var count int
        s.db.SQL.QueryRowContext(ctx, `SELECT COUNT(*) FROM uptime_incidents`).Scan(&count) //nolint:errcheck
        ref := fmt.Sprintf("INC-%04d", count+1)

        // Get monitor info
        var monKind, monTarget string
        s.db.SQL.QueryRowContext(ctx,
                `SELECT kind, target FROM uptime_monitors WHERE id=?`, monitorID,
        ).Scan(&monKind, &monTarget) //nolint:errcheck

        // Get baseline latency (average of last 10 good checks before the incident)
        var baselineLat int64
        s.db.SQL.QueryRowContext(ctx,
                `SELECT COALESCE(AVG(latency_ms), 0) FROM (
                   SELECT latency_ms FROM uptime_events
                   WHERE monitor_id=? AND status='up' AND latency_ms IS NOT NULL
                   ORDER BY id DESC LIMIT 10
                 )`, monitorID,
        ).Scan(&baselineLat) //nolint:errcheck

        res, err := s.db.SQL.ExecContext(ctx,
                `INSERT INTO uptime_incidents
                 (monitor_id, ref, cause, category, severity, error_code, error_detail,
                  latency_baseline, responder_name, affected_regions_json, prevention_json)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'orbit-monitor', '["local"]', '[]')`,
                monitorID, ref, cause, category, severity, errorCode, errorDetail, baselineLat,
        )
        if err != nil {
                return 0, err
        }
        return res.LastInsertId()
}

// ── Poller ────────────────────────────────────────────────────

func (s *Server) runUptimePoller(ctx context.Context) {
        lastPoll := map[int64]time.Time{}
        ticker := time.NewTicker(10 * time.Second)
        defer ticker.Stop()

        s.pollUptimeMonitors(ctx, lastPoll)

        for {
                select {
                case <-ctx.Done():
                        return
                case <-ticker.C:
                        s.pollUptimeMonitors(ctx, lastPoll)
                }
        }
}

func (s *Server) pollUptimeMonitors(ctx context.Context, lastPoll map[int64]time.Time) {
        rows, err := s.db.SQL.QueryContext(ctx,
                `SELECT id, kind, target, interval_s FROM uptime_monitors WHERE enabled=1`,
        )
        if err != nil {
                return
        }
        defer rows.Close()

        now := time.Now()
        type monEntry struct {
                id        int64
                kind      string
                target    string
                intervalS int
        }
        var monitors []monEntry
        for rows.Next() {
                var m monEntry
                rows.Scan(&m.id, &m.kind, &m.target, &m.intervalS) //nolint:errcheck
                monitors = append(monitors, m)
        }

        for _, m := range monitors {
                last, ok := lastPoll[m.id]
                interval := time.Duration(m.intervalS) * time.Second
                if interval < 10*time.Second {
                        interval = 10 * time.Second
                }
                if ok && now.Sub(last) < interval {
                        continue
                }
                lastPoll[m.id] = now

                go func(mon monEntry) {
                        pr := s.pingTarget(mon.kind, mon.target)
                        s.recordUptimeEvent(mon.id, pr)
                }(m)
        }
}

// ── Ping ──────────────────────────────────────────────────────

func (s *Server) pingTarget(kind, target string) pingResult {
        start := time.Now()
        timeout := 10 * time.Second
        pr := pingResult{Status: "down", ErrorCode: "UNKNOWN"}

        switch strings.ToLower(kind) {
        case "http", "https":
                url := target
                if !strings.HasPrefix(url, "http") {
                        url = "http://" + url
                }
                // Validate final URL uses http or https scheme
                if !strings.HasPrefix(url, "http://") && !strings.HasPrefix(url, "https://") {
                        pr.ErrorCode = "INVALID_URL"
                        pr.ErrorDetail = "URL must use http or https scheme"
                        return pr
                }

                // Use TLS-aware client to check SSL cert
                tlsCfg := &tls.Config{InsecureSkipVerify: false}
                transport := &http.Transport{
                        TLSClientConfig:       tlsCfg,
                        TLSHandshakeTimeout:   timeout,
                        ResponseHeaderTimeout: timeout,
                }
                client := &http.Client{Timeout: timeout, Transport: transport}
                resp, err := client.Get(url)
                if err != nil {
                        pr.ErrorCode = classifyHTTPError(err)
                        pr.ErrorDetail = err.Error()
                        return pr
                }
                defer resp.Body.Close()

                latMs := time.Since(start).Milliseconds()
                pr.LatencyMs = &latMs
                pr.HttpCode = &resp.StatusCode

                if resp.StatusCode >= 500 {
                        pr.Status = "down"
                        pr.ErrorCode = fmt.Sprintf("HTTP_%d", resp.StatusCode)
                        return pr
                }
                pr.Status = "up"

                // Extract SSL expiry from TLS connection state
                if resp.TLS != nil && len(resp.TLS.PeerCertificates) > 0 {
                        expiry := resp.TLS.PeerCertificates[0].NotAfter.Unix()
                        pr.SslExpiresAt = &expiry
                }

        case "tcp":
                host := target
                if !strings.Contains(host, ":") {
                        host = host + ":80"
                }
                conn, err := net.DialTimeout("tcp", host, timeout)
                if err != nil {
                        pr.ErrorCode = classifyNetError(err)
                        pr.ErrorDetail = err.Error()
                        return pr
                }
                conn.Close()
                latMs := time.Since(start).Milliseconds()
                pr.LatencyMs = &latMs
                pr.Status = "up"

        case "icmp", "ping":
                host := target
                if strings.Contains(host, ":") {
                        host = strings.Split(host, ":")[0]
                }
                // Try common ports since raw ICMP needs root
                for _, port := range []string{"80", "443", "22"} {
                        conn, err := net.DialTimeout("tcp", host+":"+port, timeout)
                        if err == nil {
                                conn.Close()
                                latMs := time.Since(start).Milliseconds()
                                pr.LatencyMs = &latMs
                                pr.Status = "up"
                                return pr
                        }
                }
                pr.ErrorCode = "HOST_UNREACHABLE"
                pr.ErrorDetail = "No open ports found on host"

        default:
                // Validate target doesn't contain whitespace or control characters
                target = strings.TrimSpace(target)
                if strings.ContainsAny(target, " \t\n\r\x00") || target == "" {
                        pr.ErrorCode = "INVALID_HOST"
                        pr.ErrorDetail = "invalid target host"
                        return pr
                }
                client := &http.Client{Timeout: timeout}
                resp, err := client.Get("http://" + target)
                if err != nil {
                        pr.ErrorCode = classifyHTTPError(err)
                        return pr
                }
                defer resp.Body.Close()
                latMs := time.Since(start).Milliseconds()
                pr.LatencyMs = &latMs
                pr.Status = "up"
        }
        return pr
}

func classifyHTTPError(err error) string {
        msg := err.Error()
        if strings.Contains(msg, "connection refused") {
                return "ECONNREFUSED"
        }
        if strings.Contains(msg, "timeout") || strings.Contains(msg, "deadline") {
                return "TIMEOUT"
        }
        if strings.Contains(msg, "no such host") || strings.Contains(msg, "DNS") {
                return "DNS_FAILURE"
        }
        if strings.Contains(msg, "certificate") || strings.Contains(msg, "x509") {
                return "SSL_ERROR"
        }
        return "CONNECTION_FAILED"
}

func classifyNetError(err error) string {
        msg := err.Error()
        if strings.Contains(msg, "connection refused") {
                return "ECONNREFUSED"
        }
        if strings.Contains(msg, "timeout") || strings.Contains(msg, "deadline") {
                return "TCP_TIMEOUT"
        }
        if strings.Contains(msg, "no such host") {
                return "DNS_FAILURE"
        }
        return "TCP_FAILED"
}

// ── Record event and auto-detect incidents ─────────────────────

func (s *Server) recordUptimeEvent(monitorID int64, pr pingResult) {
        // Store event
        s.db.SQL.Exec( //nolint:errcheck
                `INSERT INTO uptime_events (monitor_id, status, latency_ms, http_code) VALUES (?, ?, ?, ?)`,
                monitorID, pr.Status, pr.LatencyMs, pr.HttpCode,
        )

        // Update SSL expiry on monitor if available
        if pr.SslExpiresAt != nil {
                s.db.SQL.Exec( //nolint:errcheck
                        `UPDATE uptime_monitors SET ssl_expires_at=? WHERE id=?`,
                        pr.SslExpiresAt, monitorID,
                )
        }

        // Prune events older than 91 days
        cutoff := time.Now().AddDate(0, 0, -91).Unix()
        s.db.SQL.Exec( //nolint:errcheck
                `DELETE FROM uptime_events WHERE monitor_id=? AND ts < ?`, monitorID, cutoff,
        )

        // Auto incident detection
        ctx := context.Background()
        if pr.Status == "down" {
                s.maybeOpenIncident(ctx, monitorID, pr)
        } else if pr.Status == "up" {
                s.maybeResolveIncident(ctx, monitorID)
        }

        // Update failed_checks count on open incident
        if pr.Status == "down" {
                s.db.SQL.Exec( //nolint:errcheck
                        `UPDATE uptime_incidents SET failed_checks = failed_checks + 1
                         WHERE monitor_id=? AND resolved_at IS NULL`, monitorID,
                )
        }
}

func (s *Server) maybeOpenIncident(ctx context.Context, monitorID int64, pr pingResult) {
        // Check if an open incident already exists
        var openCount int
        s.db.SQL.QueryRowContext(ctx,
                `SELECT COUNT(*) FROM uptime_incidents WHERE monitor_id=? AND resolved_at IS NULL`,
                monitorID,
        ).Scan(&openCount) //nolint:errcheck
        if openCount > 0 {
                return
        }

        // Count consecutive failures (last 3 events)
        rows, err := s.db.SQL.QueryContext(ctx,
                `SELECT status FROM uptime_events WHERE monitor_id=? ORDER BY id DESC LIMIT 3`,
                monitorID,
        )
        if err != nil {
                return
        }
        defer rows.Close()

        consecutiveFails := 0
        for rows.Next() {
                var st string
                rows.Scan(&st) //nolint:errcheck
                if st == "down" {
                        consecutiveFails++
                } else {
                        break
                }
        }

        if consecutiveFails >= 3 {
                var monName, monKind string
                s.db.SQL.QueryRowContext(ctx,
                        `SELECT name, kind FROM uptime_monitors WHERE id=?`, monitorID,
                ).Scan(&monName, &monKind) //nolint:errcheck

                cause := deriveCause(pr.ErrorCode, monKind)
                category := deriveCategory(pr.ErrorCode)
                severity := "major"
                if pr.ErrorCode == "ECONNREFUSED" || pr.ErrorCode == "TCP_TIMEOUT" {
                        severity = "critical"
                }

                s.createIncident(ctx, monitorID, cause, severity, category, pr.ErrorCode, pr.ErrorDetail) //nolint:errcheck
        }
}

func (s *Server) maybeResolveIncident(ctx context.Context, monitorID int64) {
        var incID, startedAt int64
        err := s.db.SQL.QueryRowContext(ctx,
                `SELECT id, started_at FROM uptime_incidents WHERE monitor_id=? AND resolved_at IS NULL ORDER BY id DESC LIMIT 1`,
                monitorID,
        ).Scan(&incID, &startedAt)
        if err != nil {
                return // No open incident
        }

        now := time.Now().Unix()
        durationMin := (now - startedAt) / 60
        if durationMin < 1 {
                durationMin = 1
        }

        s.db.SQL.Exec( //nolint:errcheck
                `UPDATE uptime_incidents SET resolved_at=?, duration_min=?, mttr_min=? WHERE id=?`,
                now, durationMin, durationMin, incID,
        )
}

func deriveCause(errorCode, kind string) string {
        switch errorCode {
        case "ECONNREFUSED":
                return "Connection refused (ECONNREFUSED)"
        case "TCP_TIMEOUT", "TIMEOUT":
                return "Connection timeout"
        case "DNS_FAILURE":
                return "DNS resolution failure"
        case "SSL_ERROR":
                return "SSL/TLS certificate error"
        case "HOST_UNREACHABLE":
                return "Host unreachable (no route)"
        }
        if strings.HasPrefix(errorCode, "HTTP_") {
                code := strings.TrimPrefix(errorCode, "HTTP_")
                return fmt.Sprintf("HTTP %s error response", code)
        }
        return fmt.Sprintf("%s check failed", strings.ToUpper(kind))
}

func deriveCategory(errorCode string) string {
        switch errorCode {
        case "SSL_ERROR":
                return "ssl"
        case "DNS_FAILURE":
                return "network"
        case "ECONNREFUSED", "TCP_TIMEOUT", "HOST_UNREACHABLE":
                return "network"
        }
        if strings.HasPrefix(errorCode, "HTTP_") {
                return "application"
        }
        return "network"
}
