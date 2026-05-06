package api

import (
        "crypto/hmac"
        "crypto/sha256"
        "encoding/hex"
        "encoding/json"
        "io"
        "net/http"
        "os/exec"
        "strconv"
        "time"

        "github.com/KenyanRedwoods01/Orbit/internal/auth"
)

type deployHook struct {
        ID         int64  `json:"id"`
        Name       string `json:"name"`
        Project    string `json:"project"`
        ScriptPath string `json:"script_path"`
        Strategy   string `json:"strategy"`
        Secret     string `json:"secret,omitempty"`
        CreatedAt  int64  `json:"created_at"`
}

type deployRun struct {
        ID        int64  `json:"id"`
        HookID    int64  `json:"hook_id"`
        Status    string `json:"status"`
        Output    string `json:"output"`
        StartedAt int64  `json:"started_at"`
        EndedAt   *int64 `json:"ended_at,omitempty"`
}

// handleDeployList returns the list of deploy hooks as a plain array.
// The frontend api.ts fetchDeployHooks() expects DeployHook[].
func (s *Server) handleDeployList(w http.ResponseWriter, r *http.Request) {
        rows, err := s.db.SQL.QueryContext(r.Context(),
                `SELECT id, name, project, script_path, strategy, created_at FROM deploy_hooks ORDER BY id DESC`,
        )
        if err != nil {
                http.Error(w, "db error", http.StatusInternalServerError)
                return
        }
        defer rows.Close()

        var hooks []deployHook
        for rows.Next() {
                var h deployHook
                rows.Scan(&h.ID, &h.Name, &h.Project, &h.ScriptPath, &h.Strategy, &h.CreatedAt) //nolint:errcheck
                hooks = append(hooks, h)
        }
        if hooks == nil {
                hooks = []deployHook{}
        }

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(hooks) //nolint:errcheck
}

func (s *Server) handleDeployCreate(w http.ResponseWriter, r *http.Request) {
        var req deployHook
        if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
                http.Error(w, "bad request", http.StatusBadRequest)
                return
        }
        if req.Name == "" || req.Project == "" {
                http.Error(w, "name and project are required", http.StatusBadRequest)
                return
        }
        if req.Strategy == "" {
                req.Strategy = "exec"
        }
        if req.ScriptPath == "" {
                req.ScriptPath = "/dev/null"
        }

        secret, _ := auth.GenerateSecret(16)
        secretHash := hmacHash(secret)

        res, err := s.db.SQL.ExecContext(r.Context(),
                `INSERT INTO deploy_hooks (name, project, secret_hash, script_path, strategy) VALUES (?, ?, ?, ?, ?)`,
                req.Name, req.Project, secretHash, req.ScriptPath, req.Strategy,
        )
        if err != nil {
                http.Error(w, "db error", http.StatusInternalServerError)
                return
        }
        req.ID, _ = res.LastInsertId()
        req.Secret = secret
        req.CreatedAt = time.Now().Unix()

        w.Header().Set("Content-Type", "application/json")
        w.WriteHeader(http.StatusCreated)
        json.NewEncoder(w).Encode(req) //nolint:errcheck
}

func (s *Server) handleDeployUpdate(w http.ResponseWriter, r *http.Request) {
        idStr := r.PathValue("id")
        id, err := strconv.ParseInt(idStr, 10, 64)
        if err != nil {
                http.Error(w, "bad id", http.StatusBadRequest)
                return
        }
        var req deployHook
        if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
                http.Error(w, "bad request", http.StatusBadRequest)
                return
        }
        _, err = s.db.SQL.ExecContext(r.Context(),
                `UPDATE deploy_hooks SET name=?, project=?, script_path=?, strategy=? WHERE id=?`,
                req.Name, req.Project, req.ScriptPath, req.Strategy, id,
        )
        if err != nil {
                http.Error(w, "db error", http.StatusInternalServerError)
                return
        }
        req.ID = id
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(req) //nolint:errcheck
}

func (s *Server) handleDeployDelete(w http.ResponseWriter, r *http.Request) {
        idStr := r.PathValue("id")
        id, err := strconv.ParseInt(idStr, 10, 64)
        if err != nil {
                http.Error(w, "bad id", http.StatusBadRequest)
                return
        }
        _, err = s.db.SQL.ExecContext(r.Context(), `DELETE FROM deploy_hooks WHERE id=?`, id)
        if err != nil {
                http.Error(w, "db error", http.StatusInternalServerError)
                return
        }
        s.db.SQL.ExecContext(r.Context(), `DELETE FROM deploy_log WHERE hook_id=?`, id) //nolint:errcheck
        w.WriteHeader(http.StatusNoContent)
}

