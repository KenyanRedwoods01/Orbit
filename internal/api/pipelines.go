package api

import (
	"context"
	"encoding/json"
	"net/http"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

// ── Pipeline CRUD ─────────────────────────────────────────────────────────────

type pipeline struct {
	ID          int64            `json:"id"`
	Name        string           `json:"name"`
	Description string           `json:"description,omitempty"`
	Enabled     bool             `json:"enabled"`
	CreatedAt   int64            `json:"created_at"`
	Stages      []pipelineStage  `json:"stages,omitempty"`
	Envs        []pipelineEnv    `json:"envs,omitempty"`
}

type pipelineStage struct {
	ID              int64  `json:"id"`
	PipelineID      int64  `json:"pipeline_id"`
	Name            string `json:"name"`
	Command         string `json:"command"`
	WorkingDir      string `json:"working_dir,omitempty"`
	TimeoutS        int    `json:"timeout_s"`
	RequiresApproval bool  `json:"requires_approval"`
	ContinueOnFail  bool   `json:"continue_on_fail"`
	OrderIdx        int    `json:"order_idx"`
}

type pipelineEnv struct {
	ID         int64  `json:"id"`
	PipelineID int64  `json:"pipeline_id"`
	Key        string `json:"key"`
	Value      string `json:"value"`
	Secret     bool   `json:"secret"`
}

type pipelineRun struct {
	ID          int64              `json:"id"`
	PipelineID  int64              `json:"pipeline_id"`
	Status      string             `json:"status"`
	TriggeredBy string             `json:"triggered_by,omitempty"`
	StartedAt   int64              `json:"started_at"`
	EndedAt     *int64             `json:"ended_at,omitempty"`
	StageRuns   []pipelineStageRun `json:"stage_runs,omitempty"`
}

type pipelineStageRun struct {
	ID        int64  `json:"id"`
	RunID     int64  `json:"run_id"`
	StageID   int64  `json:"stage_id"`
	StageName string `json:"stage_name,omitempty"`
	Status    string `json:"status"`
	Output    string `json:"output,omitempty"`
	ExitCode  *int   `json:"exit_code,omitempty"`
	StartedAt int64  `json:"started_at"`
	EndedAt   *int64 `json:"ended_at,omitempty"`
}

func (s *Server) handlePipelineList(w http.ResponseWriter, r *http.Request) {
	rows, err := s.db.SQL.QueryContext(r.Context(),
		`SELECT id, name, COALESCE(description,''), enabled, created_at FROM pipelines ORDER BY id DESC`,
	)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode([]pipeline{}) //nolint:errcheck
		return
	}
	defer rows.Close()

	var pipes []pipeline
	for rows.Next() {
		var p pipeline
		var enabled int
		rows.Scan(&p.ID, &p.Name, &p.Description, &enabled, &p.CreatedAt) //nolint:errcheck
		p.Enabled = enabled == 1
		pipes = append(pipes, p)
	}
	if pipes == nil {
		pipes = []pipeline{}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(pipes) //nolint:errcheck
}

func (s *Server) handlePipelineGet(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		http.Error(w, "bad id", http.StatusBadRequest)
		return
	}
	var p pipeline
	var enabled int
	err = s.db.SQL.QueryRowContext(r.Context(),
		`SELECT id, name, COALESCE(description,''), enabled, created_at FROM pipelines WHERE id=?`, id,
	).Scan(&p.ID, &p.Name, &p.Description, &enabled, &p.CreatedAt)
	if err != nil {
		http.Error(w, "pipeline not found", http.StatusNotFound)
		return
	}
	p.Enabled = enabled == 1
	p.Stages = s.loadPipelineStages(r, id)
	p.Envs = s.loadPipelineEnvs(r, id)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(p) //nolint:errcheck
}

func (s *Server) handlePipelineCreate(w http.ResponseWriter, r *http.Request) {
	var req pipeline
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	if req.Name == "" {
		http.Error(w, "name is required", http.StatusBadRequest)
		return
	}
	res, err := s.db.SQL.ExecContext(r.Context(),
		`INSERT INTO pipelines (name, description, enabled) VALUES (?,?,1)`,
		req.Name, req.Description,
	)
	if err != nil {
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}
	req.ID, _ = res.LastInsertId()
	req.Enabled = true
	req.CreatedAt = time.Now().Unix()

	// Create stages if provided
	for i, stage := range req.Stages {
		stage.PipelineID = req.ID
		stage.OrderIdx = i
		s.insertPipelineStage(r, stage) //nolint:errcheck
	}
	req.Stages = s.loadPipelineStages(r, req.ID)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(req) //nolint:errcheck
}

