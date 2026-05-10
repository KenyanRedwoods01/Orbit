package api

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os/exec"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// cronCommandRe validates that cron commands contain only safe characters.
// Disallows: ; & | ` $ ! ( ) { } [ ] < > # ~ newlines
var cronCommandRe = regexp.MustCompile(`^[A-Za-z0-9_\-./:@%+=, ]+$`)

type cronJob struct {
	ID          int64   `json:"id"`
	Name        string  `json:"name"`
	Schedule    string  `json:"schedule"`
	Command     string  `json:"command"`
	Description string  `json:"description"`
	Enabled     bool    `json:"enabled"`
	CreatedAt   int64   `json:"created_at"`
	LastRunAt   *int64  `json:"last_run_at,omitempty"`
	NextRunAt   *int64  `json:"next_run_at,omitempty"`
	LastStatus  string  `json:"last_status,omitempty"`
}

type cronHistoryEntry struct {
	ID        int64  `json:"id"`
	JobID     int64  `json:"job_id"`
	Status    string `json:"status"`
	Output    string `json:"output"`
	ExitCode  int    `json:"exit_code"`
	StartedAt int64  `json:"started_at"`
	EndedAt   *int64 `json:"ended_at,omitempty"`
}

func (s *Server) handleCronList(w http.ResponseWriter, r *http.Request) {
	rows, err := s.db.SQL.QueryContext(r.Context(),
		`SELECT j.id, j.name, j.schedule, j.command, COALESCE(j.description,''),
		        j.enabled, j.created_at, j.last_run_at, j.next_run_at,
		        COALESCE((SELECT h.status FROM cron_history h WHERE h.job_id=j.id ORDER BY h.id DESC LIMIT 1), '')
		 FROM cron_jobs j ORDER BY j.id DESC`,
	)
	if err != nil {
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var jobs []cronJob
	for rows.Next() {
		var j cronJob
		var enabledInt int
		rows.Scan(&j.ID, &j.Name, &j.Schedule, &j.Command, &j.Description, //nolint:errcheck
			&enabledInt, &j.CreatedAt, &j.LastRunAt, &j.NextRunAt, &j.LastStatus)
		j.Enabled = enabledInt == 1
		jobs = append(jobs, j)
	}
	if jobs == nil {
		jobs = []cronJob{}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(jobs) //nolint:errcheck
}

func (s *Server) handleCronCreate(w http.ResponseWriter, r *http.Request) {
	var req cronJob
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	if req.Name == "" || req.Schedule == "" || req.Command == "" {
		http.Error(w, "name, schedule, and command are required", http.StatusBadRequest)
		return
	}
	if !cronCommandRe.MatchString(req.Command) {
		http.Error(w, fmt.Sprintf("command contains illegal characters (allowed: A-Za-z0-9 _-./:@%%+=,)"), http.StatusBadRequest)
		return
	}

	now := time.Now()
	nextRun := computeNextCronTime(req.Schedule, now)
	var nextRunPtr *int64
	if !nextRun.IsZero() {
		v := nextRun.Unix()
		nextRunPtr = &v
	}

	res, err := s.db.SQL.ExecContext(r.Context(),
		`INSERT INTO cron_jobs (name, schedule, command, description, enabled, next_run_at) VALUES (?, ?, ?, ?, 1, ?)`,
		req.Name, req.Schedule, req.Command, req.Description, nextRunPtr,
	)
	if err != nil {
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}
	req.ID, _ = res.LastInsertId()
	req.Enabled = true
	req.CreatedAt = now.Unix()
	req.NextRunAt = nextRunPtr

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(req) //nolint:errcheck
}

func (s *Server) handleCronUpdate(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		http.Error(w, "bad id", http.StatusBadRequest)
		return
	}

	var req cronJob
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	if req.Command != "" && !cronCommandRe.MatchString(req.Command) {
		http.Error(w, fmt.Sprintf("command contains illegal characters (allowed: A-Za-z0-9 _-./:@%%+=,)"), http.StatusBadRequest)
		return
	}
	enabledInt := 0
	if req.Enabled {
		enabledInt = 1
	}

	nextRun := computeNextCronTime(req.Schedule, time.Now())
	var nextRunPtr *int64
	if !nextRun.IsZero() {
		v := nextRun.Unix()
		nextRunPtr = &v
	}

	_, err = s.db.SQL.ExecContext(r.Context(),
		`UPDATE cron_jobs SET name=?, schedule=?, command=?, description=?, enabled=?, next_run_at=? WHERE id=?`,
		req.Name, req.Schedule, req.Command, req.Description, enabledInt, nextRunPtr, id,
	)
	if err != nil {
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}
	req.ID = id
	req.NextRunAt = nextRunPtr
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(req) //nolint:errcheck
}

func (s *Server) handleCronDelete(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		http.Error(w, "bad id", http.StatusBadRequest)
		return
	}
	_, err = s.db.SQL.ExecContext(r.Context(), `DELETE FROM cron_jobs WHERE id=?`, id)
	if err != nil {
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleCronRun(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		http.Error(w, "bad id", http.StatusBadRequest)
		return
	}

	var command string
	err = s.db.SQL.QueryRowContext(r.Context(), `SELECT command FROM cron_jobs WHERE id=?`, id).Scan(&command)
	if err != nil {
		http.Error(w, "job not found", http.StatusNotFound)
		return
	}

	runID := s.triggerCronJob(id, command)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]int64{"run_id": runID}) //nolint:errcheck
}

