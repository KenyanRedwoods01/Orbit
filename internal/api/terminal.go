package api

import (
	"encoding/json"
	"io"
	"net/http"
	"os"
	"os/exec"
	"time"

	"github.com/creack/pty"
	"github.com/gorilla/websocket"
)

// handleTerminalWS opens a WebSocket PTY session to a local shell.
// Protocol (text frames):
//
//	client -> server: raw input bytes (forwarded to shell stdin via PTY)
//	client -> server: JSON {"type":"resize","cols":N,"rows":N}
//	server -> client: JSON {"type":"output","data":"<raw bytes>"}
//	server -> client: JSON {"type":"exit","data":"shell exited"}
func (s *Server) handleTerminalWS(w http.ResponseWriter, r *http.Request) {
	conn, err := wsUpgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer conn.Close()

	shell := "/bin/bash"
	if _, err := os.Stat(shell); err != nil {
		shell = "/bin/sh"
	}

	cmd := exec.CommandContext(r.Context(), shell)
	cmd.Env = append(os.Environ(),
		"TERM=xterm-256color",
		"COLORTERM=truecolor",
		"PS1=\\[\\033[01;32m\\]\\u@\\h\\[\\033[00m\\]:\\[\\033[01;34m\\]\\w\\[\\033[00m\\]\\$ ",
	)

	ptmx, err := pty.Start(cmd)
	if err != nil {
		conn.WriteMessage(websocket.TextMessage, jsonMsg("error", "failed to start PTY: "+err.Error())) //nolint:errcheck
		return
	}
	defer func() {
		ptmx.Close()
		cmd.Wait() //nolint:errcheck
	}()

	// Set initial window size
	pty.Setsize(ptmx, &pty.Winsize{Rows: 24, Cols: 80}) //nolint:errcheck

	// Goroutine: read PTY output → WebSocket
	go func() {
		buf := make([]byte, 4096)
		for {
			n, err := ptmx.Read(buf)
			if n > 0 {
				msg, _ := json.Marshal(map[string]string{
					"type": "output",
					"data": string(buf[:n]),
				})
				if writeErr := conn.WriteMessage(websocket.TextMessage, msg); writeErr != nil {
					return
				}
			}
			if err == io.EOF || err != nil {
				conn.WriteMessage(websocket.TextMessage, jsonMsg("exit", "shell exited")) //nolint:errcheck
				return
			}
		}
	}()

	// Main loop: read WebSocket input → PTY stdin
	conn.SetReadDeadline(time.Time{})
	for {
		_, msg, err := conn.ReadMessage()
		if err != nil {
			break
		}

		// Detect resize JSON: {"type":"resize","cols":N,"rows":N}
		var ctrl struct {
			Type string `json:"type"`
			Cols uint16 `json:"cols"`
			Rows uint16 `json:"rows"`
		}
		if json.Unmarshal(msg, &ctrl) == nil && ctrl.Type == "resize" && ctrl.Cols > 0 && ctrl.Rows > 0 {
			pty.Setsize(ptmx, &pty.Winsize{Rows: ctrl.Rows, Cols: ctrl.Cols}) //nolint:errcheck
			continue
		}

		// Forward raw input to PTY
		if _, err := ptmx.Write(msg); err != nil {
			break
		}
	}
}

func jsonMsg(msgType, text string) []byte {
	b, _ := json.Marshal(map[string]string{"type": msgType, "data": text})
	return b
}