func (s *Server) handlePipelineUpdate(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		http.Error(w, "bad id", http.StatusBadRequest)
		return
	}
	var req pipeline
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	enabled := 0
	if req.Enabled {
		enabled = 1
	}
	_, err = s.db.SQL.ExecContext(r.Context(),
		`UPDATE pipelines SET name=?, description=?, enabled=? WHERE id=?`,
		req.Name, req.Description, enabled, id,
	)
	if err != nil {
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handlePipelineDelete(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		http.Error(w, "bad id", http.StatusBadRequest)
		return
	}
	s.db.SQL.ExecContext(r.Context(), `DELETE FROM pipelines WHERE id=?`, id) //nolint:errcheck
	w.WriteHeader(http.StatusNoContent)
}

// ── Stage CRUD ────────────────────────────────────────────────────────────────

func (s *Server) handlePipelineStageList(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		http.Error(w, "bad id", http.StatusBadRequest)
		return
	}
	stages := s.loadPipelineStages(r, id)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(stages) //nolint:errcheck
}

func (s *Server) handlePipelineStageCreate(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	pipelineID, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		http.Error(w, "bad id", http.StatusBadRequest)
		return
	}
	var req pipelineStage
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	req.PipelineID = pipelineID
	if req.TimeoutS == 0 {
		req.TimeoutS = 300
	}
	stageID, err := s.insertPipelineStage(r, req)
	if err != nil {
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}
	req.ID = stageID
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(req) //nolint:errcheck
}

func (s *Server) handlePipelineStageUpdate(w http.ResponseWriter, r *http.Request) {
	stageIDStr := r.PathValue("stage_id")
	stageID, err := strconv.ParseInt(stageIDStr, 10, 64)
	if err != nil {
		http.Error(w, "bad stage_id", http.StatusBadRequest)
		return
	}
	var req pipelineStage
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	approval := 0
	if req.RequiresApproval {
		approval = 1
	}
	cont := 0
	if req.ContinueOnFail {
		cont = 1
	}
	_, err = s.db.SQL.ExecContext(r.Context(),
		`UPDATE pipeline_stages SET name=?, command=?, working_dir=?, timeout_s=?, requires_approval=?, continue_on_fail=?, order_idx=? WHERE id=?`,
		req.Name, req.Command, req.WorkingDir, req.TimeoutS, approval, cont, req.OrderIdx, stageID,
	)
	if err != nil {
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handlePipelineStageDelete(w http.ResponseWriter, r *http.Request) {
	stageIDStr := r.PathValue("stage_id")
	stageID, err := strconv.ParseInt(stageIDStr, 10, 64)
	if err != nil {
		http.Error(w, "bad stage_id", http.StatusBadRequest)
		return
	}
	s.db.SQL.ExecContext(r.Context(), `DELETE FROM pipeline_stages WHERE id=?`, stageID) //nolint:errcheck
	w.WriteHeader(http.StatusNoContent)
}

// ── Env Vars ──────────────────────────────────────────────────────────────────

func (s *Server) handlePipelineEnvList(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		http.Error(w, "bad id", http.StatusBadRequest)
		return
	}
	envs := s.loadPipelineEnvs(r, id)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(envs) //nolint:errcheck
}

func (s *Server) handlePipelineEnvSet(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	pipelineID, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		http.Error(w, "bad id", http.StatusBadRequest)
		return
	}
	var req pipelineEnv
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	if req.Key == "" {
		http.Error(w, "key is required", http.StatusBadRequest)
		return
	}
	secret := 0
	if req.Secret {
		secret = 1
	}
	_, err = s.db.SQL.ExecContext(r.Context(),
		`INSERT INTO pipeline_envs (pipeline_id, key, value, secret) VALUES (?,?,?,?)
		 ON CONFLICT(pipeline_id, key) DO UPDATE SET value=excluded.value, secret=excluded.secret`,
		pipelineID, req.Key, req.Value, secret,
	)
	if err != nil {
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handlePipelineEnvDelete(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	pipelineID, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		http.Error(w, "bad id", http.StatusBadRequest)
		return
	}
	key := r.PathValue("key")
	s.db.SQL.ExecContext(r.Context(), //nolint:errcheck
		`DELETE FROM pipeline_envs WHERE pipeline_id=? AND key=?`, pipelineID, key,
	)
	w.WriteHeader(http.StatusNoContent)
}

// ── Pipeline Runs ─────────────────────────────────────────────────────────────

func (s *Server) handlePipelineRunList(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	pipelineID, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		http.Error(w, "bad id", http.StatusBadRequest)
		return
	}
	rows, err := s.db.SQL.QueryContext(r.Context(),
		`SELECT id, pipeline_id, status, COALESCE(triggered_by,''), started_at, ended_at
		 FROM pipeline_runs WHERE pipeline_id=? ORDER BY id DESC LIMIT 50`, pipelineID,
	)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode([]pipelineRun{}) //nolint:errcheck
		return
	}
	defer rows.Close()

	var runs []pipelineRun
	for rows.Next() {
		var run pipelineRun
		rows.Scan(&run.ID, &run.PipelineID, &run.Status, &run.TriggeredBy, &run.StartedAt, &run.EndedAt) //nolint:errcheck
		runs = append(runs, run)
	}
	if runs == nil {
		runs = []pipelineRun{}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(runs) //nolint:errcheck
}

