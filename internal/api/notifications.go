package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/smtp"
	"strconv"
	"strings"
	"time"
)

type notificationChannel struct {
	ID        int64  `json:"id"`
	Name      string `json:"name"`
	Type      string `json:"type"`
	Config    string `json:"config"`
	Enabled   bool   `json:"enabled"`
	CreatedAt int64  `json:"created_at"`
}

type notificationEvent struct {
	ID        int64  `json:"id"`
	ChannelID *int64 `json:"channel_id,omitempty"`
	Severity  string `json:"severity"`
	Title     string `json:"title"`
	Message   string `json:"message"`
	Sent      bool   `json:"sent"`
	CreatedAt int64  `json:"created_at"`
}

func (s *Server) handleNotificationChannelList(w http.ResponseWriter, r *http.Request) {
	rows, err := s.db.SQL.QueryContext(r.Context(),
		`SELECT id, name, type, COALESCE(config,'{}'), enabled, created_at FROM notification_channels ORDER BY id DESC`,
	)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode([]notificationChannel{}) //nolint:errcheck
		return
	}
	defer rows.Close()

	var channels []notificationChannel
	for rows.Next() {
		var c notificationChannel
		rows.Scan(&c.ID, &c.Name, &c.Type, &c.Config, &c.Enabled, &c.CreatedAt) //nolint:errcheck
		channels = append(channels, c)
	}
	if channels == nil {
		channels = []notificationChannel{}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(channels) //nolint:errcheck
}

func (s *Server) handleNotificationChannelCreate(w http.ResponseWriter, r *http.Request) {
	var req notificationChannel
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	if req.Name == "" || req.Type == "" {
		http.Error(w, "name and type are required", http.StatusBadRequest)
		return
	}
	if req.Config == "" {
		req.Config = "{}"
	}
	req.Enabled = true

	res, err := s.db.SQL.ExecContext(r.Context(),
		`INSERT INTO notification_channels (name, type, config, enabled) VALUES (?, ?, ?, ?)`,
		req.Name, req.Type, req.Config, req.Enabled,
	)
	if err != nil {
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}
	req.ID, _ = res.LastInsertId()
	req.CreatedAt = time.Now().Unix()

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(req) //nolint:errcheck
}

