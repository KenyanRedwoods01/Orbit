package api

import (
        "context"

        "fmt"
        "encoding/json"
        "net/http"
        "strconv"
        "time"

        "github.com/orbit-sh/orbit/internal/collector"
)

type alertRule struct {
        ID         int64   `json:"id"`
        Name       string  `json:"name"`
        Metric     string  `json:"metric"`
        Operator   string  `json:"operator"`
        Threshold  float64 `json:"threshold"`
        Channel    string  `json:"channel"`
        ChannelCfg string  `json:"channel_cfg,omitempty"`
        Enabled    bool    `json:"enabled"`
        CreatedAt  int64   `json:"created_at"`
}

func (s *Server) handleAlertRuleList(w http.ResponseWriter, r *http.Request) {
        rows, err := s.db.SQL.QueryContext(r.Context(),
                `SELECT id, name, metric, operator, threshold, channel, COALESCE(channel_cfg,''), enabled, created_at
                 FROM alert_rules ORDER BY id DESC`,
        )
        if err != nil {
                http.Error(w, "db error", http.StatusInternalServerError)
                return
        }
        defer rows.Close()

        var rules []alertRule
        for rows.Next() {
                var rule alertRule
                var enabledInt int
                rows.Scan(&rule.ID, &rule.Name, &rule.Metric, &rule.Operator, &rule.Threshold, //nolint:errcheck
                        &rule.Channel, &rule.ChannelCfg, &enabledInt, &rule.CreatedAt)
                rule.Enabled = enabledInt == 1
                rules = append(rules, rule)
        }
        if rules == nil {
                rules = []alertRule{}
        }
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(rules) //nolint:errcheck
}

func (s *Server) handleAlertRuleCreate(w http.ResponseWriter, r *http.Request) {
        var req alertRule
        if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
                http.Error(w, "bad request", http.StatusBadRequest)
                return
        }
        if req.Name == "" || req.Metric == "" || req.Operator == "" || req.Channel == "" {
                http.Error(w, "name, metric, operator, and channel are required", http.StatusBadRequest)
                return
        }

        res, err := s.db.SQL.ExecContext(r.Context(),
                `INSERT INTO alert_rules (name, metric, operator, threshold, channel, channel_cfg, enabled)
                 VALUES (?, ?, ?, ?, ?, ?, 1)`,
                req.Name, req.Metric, req.Operator, req.Threshold, req.Channel, req.ChannelCfg,
        )
        if err != nil {
                http.Error(w, "db error", http.StatusInternalServerError)
                return
        }
        req.ID, _ = res.LastInsertId()
        req.Enabled = true
        req.CreatedAt = time.Now().Unix()

        w.Header().Set("Content-Type", "application/json")
        w.WriteHeader(http.StatusCreated)
        json.NewEncoder(w).Encode(req) //nolint:errcheck
}

func (s *Server) handleAlertRuleUpdate(w http.ResponseWriter, r *http.Request) {
        idStr := r.PathValue("id")
        id, err := strconv.ParseInt(idStr, 10, 64)
        if err != nil {
                http.Error(w, "bad id", http.StatusBadRequest)
                return
        }

        var req alertRule
        if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
                http.Error(w, "bad request", http.StatusBadRequest)
                return
        }

        enabledInt := 0
        if req.Enabled {
                enabledInt = 1
        }
        _, err = s.db.SQL.ExecContext(r.Context(),
                `UPDATE alert_rules SET name=?, metric=?, operator=?, threshold=?, channel=?, channel_cfg=?, enabled=?
                 WHERE id=?`,
                req.Name, req.Metric, req.Operator, req.Threshold, req.Channel, req.ChannelCfg, enabledInt, id,
        )
        if err != nil {
                http.Error(w, "db error", http.StatusInternalServerError)
                return
        }
        req.ID = id
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(req) //nolint:errcheck
}

