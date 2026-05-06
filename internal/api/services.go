package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os/exec"
	"strings"
	"time"

	"github.com/gorilla/websocket"
)

type serviceInfo struct {
	Name        string  `json:"name"`
	Description string  `json:"description"`
	LoadState   string  `json:"load_state"`
	ActiveState string  `json:"active_state"`
	SubState    string  `json:"sub_state"`
	Status      string  `json:"status"`
	CpuPct      float64 `json:"cpu_pct"`
	MemBytes    int64   `json:"mem_bytes"`
}

type serviceDetail struct {
	serviceInfo
	MainPID      string `json:"main_pid"`
	Memory       string `json:"memory"`
	CPUUsage     string `json:"cpu_usage"`
	FragmentPath string `json:"fragment_path"`
	StartedAt    string `json:"started_at"`
	TasksCurrent string `json:"tasks_current"`
}

func activeStateToStatus(active string) string {
	switch active {
	case "active":
		return "active"
	case "inactive":
		return "inactive"
	case "failed":
		return "failed"
	default:
		return "unknown"
	}
}

func listSystemdServices() ([]serviceInfo, error) {
	out, err := exec.Command("systemctl", "list-units", "--type=service", "--no-pager", "--no-legend", "--all").Output()
	if err != nil {
		return []serviceInfo{}, nil
	}

	var services []serviceInfo
	for _, line := range strings.Split(string(out), "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) < 4 {
			continue
		}
		name := strings.TrimPrefix(fields[0], "●")
		name = strings.TrimSpace(name)
		desc := ""
		if len(fields) >= 5 {
			desc = strings.Join(fields[4:], " ")
		}
		active := fields[2]
		services = append(services, serviceInfo{
			Name:        name,
			LoadState:   fields[1],
			ActiveState: active,
			SubState:    fields[3],
			Description: desc,
			Status:      activeStateToStatus(active),
			CpuPct:      0,
			MemBytes:    0,
		})
	}
	return services, nil
}

func (s *Server) handleServiceList(w http.ResponseWriter, r *http.Request) {
	services, err := listSystemdServices()
	if err != nil {
		http.Error(w, "failed to list services", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(services) //nolint:errcheck
}

func (s *Server) handleServiceDetail(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	out, err := exec.Command("systemctl", "show", name, "--no-pager").Output()
	if err != nil {
		http.Error(w, "service not found", http.StatusNotFound)
		return
	}

	detail := serviceDetail{}
	detail.Name = name
	for _, line := range strings.Split(string(out), "\n") {
		parts := strings.SplitN(line, "=", 2)
		if len(parts) != 2 {
			continue
		}
		key, val := parts[0], parts[1]
		switch key {
		case "Description":
			detail.Description = val
		case "LoadState":
			detail.LoadState = val
		case "ActiveState":
			detail.ActiveState = val
			detail.Status = activeStateToStatus(val)
		case "SubState":
			detail.SubState = val
		case "MainPID":
			detail.MainPID = val
		case "MemoryCurrent":
			detail.Memory = val
		case "CPUUsageNSec":
			detail.CPUUsage = val
		case "FragmentPath":
			detail.FragmentPath = val
		case "TasksCurrent":
			detail.TasksCurrent = val
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(detail) //nolint:errcheck
}

func (s *Server) handleServiceStart(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	out, err := exec.Command("systemctl", "start", name).CombinedOutput()
	if err != nil {
		http.Error(w, fmt.Sprintf("failed to start %s: %s", name, string(out)), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleServiceStop(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	out, err := exec.Command("systemctl", "stop", name).CombinedOutput()
	if err != nil {
		http.Error(w, fmt.Sprintf("failed to stop %s: %s", name, string(out)), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleServiceRestart(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	out, err := exec.Command("systemctl", "restart", name).CombinedOutput()
	if err != nil {
		http.Error(w, fmt.Sprintf("failed to restart %s: %s", name, string(out)), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleServiceEnable(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	out, err := exec.Command("systemctl", "enable", name).CombinedOutput()
	if err != nil {
		http.Error(w, fmt.Sprintf("failed to enable %s: %s", name, string(out)), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleServiceDisable(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	out, err := exec.Command("systemctl", "disable", name).CombinedOutput()
	if err != nil {
		http.Error(w, fmt.Sprintf("failed to disable %s: %s", name, string(out)), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// handleServiceLogsWS streams journalctl output for a service over WebSocket.
func (s *Server) handleServiceLogsWS(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")

	conn, err := wsUpgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer conn.Close()

	lines := r.URL.Query().Get("lines")
	if lines == "" {
		lines = "200"
	}

	cmd := exec.CommandContext(r.Context(), "journalctl", "-u", name,
		"--no-pager", "-n", lines, "--follow", "--output=short-iso")
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		conn.WriteMessage(websocket.TextMessage, []byte(`{"error":"cannot get journal"}`)) //nolint:errcheck
		return
	}
	cmd.Stderr = cmd.Stdout
	if err := cmd.Start(); err != nil {
		conn.WriteMessage(websocket.TextMessage, []byte(`{"line":"[journalctl not available on this system]"}`)) //nolint:errcheck
		return
	}
	defer cmd.Wait() //nolint:errcheck

	buf := make([]byte, 4096)
	for {
		n, readErr := stdout.Read(buf)
		if n > 0 {
			for _, line := range strings.Split(string(buf[:n]), "\n") {
				if line == "" {
					continue
				}
				data, _ := json.Marshal(map[string]string{"line": line})
				if writeErr := conn.WriteMessage(websocket.TextMessage, data); writeErr != nil {
					return
				}
			}
		}
		if readErr != nil {
			return
		}
		select {
		case <-r.Context().Done():
			return
		default:
		}
	}
}

// handleServiceLogsPoll returns the last N lines of journal for a service (non-streaming REST).
func (s *Server) handleServiceLogsPoll(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	lines := r.URL.Query().Get("lines")
	if lines == "" {
		lines = "500"
	}

	out, err := exec.Command("journalctl", "-u", name, "--no-pager", "-n", lines, "--output=short-iso").Output()
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string][]string{"lines": {}}) //nolint:errcheck
		return
	}

	var logLines []string
	for _, line := range strings.Split(string(out), "\n") {
		if line != "" {
			logLines = append(logLines, line)
		}
	}
	if logLines == nil {
		logLines = []string{}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"lines":     logLines,
		"service":   name,
		"timestamp": time.Now().Unix(),
	}) //nolint:errcheck
}