// handleDeployTrigger triggers a deploy and returns the full run object so the
// frontend DeployLog panel can display it immediately (matches the DeployLog type).
func (s *Server) handleDeployTrigger(w http.ResponseWriter, r *http.Request) {
        idStr := r.PathValue("id")
        id, err := strconv.ParseInt(idStr, 10, 64)
        if err != nil {
                http.Error(w, "bad id", http.StatusBadRequest)
                return
        }

        var scriptPath, strategy string
        err = s.db.SQL.QueryRowContext(r.Context(),
                `SELECT script_path, strategy FROM deploy_hooks WHERE id = ?`, id,
        ).Scan(&scriptPath, &strategy)
        if err != nil {
                http.Error(w, "hook not found", http.StatusNotFound)
                return
        }

        runID := triggerDeployAsync(s, id, scriptPath)

        run := deployRun{
                ID:        runID,
                HookID:    id,
                Status:    "running",
                Output:    "",
                StartedAt: time.Now().Unix(),
        }
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(run) //nolint:errcheck
}

func (s *Server) handleDeployWebhook(w http.ResponseWriter, r *http.Request) {
        secret := r.PathValue("secret")
        secretHash := hmacHash(secret)

        var hookID int64
        var scriptPath string
        err := s.db.SQL.QueryRowContext(r.Context(),
                `SELECT id, script_path FROM deploy_hooks WHERE secret_hash = ?`, secretHash,
        ).Scan(&hookID, &scriptPath)
        if err != nil {
                http.Error(w, "not found", http.StatusNotFound)
                return
        }

        runID := triggerDeployAsync(s, hookID, scriptPath)
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]int64{"run_id": runID}) //nolint:errcheck
}

func (s *Server) handleDeployRunGet(w http.ResponseWriter, r *http.Request) {
        idStr := r.PathValue("run_id")
        id, err := strconv.ParseInt(idStr, 10, 64)
        if err != nil {
                http.Error(w, "bad id", http.StatusBadRequest)
                return
        }
        type runDetail struct {
                ID        int64  `json:"id"`
                HookID    int64  `json:"hook_id"`
                HookName  string `json:"hook_name"`
                Project   string `json:"project"`
                Status    string `json:"status"`
                Output    string `json:"output"`
                StartedAt int64  `json:"started_at"`
                EndedAt   *int64 `json:"ended_at,omitempty"`
                Duration  string `json:"duration"`
        }
        var run runDetail
        err = s.db.SQL.QueryRowContext(r.Context(),
                `SELECT r.id, r.hook_id, COALESCE(h.name,'unknown'), COALESCE(h.project,''),
                        r.status, COALESCE(r.output,''), r.started_at, r.ended_at
                 FROM deploy_log r
                 LEFT JOIN deploy_hooks h ON h.id = r.hook_id
                 WHERE r.id=?`, id,
        ).Scan(&run.ID, &run.HookID, &run.HookName, &run.Project, &run.Status, &run.Output, &run.StartedAt, &run.EndedAt)
        if err != nil {
                http.Error(w, "run not found", http.StatusNotFound)
                return
        }
        if run.EndedAt != nil && *run.EndedAt > run.StartedAt {
                d := time.Duration(*run.EndedAt-run.StartedAt) * time.Second
                run.Duration = d.String()
        }
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(run) //nolint:errcheck
}

func (s *Server) handleDeployHookRuns(w http.ResponseWriter, r *http.Request) {
        idStr := r.PathValue("id")
        id, err := strconv.ParseInt(idStr, 10, 64)
        if err != nil {
                http.Error(w, "bad id", http.StatusBadRequest)
                return
        }
        rows, err := s.db.SQL.QueryContext(r.Context(),
                `SELECT id, hook_id, status, COALESCE(output,''), started_at, ended_at
                 FROM deploy_log WHERE hook_id=? ORDER BY id DESC LIMIT 50`, id,
        )
        if err != nil {
                http.Error(w, "db error", http.StatusInternalServerError)
                return
        }
        defer rows.Close()

        var runs []deployRun
        for rows.Next() {
                var run deployRun
                rows.Scan(&run.ID, &run.HookID, &run.Status, &run.Output, &run.StartedAt, &run.EndedAt) //nolint:errcheck
                runs = append(runs, run)
        }
        if runs == nil {
                runs = []deployRun{}
        }
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(runs) //nolint:errcheck
}