func (s *Server) handlePipelineTrigger(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	pipelineID, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		http.Error(w, "bad id", http.StatusBadRequest)
		return
	}

	claims := claimsFromCtx(r)
	triggeredBy := "manual"
	if claims != nil {
		triggeredBy = claims.Username
	}

	// Create a run record
	res, err := s.db.SQL.ExecContext(r.Context(),
		`INSERT INTO pipeline_runs (pipeline_id, status, triggered_by) VALUES (?,?,?)`,
		pipelineID, "running", triggeredBy,
	)
	if err != nil {
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}
	runID, _ := res.LastInsertId()

	stages := s.loadPipelineStages(r, pipelineID)
	envs := s.loadPipelineEnvs(r, pipelineID)

	// Build env slice for commands
	envPairs := make([]string, 0, len(envs))
	for _, e := range envs {
		envPairs = append(envPairs, e.Key+"="+e.Value)
	}

	// Run stages asynchronously
	go s.executePipelineRun(runID, pipelineID, stages, envPairs)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	json.NewEncoder(w).Encode(map[string]interface{}{ //nolint:errcheck
		"run_id":      runID,
		"pipeline_id": pipelineID,
		"status":      "running",
		"started_at":  time.Now().Unix(),
	})
}

func (s *Server) handlePipelineRunGet(w http.ResponseWriter, r *http.Request) {
	runIDStr := r.PathValue("run_id")
	runID, err := strconv.ParseInt(runIDStr, 10, 64)
	if err != nil {
		http.Error(w, "bad run_id", http.StatusBadRequest)
		return
	}
	var run pipelineRun
	err = s.db.SQL.QueryRowContext(r.Context(),
		`SELECT id, pipeline_id, status, COALESCE(triggered_by,''), started_at, ended_at
		 FROM pipeline_runs WHERE id=?`, runID,
	).Scan(&run.ID, &run.PipelineID, &run.Status, &run.TriggeredBy, &run.StartedAt, &run.EndedAt)
	if err != nil {
		http.Error(w, "run not found", http.StatusNotFound)
		return
	}

	rows, err := s.db.SQL.QueryContext(r.Context(),
		`SELECT sr.id, sr.run_id, sr.stage_id, COALESCE(st.name,''), sr.status, COALESCE(sr.output,''), sr.exit_code, sr.started_at, sr.ended_at
		 FROM pipeline_stage_runs sr LEFT JOIN pipeline_stages st ON st.id=sr.stage_id
		 WHERE sr.run_id=? ORDER BY sr.id ASC`, runID,
	)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var sr pipelineStageRun
			rows.Scan(&sr.ID, &sr.RunID, &sr.StageID, &sr.StageName, &sr.Status, &sr.Output, &sr.ExitCode, &sr.StartedAt, &sr.EndedAt) //nolint:errcheck
			run.StageRuns = append(run.StageRuns, sr)
		}
	}
	if run.StageRuns == nil {
		run.StageRuns = []pipelineStageRun{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(run) //nolint:errcheck
}

func (s *Server) handlePipelineRunApprove(w http.ResponseWriter, r *http.Request) {
	runIDStr := r.PathValue("run_id")
	runID, err := strconv.ParseInt(runIDStr, 10, 64)
	if err != nil {
		http.Error(w, "bad run_id", http.StatusBadRequest)
		return
	}
	// Mark the pending stage as approved
	s.db.SQL.ExecContext(r.Context(), //nolint:errcheck
		`UPDATE pipeline_stage_runs SET status='approved' WHERE run_id=? AND status='pending_approval'`,
		runID,
	)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"ok": true}) //nolint:errcheck
}