func (s *Server) handleAlertRuleDelete(w http.ResponseWriter, r *http.Request) {
        idStr := r.PathValue("id")
        id, err := strconv.ParseInt(idStr, 10, 64)
        if err != nil {
                http.Error(w, "bad id", http.StatusBadRequest)
                return
        }
        _, err = s.db.SQL.ExecContext(r.Context(), `DELETE FROM alert_rules WHERE id=?`, id)
        if err != nil {
                http.Error(w, "db error", http.StatusInternalServerError)
                return
        }
        w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleAlertRuleToggle(w http.ResponseWriter, r *http.Request) {
        idStr := r.PathValue("id")
        id, err := strconv.ParseInt(idStr, 10, 64)
        if err != nil {
                http.Error(w, "bad id", http.StatusBadRequest)
                return
        }
        _, err = s.db.SQL.ExecContext(r.Context(),
                `UPDATE alert_rules SET enabled = CASE WHEN enabled=1 THEN 0 ELSE 1 END WHERE id=?`, id,
        )
        if err != nil {
                http.Error(w, "db error", http.StatusInternalServerError)
                return
        }
        w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleAlertEventList(w http.ResponseWriter, r *http.Request) {
        rows, err := s.db.SQL.QueryContext(r.Context(),
                `SELECT e.id, e.rule_id, e.rule_name, e.metric, e.value, e.threshold, e.ts,
                        COALESCE(r.operator,''), COALESCE(r.channel,'log')
                 FROM alert_events e
                 LEFT JOIN alert_rules r ON r.id = e.rule_id
                 ORDER BY e.id DESC LIMIT 200`,
        )
        if err != nil {
                http.Error(w, "db error", http.StatusInternalServerError)
                return
        }
        defer rows.Close()

        type alertEvent struct {
                ID        int64   `json:"id"`
                RuleID    int64   `json:"rule_id"`
                RuleName  string  `json:"rule_name"`
                Metric    string  `json:"metric"`
                Value     float64 `json:"value"`
                Threshold float64 `json:"threshold"`
                Operator  string  `json:"operator"`
                Channel   string  `json:"channel"`
                FiredAt   int64   `json:"fired_at"`
        }

        var events []alertEvent
        for rows.Next() {
                var e alertEvent
                rows.Scan(&e.ID, &e.RuleID, &e.RuleName, &e.Metric, &e.Value, &e.Threshold, &e.FiredAt, &e.Operator, &e.Channel) //nolint:errcheck
                events = append(events, e)
        }
        if events == nil {
                events = []alertEvent{}
        }
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(events) //nolint:errcheck
}

// ── Alert Evaluation ────────────────────────────────────────────────────────

// evaluateAlertRules checks all enabled alert rules against a metrics snapshot
// and records any threshold breaches to the alert_events table.
func (s *Server) evaluateAlertRules(ctx context.Context, snap *collector.Snapshot) {
        rows, err := s.db.SQL.QueryContext(ctx,
                `SELECT id, name, metric, operator, threshold FROM alert_rules WHERE enabled=1`)
        if err != nil {
                return
        }
        defer rows.Close()

        type ruleRow struct {
                id        int64
                name      string
                metric    string
                operator  string
                threshold float64
        }
        var rules []ruleRow
        for rows.Next() {
                var ru ruleRow
                rows.Scan(&ru.id, &ru.name, &ru.metric, &ru.operator, &ru.threshold) //nolint:errcheck
                rules = append(rules, ru)
        }
        rows.Close()

        for _, ru := range rules {
                value, ok := extractMetricValue(snap, ru.metric)
                if !ok {
                        continue
                }
                if evalOperator(value, ru.operator, ru.threshold) {
                        // Avoid flooding: only insert if last event for this rule is >5 min ago
                        var lastTs int64
                        s.db.SQL.QueryRowContext(ctx,
                                `SELECT COALESCE(MAX(ts),0) FROM alert_events WHERE rule_id=?`, ru.id,
                        ).Scan(&lastTs) //nolint:errcheck

                        if time.Now().Unix()-lastTs >= 300 {
                                s.db.SQL.ExecContext(ctx, //nolint:errcheck
                                        `INSERT INTO alert_events (rule_id, rule_name, metric, value, threshold, ts)
                                         VALUES (?,?,?,?,?,unixepoch())`,
                                        ru.id, ru.name, ru.metric, value, ru.threshold,
                                )
                                // Dispatch real notification to all enabled channels
                                title := fmt.Sprintf("Alert: %s", ru.name)
                                msg := fmt.Sprintf("Metric %s = %.2f %s %.2f (threshold)", ru.metric, value, ru.operator, ru.threshold)
                                go s.DispatchNotification("warning", title, msg)
                        }
                }
        }
}

// extractMetricValue extracts the numeric value for a given metric name from a snapshot.
// Metric names: cpu, mem, mem_used, disk, swap, net_sent, net_recv
func extractMetricValue(snap *collector.Snapshot, metric string) (float64, bool) {
        switch metric {
        case "cpu", "cpu_pct":
                return snap.CPU.PercentTotal, true
        case "mem", "mem_pct", "memory":
                return snap.Memory.UsedPercent, true
        case "mem_used":
                return float64(snap.Memory.UsedBytes), true
        case "swap", "swap_pct":
                if snap.Memory.SwapTotalBytes > 0 {
                        return float64(snap.Memory.SwapUsedBytes) / float64(snap.Memory.SwapTotalBytes) * 100, true
                }
                return 0, true
        case "disk", "disk_pct":
                var maxPct float64
                for _, d := range snap.Disk {
                        if d.UsedPercent > maxPct {
                                maxPct = d.UsedPercent
                        }
                }
                return maxPct, true
        case "net_sent", "net_sent_bps":
                var total float64
                for _, n := range snap.Network {
                        total += float64(n.SentBps)
                }
                return total, true
        case "net_recv", "net_recv_bps":
                var total float64
                for _, n := range snap.Network {
                        total += float64(n.RecvBps)
                }
                return total, true
        }
        return 0, false
}

func evalOperator(value float64, operator string, threshold float64) bool {
        switch operator {
        case ">", "gt":
                return value > threshold
        case ">=", "gte":
                return value >= threshold
        case "<", "lt":
                return value < threshold
        case "<=", "lte":
                return value <= threshold
        case "==", "=", "eq":
                return value == threshold
        case "!=", "ne":
                return value != threshold
        }
        return false
}