func (s *Server) handleNotificationChannelUpdate(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		http.Error(w, "bad id", http.StatusBadRequest)
		return
	}
	var req notificationChannel
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	if req.Config == "" {
		req.Config = "{}"
	}
	_, err = s.db.SQL.ExecContext(r.Context(),
		`UPDATE notification_channels SET name=?, type=?, config=?, enabled=? WHERE id=?`,
		req.Name, req.Type, req.Config, req.Enabled, id,
	)
	if err != nil {
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleNotificationChannelDelete(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		http.Error(w, "bad id", http.StatusBadRequest)
		return
	}
	_, err = s.db.SQL.ExecContext(r.Context(), `DELETE FROM notification_channels WHERE id=?`, id)
	if err != nil {
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleNotificationChannelToggle(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		http.Error(w, "bad id", http.StatusBadRequest)
		return
	}
	_, err = s.db.SQL.ExecContext(r.Context(),
		`UPDATE notification_channels SET enabled = NOT enabled WHERE id=?`, id,
	)
	if err != nil {
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleNotificationEventList(w http.ResponseWriter, r *http.Request) {
	rows, err := s.db.SQL.QueryContext(r.Context(),
		`SELECT id, channel_id, severity, title, message, sent, created_at
		 FROM notification_events ORDER BY id DESC LIMIT 200`,
	)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode([]notificationEvent{}) //nolint:errcheck
		return
	}
	defer rows.Close()

	var events []notificationEvent
	for rows.Next() {
		var e notificationEvent
		rows.Scan(&e.ID, &e.ChannelID, &e.Severity, &e.Title, &e.Message, &e.Sent, &e.CreatedAt) //nolint:errcheck
		events = append(events, e)
	}
	if events == nil {
		events = []notificationEvent{}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(events) //nolint:errcheck
}

func (s *Server) handleNotificationTest(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		http.Error(w, "bad id", http.StatusBadRequest)
		return
	}

	var channelType, name, config string
	err = s.db.SQL.QueryRowContext(r.Context(),
		`SELECT type, name, config FROM notification_channels WHERE id=?`, id,
	).Scan(&channelType, &name, &config)
	if err != nil {
		http.Error(w, "channel not found", http.StatusNotFound)
		return
	}

	// Actually attempt delivery
	deliveryErr := s.deliverNotification(channelType, config, "info", "Test Notification",
		"Test notification sent from Orbit VPS to channel: "+name)

	sent := deliveryErr == nil
	errMsg := ""
	if deliveryErr != nil {
		errMsg = deliveryErr.Error()
	}

	s.db.SQL.ExecContext(r.Context(), //nolint:errcheck
		`INSERT INTO notification_events (channel_id, severity, title, message, sent)
		 VALUES (?, 'info', 'Test Notification', ?, ?)`,
		id, "Test notification sent from Orbit VPS to channel: "+name, sent,
	)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{ //nolint:errcheck
		"ok":      sent,
		"channel": name,
		"type":    channelType,
		"error":   errMsg,
	})
}

// ── Delivery Engine ───────────────────────────────────────────────────────────

// DispatchNotification looks up all enabled channels and delivers a notification to each.
func (s *Server) DispatchNotification(severity, title, message string) {
	rows, err := s.db.SQL.Query(
		`SELECT id, type, config FROM notification_channels WHERE enabled=1`,
	)
	if err != nil {
		return
	}
	defer rows.Close()

	type ch struct {
		id      int64
		chType  string
		config  string
	}
	var channels []ch
	for rows.Next() {
		var c ch
		rows.Scan(&c.id, &c.chType, &c.config) //nolint:errcheck
		channels = append(channels, c)
	}
	rows.Close()

	for _, c := range channels {
		err := s.deliverNotification(c.chType, c.config, severity, title, message)
		sent := err == nil
		s.db.SQL.Exec( //nolint:errcheck
			`INSERT INTO notification_events (channel_id, severity, title, message, sent)
			 VALUES (?,?,?,?,?)`,
			c.id, severity, title, message, sent,
		)
	}
}

// deliverNotification dispatches a single notification to one channel.
func (s *Server) deliverNotification(channelType, configJSON, severity, title, message string) error {
	var cfg map[string]string
	if err := json.Unmarshal([]byte(configJSON), &cfg); err != nil {
		cfg = map[string]string{}
	}

	switch strings.ToLower(channelType) {
	case "slack":
		return deliverSlack(cfg, title, message, severity)
	case "discord":
		return deliverDiscord(cfg, title, message, severity)
	case "telegram":
		return deliverTelegram(cfg, title, message)
	case "pagerduty":
		return deliverPagerDuty(cfg, title, message, severity)
	case "smtp", "email":
		return deliverSMTP(cfg, title, message)
	case "webhook":
		return deliverWebhook(cfg, title, message, severity)
	default:
		return fmt.Errorf("unknown channel type: %s", channelType)
	}
}

// ── Slack ─────────────────────────────────────────────────────────────────────

func deliverSlack(cfg map[string]string, title, message, severity string) error {
	webhookURL := cfg["webhook_url"]
	if webhookURL == "" {
		return fmt.Errorf("slack: webhook_url not configured")
	}
	color := severityColor(severity)
	payload := map[string]interface{}{
		"username":   "Orbit VPS",
		"icon_emoji": ":satellite:",
		"attachments": []map[string]interface{}{
			{
				"color":  color,
				"title":  title,
				"text":   message,
				"footer": "Orbit VPS",
				"ts":     time.Now().Unix(),
			},
		},
	}
	return postJSON(webhookURL, payload)
}

// ── Discord ───────────────────────────────────────────────────────────────────

func deliverDiscord(cfg map[string]string, title, message, severity string) error {
	webhookURL := cfg["webhook_url"]
	if webhookURL == "" {
		return fmt.Errorf("discord: webhook_url not configured")
	}
	color := severityColorInt(severity)
	payload := map[string]interface{}{
		"username": "Orbit VPS",
		"embeds": []map[string]interface{}{
			{
				"title":       title,
				"description": message,
				"color":       color,
				"timestamp":   time.Now().UTC().Format(time.RFC3339),
				"footer":      map[string]string{"text": "Orbit VPS"},
			},
		},
	}
	return postJSON(webhookURL, payload)
}

// ── Telegram ──────────────────────────────────────────────────────────────────

func deliverTelegram(cfg map[string]string, title, message string) error {
	botToken := cfg["bot_token"]
	chatID := cfg["chat_id"]
	if botToken == "" || chatID == "" {
		return fmt.Errorf("telegram: bot_token and chat_id are required")
	}
	text := fmt.Sprintf("*%s*\n%s", escapeMarkdownV2(title), escapeMarkdownV2(message))
	url := fmt.Sprintf("https://api.telegram.org/bot%s/sendMessage", botToken)
	payload := map[string]interface{}{
		"chat_id":    chatID,
		"text":       text,
		"parse_mode": "MarkdownV2",
	}
	return postJSON(url, payload)
}

func escapeMarkdownV2(s string) string {
	special := []string{"_", "*", "[", "]", "(", ")", "~", "`", ">", "#", "+", "-", "=", "|", "{", "}", ".", "!"}
	for _, ch := range special {
		s = strings.ReplaceAll(s, ch, "\\"+ch)
	}
	return s
}

// ── PagerDuty ─────────────────────────────────────────────────────────────────

func deliverPagerDuty(cfg map[string]string, title, message, severity string) error {
	routingKey := cfg["routing_key"]
	if routingKey == "" {
		return fmt.Errorf("pagerduty: routing_key not configured")
	}
	pdSeverity := "info"
	switch severity {
	case "critical":
		pdSeverity = "critical"
	case "error":
		pdSeverity = "error"
	case "warning", "warn":
		pdSeverity = "warning"
	}
	payload := map[string]interface{}{
		"routing_key":  routingKey,
		"event_action": "trigger",
		"payload": map[string]interface{}{
			"summary":   title,
			"severity":  pdSeverity,
			"source":    "Orbit VPS",
			"custom_details": map[string]string{
				"message": message,
			},
			"timestamp": time.Now().UTC().Format(time.RFC3339),
		},
	}
	return postJSON("https://events.pagerduty.com/v2/enqueue", payload)
}

// ── SMTP ──────────────────────────────────────────────────────────────────────

func deliverSMTP(cfg map[string]string, title, message string) error {
	host := cfg["host"]
	port := cfg["port"]
	username := cfg["username"]
	password := cfg["password"]
	from := cfg["from"]
	to := cfg["to"]

	if host == "" || to == "" {
		return fmt.Errorf("smtp: host and to are required")
	}
	if port == "" {
		port = "587"
	}
	if from == "" {
		from = "orbit@localhost"
	}

	addr := host + ":" + port
	body := fmt.Sprintf("From: %s\r\nTo: %s\r\nSubject: [Orbit VPS] %s\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n%s",
		from, to, title, message)

	var auth smtp.Auth
	if username != "" && password != "" {
		auth = smtp.PlainAuth("", username, password, host)
	}

	return smtp.SendMail(addr, auth, from, []string{to}, []byte(body))
}

// ── Generic Webhook ───────────────────────────────────────────────────────────

func deliverWebhook(cfg map[string]string, title, message, severity string) error {
	url := cfg["url"]
	if url == "" {
		return fmt.Errorf("webhook: url not configured")
	}
	payload := map[string]interface{}{
		"title":    title,
		"message":  message,
		"severity": severity,
		"ts":       time.Now().Unix(),
		"source":   "Orbit VPS",
	}
	return postJSON(url, payload)
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

func postJSON(url string, payload interface{}) error {
	data, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal error: %w", err)
	}
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Post(url, "application/json", bytes.NewReader(data))
	if err != nil {
		return fmt.Errorf("post error: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return fmt.Errorf("upstream error %d", resp.StatusCode)
	}
	return nil
}

func severityColor(severity string) string {
	switch severity {
	case "critical":
		return "#FF0000"
	case "error":
		return "#FF4500"
	case "warning", "warn":
		return "#FFA500"
	case "success", "ok":
		return "#36A64F"
	default:
		return "#439FE0"
	}
}

func severityColorInt(severity string) int {
	switch severity {
	case "critical":
		return 0xFF0000
	case "error":
		return 0xFF4500
	case "warning", "warn":
		return 0xFFA500
	case "success", "ok":
		return 0x36A64F
	default:
		return 0x439FE0
	}
}