func (s *Server) handlePipelineCancel(w http.ResponseWriter, r *http.Request) {
	runIDStr := r.PathValue("run_id")
	runID, err := strconv.ParseInt(runIDStr, 10, 64)
	if err != nil {
		http.Error(w, "bad run_id", http.StatusBadRequest)
		return
	}
	now := time.Now().Unix()
	s.db.SQL.ExecContext(r.Context(), //nolint:errcheck
		`UPDATE pipeline_runs SET status='cancelled', ended_at=? WHERE id=?`, now, runID,
	)
	s.db.SQL.ExecContext(r.Context(), //nolint:errcheck
		`UPDATE pipeline_stage_runs SET status='cancelled', ended_at=? WHERE run_id=? AND status IN ('pending','running','pending_approval')`,
		now, runID,
	)
	w.WriteHeader(http.StatusNoContent)
}

// executePipelineRun runs all pipeline stages sequentially in a goroutine.
func (s *Server) executePipelineRun(runID, pipelineID int64, stages []pipelineStage, envPairs []string) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Hour)
	defer cancel()

	overallStatus := "success"

	for _, stage := range stages {
		// Check if run was cancelled
		var runStatus string
		s.db.SQL.QueryRowContext(ctx, `SELECT status FROM pipeline_runs WHERE id=?`, runID).Scan(&runStatus) //nolint:errcheck
		if runStatus == "cancelled" {
			break
		}

		// If stage requires approval, wait for it
		var stageRunID int64
		res, err := s.db.SQL.ExecContext(ctx,
			`INSERT INTO pipeline_stage_runs (run_id, stage_id, status) VALUES (?,?,?)`,
			runID, stage.ID, func() string {
				if stage.RequiresApproval {
					return "pending_approval"
				}
				return "running"
			}(),
		)
		if err != nil {
			overallStatus = "failed"
			break
		}
		stageRunID, _ = res.LastInsertId()

		if stage.RequiresApproval {
			// Poll for approval up to 24h
			deadline := time.Now().Add(24 * time.Hour)
			approved := false
			for time.Now().Before(deadline) {
				var srStatus string
				s.db.SQL.QueryRowContext(ctx, //nolint:errcheck
					`SELECT status FROM pipeline_stage_runs WHERE id=?`, stageRunID,
				).Scan(&srStatus)
				if srStatus == "approved" {
					s.db.SQL.ExecContext(ctx, `UPDATE pipeline_stage_runs SET status='running' WHERE id=?`, stageRunID) //nolint:errcheck
					approved = true
					break
				}
				if srStatus == "cancelled" {
					break
				}
				select {
				case <-ctx.Done():
					return
				case <-time.After(5 * time.Second):
				}
			}
			if !approved {
				s.db.SQL.ExecContext(ctx, `UPDATE pipeline_stage_runs SET status='skipped', ended_at=unixepoch() WHERE id=?`, stageRunID) //nolint:errcheck
				continue
			}
		}

		// Execute the command
		timeout := time.Duration(stage.TimeoutS) * time.Second
		if timeout == 0 {
			timeout = 5 * time.Minute
		}
		cmdCtx, cmdCancel := context.WithTimeout(ctx, timeout)

		workDir := stage.WorkingDir
		if workDir == "" {
			workDir = "/"
		} else {
			workDir = filepath.Clean(workDir)
			if strings.Contains(workDir, "..") || !filepath.IsAbs(workDir) {
				s.db.SQL.ExecContext(ctx, //nolint:errcheck
					`UPDATE pipeline_stage_runs SET status='failed', output='invalid working directory', exit_code=-1, ended_at=unixepoch() WHERE id=?`,
					stageRunID,
				)
				if !stage.ContinueOnFail {
					overallStatus = "failed"
				}
				continue
			}
		}

		// Validate command against allowed pattern before execution
		if !allowedGitCmdPattern.MatchString(stage.Command) {
			s.db.SQL.ExecContext(ctx, //nolint:errcheck
				`UPDATE pipeline_stage_runs SET status='failed', output='command contains disallowed characters', exit_code=-1, ended_at=unixepoch() WHERE id=?`,
				stageRunID,
			)
			if !stage.ContinueOnFail {
				overallStatus = "failed"
			}
			continue
		}

		cmd := exec.CommandContext(cmdCtx, "sh", "-c", stage.Command)
		cmd.Dir = workDir
		cmd.Env = append(cmd.Environ(), envPairs...)

		out, cmdErr := cmd.CombinedOutput()
		cmdCancel()

		exitCode := 0
		status := "success"
		if cmdErr != nil {
			exitCode = 1
			if ee, ok := cmdErr.(*exec.ExitError); ok {
				exitCode = ee.ExitCode()
			}
			status = "failed"
			if !stage.ContinueOnFail {
				overallStatus = "failed"
			}
		}

		output := string(out)
		if len(output) > 50000 {
			output = output[:50000] + "\n...[truncated]"
		}

		now := time.Now().Unix()
		s.db.SQL.ExecContext(ctx, //nolint:errcheck
			`UPDATE pipeline_stage_runs SET status=?, output=?, exit_code=?, ended_at=? WHERE id=?`,
			status, output, exitCode, now, stageRunID,
		)

		if overallStatus == "failed" && !stage.ContinueOnFail {
			break
		}
	}

	now := time.Now().Unix()
	s.db.SQL.ExecContext(ctx, //nolint:errcheck
		`UPDATE pipeline_runs SET status=?, ended_at=? WHERE id=?`, overallStatus, now, runID,
	)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