func (s *Server) triggerCronJob(jobID int64, command string) int64 {
	res, _ := s.db.SQL.Exec(
		`INSERT INTO cron_history (job_id, status, started_at) VALUES (?, 'running', unixepoch())`, jobID,
	)
	runID, _ := res.LastInsertId()

	go func() {
		var out bytes.Buffer
		cmd := exec.Command("/bin/sh", "-c", command)
		cmd.Stdout = &out
		cmd.Stderr = &out
		runErr := cmd.Run()
		exitCode := 0
		status := "ok"
		if runErr != nil {
			status = "error"
			if exitErr, ok := runErr.(*exec.ExitError); ok {
				exitCode = exitErr.ExitCode()
			} else {
				exitCode = 1
			}
		}
		now := time.Now().Unix()
		s.db.SQL.Exec( //nolint:errcheck
			`UPDATE cron_history SET status=?, output=?, exit_code=?, ended_at=? WHERE id=?`,
			status, out.String(), exitCode, now, runID,
		)
		s.db.SQL.Exec( //nolint:errcheck
			`UPDATE cron_jobs SET last_run_at=?, next_run_at=? WHERE id=?`,
			now, computeNextCronTime("", time.Now()).Unix(), jobID,
		)
		// Refresh next_run_at properly
		var schedule string
		if e := s.db.SQL.QueryRow(`SELECT schedule FROM cron_jobs WHERE id=?`, jobID).Scan(&schedule); e == nil {
			nextRun := computeNextCronTime(schedule, time.Now())
			if !nextRun.IsZero() {
				s.db.SQL.Exec(`UPDATE cron_jobs SET next_run_at=? WHERE id=?`, nextRun.Unix(), jobID) //nolint:errcheck
			}
		}
	}()
	return runID
}

func (s *Server) handleCronHistory(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		http.Error(w, "bad id", http.StatusBadRequest)
		return
	}

	rows, err := s.db.SQL.QueryContext(r.Context(),
		`SELECT id, job_id, status, COALESCE(output,''), exit_code, started_at, ended_at
		 FROM cron_history WHERE job_id=? ORDER BY id DESC LIMIT 100`,
		id,
	)
	if err != nil {
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var entries []cronHistoryEntry
	for rows.Next() {
		var e cronHistoryEntry
		rows.Scan(&e.ID, &e.JobID, &e.Status, &e.Output, &e.ExitCode, &e.StartedAt, &e.EndedAt) //nolint:errcheck
		entries = append(entries, e)
	}
	if entries == nil {
		entries = []cronHistoryEntry{}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(entries) //nolint:errcheck
}

func (s *Server) handleCronSystemList(w http.ResponseWriter, r *http.Request) {
	out, err := exec.Command("crontab", "-l").Output()
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"raw": ""}) //nolint:errcheck
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"raw": strings.TrimSpace(string(out))}) //nolint:errcheck
}

