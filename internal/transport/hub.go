// Package transport manages WebSocket connections for live metric and log streaming.
package transport

import (
	"encoding/json"
	"net/http"
	"strings"
	"sync"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		origin := r.Header.Get("Origin")
		if origin == "" {
			return false
		}
		host := r.Host
		originHost := strings.TrimPrefix(strings.TrimPrefix(origin, "https://"), "http://")
		originHost = strings.Split(originHost, ":")[0]
		requestHost := strings.Split(host, ":")[0]
		// Only allow same-origin or localhost connections
		if strings.EqualFold(originHost, requestHost) {
			return true
		}
		// Allow loopback for dev
		if originHost == "localhost" || originHost == "127.0.0.1" {
			return true
		}
		return false
	},
}

// Message is the JSON envelope sent over the WebSocket connection.
type Message struct {
	Type    string          `json:"type"`    // "metrics" | "log" | "alert" | "ping"
	Payload json.RawMessage `json:"payload"` // module-specific payload
	TS      int64           `json:"ts"`      // Unix timestamp (ms)
}

// Hub manages a set of active WebSocket connections and broadcasts messages.
type Hub struct {
	mu      sync.Mutex
	clients map[*websocket.Conn]struct{}
}

// NewHub creates an empty Hub.
func NewHub() *Hub {
	return &Hub{clients: make(map[*websocket.Conn]struct{})}
}

// Upgrade upgrades an HTTP connection to WebSocket and registers it with the hub.
func (h *Hub) Upgrade(w http.ResponseWriter, r *http.Request) (*websocket.Conn, error) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return nil, err
	}
	h.mu.Lock()
	h.clients[conn] = struct{}{}
	h.mu.Unlock()
	return conn, nil
}

// Broadcast sends a message to all connected clients.
func (h *Hub) Broadcast(msg Message) {
	data, err := json.Marshal(msg)
	if err != nil {
		return
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	for conn := range h.clients {
		if err := conn.WriteMessage(websocket.TextMessage, data); err != nil {
			conn.Close()
			delete(h.clients, conn)
		}
	}
}

// Remove removes a connection from the hub.
func (h *Hub) Remove(conn *websocket.Conn) {
	h.mu.Lock()
	delete(h.clients, conn)
	h.mu.Unlock()
}
