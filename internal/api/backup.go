package api

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"time"
)

type backupConfig struct {
	ID         int64  `json:"id"`
	Name       string `json:"name"`
	SourcePath string `json:"source_path"`
	DestPath   string `json:"dest_path"`
	Schedule   string `json:"schedule"`
	Retention  int    `json:"retention"`
	Compress   bool   `json:"compress"`
	Enabled    bool   `json:"enabled"`
	CreatedAt  int64  `json:"created_at"`
	LastRunAt  *int64 `json:"last_run_at,omitempty"`
}

type backupRun struct {
	ID        int64  `json:"id"`
	ConfigID  int64  `json:"config_id"`
	Status    string `json:"status"`
	SizeBytes *int64 `json:"size_bytes,omitempty"`
	Output    string `json:"output"`
	StartedAt int64  `json:"started_at"`
	EndedAt   *int64 `json:"ended_at,omitempty"`
}

func (s *Server) handleBackupList(w http.ResponseWriter, r *http.Request) {
	rows, err := s.db.SQL.QueryContext(r.Context(),
		`SELECT id, name, source_path, dest_path, schedule, retention, compress, enabled, created_at, last_run_at
		 FROM backup_configs ORDER BY id DESC`,
	)
	if err != nil {
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var configs []backupConfig
	for rows.Next() {
		var c backupConfig
		var compressInt, enabledInt int
		rows.Scan(&c.ID, &c.Name, &c.SourcePath, &c.DestPath, &c.Schedule, //nolint:errcheck
			&c.Retention, &compressInt, &enabledInt, &c.CreatedAt, &c.LastRunAt)
		c.Compress = compressInt == 1
		c.Enabled = enabledInt == 1
		configs = append(configs, c)
	}
	if configs == nil {
		configs = []backupConfig{}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(configs) //nolint:errcheck
}

func (s *Server) handleBackupCreate(w http.ResponseWriter, r *http.Request) {
	var req backupConfig
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	if req.Name == "" || req.SourcePath == "" || req.DestPath == "" {
		http.Error(w, "name, source_path, and dest_path are required", http.StatusBadRequest)
		return
	}
	// Sandbox paths through safeRoot to prevent path traversal outside data dir.
	if _, err := s.safeRoot(req.SourcePath); err != nil {
		http.Error(w, "source_path: "+err.Error(), http.StatusBadRequest)
		return
	}
	if _, err := s.safeRoot(req.DestPath); err != nil {
		http.Error(w, "dest_path: "+err.Error(), http.StatusBadRequest)
		return
	}
	if req.Retention == 0 {
		req.Retention = 7
	}
	if req.Schedule == "" {
		req.Schedule = "@daily"
	}

	compressInt := 0
	if req.Compress {
		compressInt = 1
	}
	res, err := s.db.SQL.ExecContext(r.Context(),
		`INSERT INTO backup_configs (name, source_path, dest_path, schedule, retention, compress, enabled)
		 VALUES (?, ?, ?, ?, ?, ?, 1)`,
		req.Name, req.SourcePath, req.DestPath, req.Schedule, req.Retention, compressInt,
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

func (s *Server) handleBackupUpdate(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		http.Error(w, "bad id", http.StatusBadRequest)
		return
	}

	var req backupConfig
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	if req.SourcePath != "" {
		if _, err := s.safeRoot(req.SourcePath); err != nil {
			http.Error(w, "source_path: "+err.Error(), http.StatusBadRequest)
			return
		}
	}
	if req.DestPath != "" {
		if _, err := s.safeRoot(req.DestPath); err != nil {
			http.Error(w, "dest_path: "+err.Error(), http.StatusBadRequest)
			return
		}
	}
	compressInt := 0
	if req.Compress {
		compressInt = 1
	}
	enabledInt := 0
	if req.Enabled {
		enabledInt = 1
	}
	_, err = s.db.SQL.ExecContext(r.Context(),
		`UPDATE backup_configs SET name=?, source_path=?, dest_path=?, schedule=?, retention=?, compress=?, enabled=?
		 WHERE id=?`,
		req.Name, req.SourcePath, req.DestPath, req.Schedule, req.Retention, compressInt, enabledInt, id,
	)
	if err != nil {
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}
	req.ID = id
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(req) //nolint:errcheck
}

func (s *Server) handleBackupDelete(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		http.Error(w, "bad id", http.StatusBadRequest)
		return
	}
	_, err = s.db.SQL.ExecContext(r.Context(), `DELETE FROM backup_configs WHERE id=?`, id)
	if err != nil {
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleBackupRun(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		http.Error(w, "bad id", http.StatusBadRequest)
		return
	}

	var cfg backupConfig
	var compressInt int
	err = s.db.SQL.QueryRowContext(r.Context(),
		`SELECT id, name, source_path, dest_path, retention, compress FROM backup_configs WHERE id=?`, id,
	).Scan(&cfg.ID, &cfg.Name, &cfg.SourcePath, &cfg.DestPath, &cfg.Retention, &compressInt)
	if err != nil {
		http.Error(w, "config not found", http.StatusNotFound)
		return
	}
	cfg.Compress = compressInt == 1

	runID := s.triggerBackup(cfg)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]int64{"run_id": runID}) //nolint:errcheck
}

func (s *Server) triggerBackup(cfg backupConfig) int64 {
	res, _ := s.db.SQL.Exec(
		`INSERT INTO backup_runs (config_id, status, started_at) VALUES (?, 'running', unixepoch())`, cfg.ID,
	)
	runID, _ := res.LastInsertId()

	go func() {
		// Validate paths at runtime as defense-in-depth
		if _, err := s.safeRoot(cfg.SourcePath); err != nil {
			now := time.Now().Unix()
			s.db.SQL.Exec(`UPDATE backup_runs SET status='error', output=?, ended_at=? WHERE id=?`,
				"source_path: "+err.Error(), now, runID)
			return
		}
		if _, err := s.safeRoot(cfg.DestPath); err != nil {
			now := time.Now().Unix()
			s.db.SQL.Exec(`UPDATE backup_runs SET status='error', output=?, ended_at=? WHERE id=?`,
				"dest_path: "+err.Error(), now, runID)
			return
		}
		var out bytes.Buffer
		var sizeBytes int64

		if err := os.MkdirAll(cfg.DestPath, 0o755); err != nil {
			now := time.Now().Unix()
			s.db.SQL.Exec(`UPDATE backup_runs SET status='error', output=?, ended_at=? WHERE id=?`, //nolint:errcheck
				"failed to create destination directory", now, runID)
			return
		}

		timestamp := time.Now().Format("20060102-150405")
		var cmd *exec.Cmd

		if cfg.Compress {
			archiveName := filepath.Join(cfg.DestPath,
				fmt.Sprintf("%s-%s.tar.gz", filepath.Base(cfg.SourcePath), timestamp))
			cmd = exec.Command("tar", "-czf", archiveName, "-C",
				filepath.Dir(cfg.SourcePath), filepath.Base(cfg.SourcePath))
			cmd.Stdout = &out
			cmd.Stderr = &out
			if err := cmd.Run(); err == nil {
				if fi, statErr := os.Stat(archiveName); statErr == nil {
					sizeBytes = fi.Size()
				}
			}
		} else {
			destDir := filepath.Join(cfg.DestPath, timestamp)
			cmd = exec.Command("rsync", "-av", "--delete", cfg.SourcePath+"/", destDir)
			cmd.Stdout = &out
			cmd.Stderr = &out
			cmd.Run() //nolint:errcheck
			sizeOut, _ := exec.Command("du", "-sb", destDir).Output()
			fmt.Sscanf(string(sizeOut), "%d", &sizeBytes)
		}

		status := "ok"
		if cmd.ProcessState != nil && cmd.ProcessState.ExitCode() != 0 {
			status = "error"
		}

		s.pruneBackups(cfg)

		now := time.Now().Unix()
		s.db.SQL.Exec( //nolint:errcheck
			`UPDATE backup_runs SET status=?, size_bytes=?, output=?, ended_at=? WHERE id=?`,
			status, sizeBytes, out.String(), now, runID,
		)
		s.db.SQL.Exec(`UPDATE backup_configs SET last_run_at=? WHERE id=?`, now, cfg.ID) //nolint:errcheck
	}()
	return runID
}

func (s *Server) pruneBackups(cfg backupConfig) {
	entries, err := os.ReadDir(cfg.DestPath)
	if err != nil {
		return
	}
	base := filepath.Base(cfg.SourcePath)
	var matches []os.DirEntry
	for _, e := range entries {
		if len(e.Name()) > len(base) && e.Name()[:len(base)] == base {
			matches = append(matches, e)
		}
	}
	for len(matches) > cfg.Retention {
		oldest := matches[0]
		matches = matches[1:]
		os.RemoveAll(filepath.Join(cfg.DestPath, oldest.Name())) //nolint:errcheck
	}
}

func (s *Server) handleBackupRuns(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		http.Error(w, "bad id", http.StatusBadRequest)
		return
	}

	rows, err := s.db.SQL.QueryContext(r.Context(),
		`SELECT id, config_id, status, size_bytes, COALESCE(output,''), started_at, ended_at
		 FROM backup_runs WHERE config_id=? ORDER BY id DESC LIMIT 50`,
		id,
	)
	if err != nil {
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var runs []backupRun
	for rows.Next() {
		var run backupRun
		rows.Scan(&run.ID, &run.ConfigID, &run.Status, &run.SizeBytes, &run.Output, &run.StartedAt, &run.EndedAt) //nolint:errcheck
		runs = append(runs, run)
	}
	if runs == nil {
		runs = []backupRun{}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(runs) //nolint:errcheck
}

func (s *Server) handleBackupRunGet(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("run_id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		http.Error(w, "bad id", http.StatusBadRequest)
		return
	}

	var run backupRun
	err = s.db.SQL.QueryRowContext(r.Context(),
		`SELECT id, config_id, status, size_bytes, COALESCE(output,''), started_at, ended_at FROM backup_runs WHERE id=?`,
		id,
	).Scan(&run.ID, &run.ConfigID, &run.Status, &run.SizeBytes, &run.Output, &run.StartedAt, &run.EndedAt)
	if err != nil {
		http.Error(w, "run not found", http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(run) //nolint:errcheck
}

// ── Backup Scheduler ────────────────────────────────────────────────────────

// runBackupScheduler automatically triggers enabled backup configs on schedule.
func (s *Server) runBackupScheduler(ctx context.Context) {
	for {
		now := time.Now()
		next := now.Truncate(time.Minute).Add(time.Minute)
		select {
		case <-ctx.Done():
			return
		case <-time.After(time.Until(next)):
		}

		t := time.Now().Truncate(time.Minute)
		rows, err := s.db.SQL.QueryContext(ctx,
			`SELECT id, name, source_path, dest_path, schedule, retention, compress
			 FROM backup_configs WHERE enabled=1`)
		if err != nil {
			continue
		}
		var configs []backupConfig
		for rows.Next() {
			var c backupConfig
			var compressInt int
			rows.Scan(&c.ID, &c.Name, &c.SourcePath, &c.DestPath, &c.Schedule, &c.Retention, &compressInt) //nolint:errcheck
			c.Compress = compressInt == 1
			configs = append(configs, c)
		}
		rows.Close()

		for _, cfg := range configs {
			if matchesCron(cfg.Schedule, t) {
				go s.triggerBackup(cfg)
			}
		}
	}
}
