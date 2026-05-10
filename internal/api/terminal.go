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

// stripDangerousESC removes terminal escape sequences that could be abused
// for command injection or information exfiltration (iTerm2 conductor protocol,
// hyperlinks, clipboard access, etc.). It preserves normal ANSI color/graphics.
func stripDangerousESC(data []byte) []byte {
	var out []byte
	for i := 0; i < len(data); i++ {
		if data[i] == 0x1b { // ESC
			if i+1 < len(data) {
				switch data[i+1] {
				case 'P', // DCS (Device Control String) — iTerm2 conductor, etc.
					']', // OSC (Operating System Command) — hyperlinks, clipboard
					'X', // SOS (Start of String)
					'^', // PM (Privacy Message)
					'_': // APC (Application Program Command)
					// Skip until ST (String Terminator: ESC \ or 0x07 for OSC)
					i += 2
					for i < len(data) {
						if data[i] == 0x07 {
							break
						}
						if data[i] == 0x1b && i+1 < len(data) && data[i+1] == '\\' {
							i += 2
							break
						}
						i++
					}
					continue
				}
			}
		}
		out = append(out, data[i])
	}
	return out
}

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
				sanitized := stripDangerousESC(buf[:n])
				msg, _ := json.Marshal(map[string]string{
					"type": "output",
					"data": string(sanitized),
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

	// Main loop: read WebSocket input → PTY stdin, with periodic session aliveness check
	conn.SetReadDeadline(time.Time{})
	sessionAliveTicker := time.NewTicker(30 * time.Second)
	defer sessionAliveTicker.Stop()
	type msgOrErr struct {
		msg []byte
		err error
	}
	readCh := make(chan msgOrErr, 4)
	go func() {
		for {
			_, msg, err := conn.ReadMessage()
			readCh <- msgOrErr{msg, err}
			if err != nil {
				return
			}
		}
	}()
	for {
		select {
		case <-sessionAliveTicker.C:
			// Verify session is still valid in DB
			cookie, err := r.Cookie("orbit_session")
			if err != nil {
				return
			}
			tokenHash := hashSHA256Hex(cookie.Value)
			var expiresAt int64
			if s.db.SQL.QueryRowContext(r.Context(),
				`SELECT expires_at FROM sessions WHERE token_hash=?`, tokenHash,
			).Scan(&expiresAt); err != nil || expiresAt < time.Now().Unix() {
				conn.WriteMessage(websocket.TextMessage, jsonMsg("exit", "session expired"))
				return
			}
		case m := <-readCh:
			if m.err != nil {
				return
			}
			msg := m.msg

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
				return
			}
	}
}

func jsonMsg(msgType, text string) []byte {
	b, _ := json.Marshal(map[string]string{"type": msgType, "data": text})
	return b
}
