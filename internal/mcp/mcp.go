// Package mcp implements the Orbit MCP server stub.
package mcp

import (
	"context"
	"net"
	"os"
	"path/filepath"

	"github.com/KenyanRedwoods01/Orbit/internal/config"
	"github.com/KenyanRedwoods01/Orbit/internal/db"
)

// Server wraps the MCP server.
type Server struct {
	cfg *config.MCPConfig
	db  *db.DB
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

func (s *Server) serve(ctx context.Context, _ net.Listener) error {
	<-ctx.Done()
	return nil
}