// handleDeployStats returns aggregate statistics across all deploy hook runs.
// GET /api/deploy/stats
func (s *Server) handleDeployStats(w http.ResponseWriter, r *http.Request) {
        type Stats struct {
                Total       int64   `json:"total"`
                Today       int64   `json:"today"`
                Success     int64   `json:"success"`
                Failed      int64   `json:"failed"`
                Running     int64   `json:"running"`
                SuccessRate float64 `json:"success_rate"`
        }

        midnight := time.Now().UTC().Truncate(24 * time.Hour).Unix()

        var s2 Stats
        s.db.SQL.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM deploy_log`).Scan(&s2.Total)                                        //nolint:errcheck
        s.db.SQL.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM deploy_log WHERE started_at >= ?`, midnight).Scan(&s2.Today)        //nolint:errcheck
        s.db.SQL.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM deploy_log WHERE status='ok'`).Scan(&s2.Success)                   //nolint:errcheck
        s.db.SQL.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM deploy_log WHERE status='error'`).Scan(&s2.Failed)                 //nolint:errcheck
        s.db.SQL.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM deploy_log WHERE status='running'`).Scan(&s2.Running)              //nolint:errcheck

        if s2.Total > 0 {
                s2.SuccessRate = float64(s2.Success) / float64(s2.Total) * 100
        } else {
                s2.SuccessRate = 100
        }

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(s2) //nolint:errcheck
}

// handleDeployAllRuns returns all deploy hook runs across all hooks, newest first.
// GET /api/deploy/runs
func (s *Server) handleDeployAllRuns(w http.ResponseWriter, r *http.Request) {
        type runWithHook struct {
                ID        int64  `json:"id"`
                HookID    int64  `json:"hook_id"`
                HookName  string `json:"hook_name"`
                Project   string `json:"project"`
                Status    string `json:"status"`
                Output    string `json:"output"`
                StartedAt int64  `json:"started_at"`
                EndedAt   *int64 `json:"ended_at,omitempty"`
                Duration  string `json:"duration"`
        }

        rows, err := s.db.SQL.QueryContext(r.Context(),
                `SELECT r.id, r.hook_id, COALESCE(h.name,'unknown'), COALESCE(h.project,''),
                        r.status, COALESCE(r.output,''), r.started_at, r.ended_at
                 FROM deploy_log r
                 LEFT JOIN deploy_hooks h ON h.id = r.hook_id
                 ORDER BY r.id DESC LIMIT 200`,
        )
        if err != nil {
                w.Header().Set("Content-Type", "application/json")
                json.NewEncoder(w).Encode([]runWithHook{}) //nolint:errcheck
                return
        }
        defer rows.Close()

        var runs []runWithHook
        for rows.Next() {
                var run runWithHook
                rows.Scan(&run.ID, &run.HookID, &run.HookName, &run.Project, &run.Status, &run.Output, &run.StartedAt, &run.EndedAt) //nolint:errcheck
                if run.EndedAt != nil && *run.EndedAt > run.StartedAt {
                        d := time.Duration(*run.EndedAt-run.StartedAt) * time.Second
                        run.Duration = d.String()
                }
                runs = append(runs, run)
        }
        if runs == nil {
                runs = []runWithHook{}
        }
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(runs) //nolint:errcheck
}

func triggerDeployAsync(s *Server, hookID int64, scriptPath string) int64 {
        res, _ := s.db.SQL.Exec(
                `INSERT INTO deploy_log (hook_id, status, started_at) VALUES (?, 'running', unixepoch())`, hookID,
        )
        runID, _ := res.LastInsertId()

        go func() {
                out, err := exec.Command("/bin/sh", scriptPath).CombinedOutput()
                status := "ok"
                if err != nil {
                        status = "error"
                }
                now := time.Now().Unix()
                s.db.SQL.Exec( //nolint:errcheck
                        `UPDATE deploy_log SET status=?, output=?, ended_at=? WHERE id=?`,
                        status, string(out), now, runID,
                )
        }()

        return runID
}

func hmacHash(secret string) string {
        mac := hmac.New(sha256.New, []byte("orbit-deploy"))
        io.WriteString(mac, secret) //nolint:errcheck
        return hex.EncodeToString(mac.Sum(nil))
}