func (s *Server) loadPipelineStages(r *http.Request, pipelineID int64) []pipelineStage {
	rows, err := s.db.SQL.QueryContext(r.Context(),
		`SELECT id, pipeline_id, name, command, COALESCE(working_dir,''), timeout_s, requires_approval, continue_on_fail, order_idx
		 FROM pipeline_stages WHERE pipeline_id=? ORDER BY order_idx ASC`, pipelineID,
	)
	if err != nil {
		return []pipelineStage{}
	}
	defer rows.Close()

	var stages []pipelineStage
	for rows.Next() {
		var st pipelineStage
		var approval, cont int
		rows.Scan(&st.ID, &st.PipelineID, &st.Name, &st.Command, &st.WorkingDir, &st.TimeoutS, &approval, &cont, &st.OrderIdx) //nolint:errcheck
		st.RequiresApproval = approval == 1
		st.ContinueOnFail = cont == 1
		stages = append(stages, st)
	}
	if stages == nil {
		stages = []pipelineStage{}
	}
	return stages
}

func (s *Server) loadPipelineEnvs(r *http.Request, pipelineID int64) []pipelineEnv {
	rows, err := s.db.SQL.QueryContext(r.Context(),
		`SELECT id, pipeline_id, key, value, secret FROM pipeline_envs WHERE pipeline_id=? ORDER BY key ASC`, pipelineID,
	)
	if err != nil {
		return []pipelineEnv{}
	}
	defer rows.Close()

	var envs []pipelineEnv
	for rows.Next() {
		var e pipelineEnv
		var secret int
		rows.Scan(&e.ID, &e.PipelineID, &e.Key, &e.Value, &secret) //nolint:errcheck
		e.Secret = secret == 1
		// Mask secret values
		if e.Secret {
			e.Value = strings.Repeat("*", 12)
		}
		envs = append(envs, e)
	}
	if envs == nil {
		envs = []pipelineEnv{}
	}
	return envs
}

func (s *Server) insertPipelineStage(r *http.Request, stage pipelineStage) (int64, error) {
	if stage.TimeoutS == 0 {
		stage.TimeoutS = 300
	}
	approval := 0
	if stage.RequiresApproval {
		approval = 1
	}
	cont := 0
	if stage.ContinueOnFail {
		cont = 1
	}
	res, err := s.db.SQL.ExecContext(r.Context(),
		`INSERT INTO pipeline_stages (pipeline_id, name, command, working_dir, timeout_s, requires_approval, continue_on_fail, order_idx)
		 VALUES (?,?,?,?,?,?,?,?)`,
		stage.PipelineID, stage.Name, stage.Command, stage.WorkingDir, stage.TimeoutS, approval, cont, stage.OrderIdx,
	)
	if err != nil {
		return 0, err
	}
	return res.LastInsertId()
}
