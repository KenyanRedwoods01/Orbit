// Package mcp implements the Orbit MCP server for AI agent integration.
// MCP (Model Context Protocol) provides a JSON-RPC interface for AI agents
// to query server state and execute approved operations.
package mcp

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/KenyanRedwoods01/Orbit/internal/config"
	"github.com/KenyanRedwoods01/Orbit/internal/db"
)

// Server wraps the MCP server.
type Server struct {
	cfg *config.MCPConfig
	db  *db.DB
	mu  sync.Mutex
}

// NewServer creates the MCP server.
func NewServer(cfg *config.MCPConfig, database *db.DB) (*Server, error) {
	return &Server{cfg: cfg, db: database}, nil
}

// ListenUnix starts the MCP server on a Unix domain socket.
func (s *Server) ListenUnix(ctx context.Context) error {
	if err := os.MkdirAll(filepath.Dir(s.cfg.SocketPath), 0o750); err != nil {
		return err
	}
	_ = os.Remove(s.cfg.SocketPath)
	l, err := net.Listen("unix", s.cfg.SocketPath)
	if err != nil {
		return err
	}
	defer l.Close()
	return s.serve(ctx, l)
}

// ListenTCP starts the MCP server on a TCP address.
func (s *Server) ListenTCP(ctx context.Context, addr string) error {
	l, err := net.Listen("tcp", addr)
	if err != nil {
		return err
	}
	defer l.Close()
	return s.serve(ctx, l)
}

// ── JSON-RPC types ─────────────────────────────────────────────────────────────

type rpcRequest struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params,omitempty"`
}

type rpcResponse struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id"`
	Result  interface{}     `json:"result,omitempty"`
	Error   *rpcError       `json:"error,omitempty"`
}

type rpcError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

func (s *Server) serve(ctx context.Context, l net.Listener) error {
	log.Printf("[mcp] listening on %s", l.Addr())

	var wg sync.WaitGroup
	for {
		conn, err := l.Accept()
		if err != nil {
			select {
			case <-ctx.Done():
				wg.Wait()
				return nil
			default:
				log.Printf("[mcp] accept error: %v", err)
				continue
			}
		}
		wg.Add(1)
		go func(c net.Conn) {
			defer wg.Done()
			defer c.Close()
			s.handleConn(ctx, c)
		}(conn)
	}
}

func (s *Server) handleConn(ctx context.Context, conn net.Conn) {
	scanner := bufio.NewScanner(conn)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}

		var req rpcRequest
		if err := json.Unmarshal([]byte(line), &req); err != nil {
			writeError(conn, nil, -32700, "Parse error")
			continue
		}

		resp := s.handleRPC(ctx, &req)
		data, _ := json.Marshal(resp)
		fmt.Fprintf(conn, "%s\n", data)
	}
}

func (s *Server) handleRPC(ctx context.Context, req *rpcRequest) *rpcResponse {
	switch req.Method {
	case "ping":
		return &rpcResponse{JSONRPC: "2.0", ID: req.ID, Result: "pong"}
	case "server.info":
		return s.rpcServerInfo(ctx, req)
	case "server.metrics":
		return s.rpcServerMetrics(ctx, req)
	case "server.processes":
		return s.rpcServerProcesses(ctx, req)
	default:
		return &rpcResponse{JSONRPC: "2.0", ID: req.ID, Error: &rpcError{Code: -32601, Message: fmt.Sprintf("Method not found: %s", req.Method)}}
	}
}

func (s *Server) rpcServerInfo(ctx context.Context, req *rpcRequest) *rpcResponse {
	hostname, _ := os.Hostname()
	info := map[string]interface{}{
		"hostname": hostname,
		"version":  "0.1.0",
		"uptime":   time.Now().Unix(),
	}
	return &rpcResponse{JSONRPC: "2.0", ID: req.ID, Result: info}
}

func (s *Server) rpcServerMetrics(ctx context.Context, req *rpcRequest) *rpcResponse {
	return &rpcResponse{JSONRPC: "2.0", ID: req.ID, Result: map[string]string{"status": "not implemented"}}
}

func (s *Server) rpcServerProcesses(ctx context.Context, req *rpcRequest) *rpcResponse {
	return &rpcResponse{JSONRPC: "2.0", ID: req.ID, Result: map[string]string{"status": "not implemented"}}
}

func writeError(conn net.Conn, id json.RawMessage, code int, msg string) {
	resp := rpcResponse{JSONRPC: "2.0", ID: id, Error: &rpcError{Code: code, Message: msg}}
	data, _ := json.Marshal(resp)
	fmt.Fprintf(conn, "%s\n", data)
}