// ── Cron Scheduler ──────────────────────────────────────────────────────────

// runCronScheduler runs enabled cron jobs on schedule.
// It fires once per minute, just after the minute rolls over.
func (s *Server) runCronScheduler(ctx context.Context) {
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
			`SELECT id, schedule, command FROM cron_jobs WHERE enabled=1`)
		if err != nil {
			continue
		}
		type jobRow struct {
			id       int64
			schedule string
			command  string
		}
		var jobs []jobRow
		for rows.Next() {
			var j jobRow
			rows.Scan(&j.id, &j.schedule, &j.command) //nolint:errcheck
			jobs = append(jobs, j)
		}
		rows.Close()

		for _, j := range jobs {
			if matchesCron(j.schedule, t) {
				go s.triggerCronJob(j.id, j.command)
			}
		}
	}
}

// ── Cron Expression Matching ────────────────────────────────────────────────

// matchesCronField checks if val satisfies a single cron field expression.
// Supports: *, */n, n-m, n, and comma-separated combinations.
func matchesCronField(field string, val int) bool {
	if field == "*" {
		return true
	}
	for _, part := range strings.Split(field, ",") {
		part = strings.TrimSpace(part)
		if strings.Contains(part, "/") {
			sub := strings.SplitN(part, "/", 2)
			step, err := strconv.Atoi(sub[1])
			if err != nil || step <= 0 {
				continue
			}
			start := 0
			if sub[0] != "*" {
				if strings.Contains(sub[0], "-") {
					r := strings.SplitN(sub[0], "-", 2)
					start, _ = strconv.Atoi(r[0])
				} else {
					start, _ = strconv.Atoi(sub[0])
				}
			}
			if val >= start && (val-start)%step == 0 {
				return true
			}
		} else if strings.Contains(part, "-") {
			r := strings.SplitN(part, "-", 2)
			lo, _ := strconv.Atoi(r[0])
			hi, _ := strconv.Atoi(r[1])
			if val >= lo && val <= hi {
				return true
			}
		} else {
			v, err := strconv.Atoi(part)
			if err == nil && v == val {
				return true
			}
		}
	}
	return false
}

// matchesCron returns true if t matches the cron expression.
// Supports 5-field format (min hour dom month dow) and @aliases.
func matchesCron(expr string, t time.Time) bool {
	switch strings.ToLower(strings.TrimSpace(expr)) {
	case "@yearly", "@annually":
		expr = "0 0 1 1 *"
	case "@monthly":
		expr = "0 0 1 * *"
	case "@weekly":
		expr = "0 0 * * 0"
	case "@daily", "@midnight":
		expr = "0 0 * * *"
	case "@hourly":
		expr = "0 * * * *"
	}
	fields := strings.Fields(expr)
	if len(fields) != 5 {
		return false
	}
	return matchesCronField(fields[0], t.Minute()) &&
		matchesCronField(fields[1], t.Hour()) &&
		matchesCronField(fields[2], t.Day()) &&
		matchesCronField(fields[3], int(t.Month())) &&
		matchesCronField(fields[4], int(t.Weekday()))
}

// computeNextCronTime returns the next time after `from` that matches the cron expression.
// Searches forward minute-by-minute up to 366 days ahead.
func computeNextCronTime(expr string, from time.Time) time.Time {
	if expr == "" {
		return time.Time{}
	}
	t := from.Add(time.Minute).Truncate(time.Minute)
	limit := from.Add(366 * 24 * time.Hour)
	for t.Before(limit) {
		if matchesCron(expr, t) {
			return t
		}
		t = t.Add(time.Minute)
	}
	return time.Time{}
}
