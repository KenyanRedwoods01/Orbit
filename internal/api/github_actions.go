package api

import (
        "crypto/hmac"
        "crypto/rand"
        "crypto/sha256"
        "encoding/hex"
        "encoding/json"
        "fmt"
        "io"
        "net/http"
        "os/exec"
        "regexp"
        "strings"
        "sync"
        "time"
)

// allowedGitCmdPattern restricts workflow commands to safe characters.
// Disallows: ; & | ` $ ! ( ) { } [ ] < > # ~ \ \n and pipes/redirections.
var allowedGitCmdPattern = regexp.MustCompile(`^[A-Za-z0-9_\-./:@%+=, ]+$`)

func newUUID() string {
        b := make([]byte, 16)
        rand.Read(b) //nolint:errcheck
        b[6] = (b[6] & 0x0f) | 0x40
        b[8] = (b[8] & 0x3f) | 0x80
        return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}

// ── types ──────────────────────────────────────────────────────────────────────

type GitWorkflow struct {
        ID              string `json:"id"`
        Name            string `json:"name"`
        Description     string `json:"description"`
        RepoURL         string `json:"repo_url"`
        Branch          string `json:"branch"`
        Provider        string `json:"provider"`
        TriggerType     string `json:"trigger_type"`
        BuildCommand    string `json:"build_command"`
        DeployCommand   string `json:"deploy_command"`
        PreCommands     string `json:"pre_commands"`
        PostCommands    string `json:"post_commands"`
        EnvVars         string `json:"env_vars"`
        TimeoutSecs     int    `json:"timeout_secs"`
        RetryCount      int    `json:"retry_count"`
        NotifyOnSuccess bool   `json:"notify_on_success"`
        NotifyOnFailure bool   `json:"notify_on_failure"`
        Enabled         bool   `json:"enabled"`
        WebhookSecret   string `json:"webhook_secret"`
        CreatedAt       int64  `json:"created_at"`

        // Computed
        LastRunStatus string `json:"last_run_status"`
        LastRunAt     int64  `json:"last_run_at"`
        TotalRuns     int    `json:"total_runs"`
}

type GitRun struct {
        ID            string  `json:"id"`
        WorkflowID    string  `json:"workflow_id"`
        WorkflowName  string  `json:"workflow_name"`
        Status        string  `json:"status"`
        TriggerType   string  `json:"trigger_type"`
        CommitSHA     string  `json:"commit_sha"`
        CommitMessage string  `json:"commit_message"`
        Author        string  `json:"author"`
        Branch        string  `json:"branch"`
        StartedAt     int64   `json:"started_at"`
        FinishedAt    *int64  `json:"finished_at"`
        DurationSecs  float64 `json:"duration_secs"`
        ErrorMsg      string  `json:"error_msg"`
}

type GitRunLog struct {
        TS      int64  `json:"ts"`
        Level   string `json:"level"`
        Message string `json:"message"`
}

type GitActionsStatus struct {
        Enabled       bool   `json:"enabled"`
        WorkflowCount int    `json:"workflow_count"`
        TotalRuns     int    `json:"total_runs"`
        SuccessRuns   int    `json:"success_runs"`
        FailedRuns    int    `json:"failed_runs"`
        RunningRuns   int    `json:"running_runs"`
        SuccessRate   int    `json:"success_rate"`
        Version       string `json:"version"`
}

type GitSettings struct {
        GitHubToken    string `json:"github_token"`
        GitLabToken    string `json:"gitlab_token"`
        GiteaToken     string `json:"gitea_token"`
        WorkDir        string `json:"work_dir"`
        MaxConcurrent  int    `json:"max_concurrent"`
        DefaultTimeout int    `json:"default_timeout"`
}

// ── in-memory cancel map ───────────────────────────────────────────────────────

var (
        runCancelMu sync.Mutex
        runCancels  = map[string]func(){}
)

// ── handlers ───────────────────────────────────────────────────────────────────

func (s *Server) handleGitActionsStatus(w http.ResponseWriter, r *http.Request) {
        var wfCount, totalRuns, successRuns, failedRuns, runningRuns int
        s.db.SQL.QueryRow(`SELECT COUNT(*) FROM git_workflows WHERE enabled=1`).Scan(&wfCount)
        s.db.SQL.QueryRow(`SELECT COUNT(*) FROM git_runs`).Scan(&totalRuns)
        s.db.SQL.QueryRow(`SELECT COUNT(*) FROM git_runs WHERE status='success'`).Scan(&successRuns)
        s.db.SQL.QueryRow(`SELECT COUNT(*) FROM git_runs WHERE status='failed'`).Scan(&failedRuns)
        s.db.SQL.QueryRow(`SELECT COUNT(*) FROM git_runs WHERE status='running'`).Scan(&runningRuns)

        rate := 0
        if successRuns+failedRuns > 0 {
                rate = successRuns * 100 / (successRuns + failedRuns)
        }

        writeJSON(w, GitActionsStatus{
                Enabled:       true,
                WorkflowCount: wfCount,
                TotalRuns:     totalRuns,
                SuccessRuns:   successRuns,
                FailedRuns:    failedRuns,
                RunningRuns:   runningRuns,
                SuccessRate:   rate,
                Version:       "1.0.0",
        })
}

func (s *Server) handleGitWorkflowList(w http.ResponseWriter, r *http.Request) {
        rows, err := s.db.SQL.Query(`
                SELECT w.id, w.name, w.description, w.repo_url, w.branch, w.provider,
                       w.trigger_type, w.build_command, w.deploy_command, w.pre_commands,
                       w.post_commands, w.env_vars, w.timeout_secs, w.retry_count,
                       w.notify_on_success, w.notify_on_failure, w.enabled, w.webhook_secret, w.created_at,
                       COALESCE((SELECT status FROM git_runs WHERE workflow_id=w.id ORDER BY started_at DESC LIMIT 1),''),
                       COALESCE((SELECT started_at FROM git_runs WHERE workflow_id=w.id ORDER BY started_at DESC LIMIT 1),0),
                       (SELECT COUNT(*) FROM git_runs WHERE workflow_id=w.id)
                FROM git_workflows w ORDER BY w.created_at DESC`)
        if err != nil {
                http.Error(w, "internal server error", 500)
                return
        }
        defer rows.Close()

        var list []GitWorkflow
        for rows.Next() {
                var wf GitWorkflow
                var notifySuccess, notifyFailure, enabled int
                rows.Scan(&wf.ID, &wf.Name, &wf.Description, &wf.RepoURL, &wf.Branch, &wf.Provider,
                        &wf.TriggerType, &wf.BuildCommand, &wf.DeployCommand, &wf.PreCommands,
                        &wf.PostCommands, &wf.EnvVars, &wf.TimeoutSecs, &wf.RetryCount,
                        &notifySuccess, &notifyFailure, &enabled, &wf.WebhookSecret, &wf.CreatedAt,
                        &wf.LastRunStatus, &wf.LastRunAt, &wf.TotalRuns)
                wf.NotifyOnSuccess = notifySuccess == 1
                wf.NotifyOnFailure = notifyFailure == 1
                wf.Enabled = enabled == 1
                list = append(list, wf)
        }
        if list == nil {
                list = []GitWorkflow{}
        }
        writeJSON(w, list)
}

func (s *Server) handleGitWorkflowCreate(w http.ResponseWriter, r *http.Request) {
        var wf GitWorkflow
        if err := json.NewDecoder(r.Body).Decode(&wf); err != nil {
                http.Error(w, "internal server error", 400)
                return
        }
        if wf.ID == "" {
                wf.ID = newUUID()
        }
        if wf.Branch == "" {
                wf.Branch = "main"
        }
        if wf.Provider == "" {
                wf.Provider = "github"
        }
        if wf.TriggerType == "" {
                wf.TriggerType = "push"
        }
        if wf.TimeoutSecs == 0 {
                wf.TimeoutSecs = 600
        }
        if wf.PreCommands == "" {
                wf.PreCommands = "[]"
        }
        if wf.PostCommands == "" {
                wf.PostCommands = "[]"
        }
        if wf.EnvVars == "" {
                wf.EnvVars = "{}"
        }
        notifyS, notifyF, enabled := 1, 1, 1
        if !wf.NotifyOnSuccess {
                notifyS = 0
        }
        if !wf.NotifyOnFailure {
                notifyF = 0
        }
        if !wf.Enabled {
                enabled = 0
        }
        _, err := s.db.SQL.Exec(`INSERT INTO git_workflows
                (id,name,description,repo_url,branch,provider,trigger_type,build_command,deploy_command,
                 pre_commands,post_commands,env_vars,timeout_secs,retry_count,notify_on_success,notify_on_failure,
                 enabled,webhook_secret,created_at)
                VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
                wf.ID, wf.Name, wf.Description, wf.RepoURL, wf.Branch, wf.Provider,
                wf.TriggerType, wf.BuildCommand, wf.DeployCommand, wf.PreCommands, wf.PostCommands,
                wf.EnvVars, wf.TimeoutSecs, wf.RetryCount, notifyS, notifyF, enabled, wf.WebhookSecret,
                time.Now().Unix())
        if err != nil {
                http.Error(w, "internal server error", 500)
                return
        }
        writeJSON(w, wf)
}

func (s *Server) handleGitWorkflowUpdate(w http.ResponseWriter, r *http.Request) {
        id := r.PathValue("id")
        var wf GitWorkflow
        if err := json.NewDecoder(r.Body).Decode(&wf); err != nil {
                http.Error(w, "internal server error", 400)
                return
        }
        notifyS, notifyF, enabled := 1, 1, 1
        if !wf.NotifyOnSuccess {
                notifyS = 0
        }
        if !wf.NotifyOnFailure {
                notifyF = 0
        }
        if !wf.Enabled {
                enabled = 0
        }
        s.db.SQL.Exec(`UPDATE git_workflows SET
                name=?,description=?,repo_url=?,branch=?,provider=?,trigger_type=?,build_command=?,
                deploy_command=?,pre_commands=?,post_commands=?,env_vars=?,timeout_secs=?,retry_count=?,
                notify_on_success=?,notify_on_failure=?,enabled=?,webhook_secret=?
                WHERE id=?`,
                wf.Name, wf.Description, wf.RepoURL, wf.Branch, wf.Provider, wf.TriggerType,
                wf.BuildCommand, wf.DeployCommand, wf.PreCommands, wf.PostCommands, wf.EnvVars,
                wf.TimeoutSecs, wf.RetryCount, notifyS, notifyF, enabled, wf.WebhookSecret, id)
        writeJSON(w, map[string]bool{"ok": true})
}

func (s *Server) handleGitWorkflowDelete(w http.ResponseWriter, r *http.Request) {
        id := r.PathValue("id")
        s.db.SQL.Exec(`DELETE FROM git_workflows WHERE id=?`, id)
        writeJSON(w, map[string]bool{"ok": true})
}

func (s *Server) handleGitRunList(w http.ResponseWriter, r *http.Request) {
        wfFilter := r.URL.Query().Get("workflow_id")
        statusFilter := r.URL.Query().Get("status")

        query := `SELECT r.id, r.workflow_id, COALESCE(w.name,''), r.status, r.trigger_type,
                  r.commit_sha, r.commit_message, r.author, r.branch, r.started_at,
                  r.finished_at, r.error_msg FROM git_runs r
                  LEFT JOIN git_workflows w ON w.id=r.workflow_id WHERE 1=1`
        args := []any{}

        if wfFilter != "" {
                query += ` AND r.workflow_id=?`
                args = append(args, wfFilter)
        }
        if statusFilter != "" {
                query += ` AND r.status=?`
                args = append(args, statusFilter)
        }
        query += ` ORDER BY r.started_at DESC LIMIT 100`

        rows, err := s.db.SQL.Query(query, args...)
        if err != nil {
                http.Error(w, "internal server error", 500)
                return
        }
        defer rows.Close()

        var list []GitRun
        for rows.Next() {
                var run GitRun
                var finishedAt *int64
                rows.Scan(&run.ID, &run.WorkflowID, &run.WorkflowName, &run.Status, &run.TriggerType,
                        &run.CommitSHA, &run.CommitMessage, &run.Author, &run.Branch,
                        &run.StartedAt, &finishedAt, &run.ErrorMsg)
                run.FinishedAt = finishedAt
                if finishedAt != nil {
                        run.DurationSecs = float64(*finishedAt-run.StartedAt)
                }
                list = append(list, run)
        }
        if list == nil {
                list = []GitRun{}
        }
        writeJSON(w, list)
}

func (s *Server) handleGitRunGet(w http.ResponseWriter, r *http.Request) {
        id := r.PathValue("id")
        var run GitRun
        var finishedAt *int64
        err := s.db.SQL.QueryRow(`SELECT r.id, r.workflow_id, COALESCE(w.name,''), r.status, r.trigger_type,
                r.commit_sha, r.commit_message, r.author, r.branch, r.started_at, r.finished_at, r.error_msg
                FROM git_runs r LEFT JOIN git_workflows w ON w.id=r.workflow_id WHERE r.id=?`, id).
                Scan(&run.ID, &run.WorkflowID, &run.WorkflowName, &run.Status, &run.TriggerType,
                        &run.CommitSHA, &run.CommitMessage, &run.Author, &run.Branch,
                        &run.StartedAt, &finishedAt, &run.ErrorMsg)
        if err != nil {
                http.Error(w, "not found", 404)
                return
        }
        run.FinishedAt = finishedAt
        if finishedAt != nil {
                run.DurationSecs = float64(*finishedAt - run.StartedAt)
        }
        writeJSON(w, run)
}

func (s *Server) handleGitRunLogs(w http.ResponseWriter, r *http.Request) {
        id := r.PathValue("id")
        rows, err := s.db.SQL.Query(`SELECT ts, level, message FROM git_run_logs WHERE run_id=? ORDER BY ts, id`, id)
        if err != nil {
                http.Error(w, "internal server error", 500)
                return
        }
        defer rows.Close()

        var logs []GitRunLog
        for rows.Next() {
                var l GitRunLog
                rows.Scan(&l.TS, &l.Level, &l.Message)
                logs = append(logs, l)
        }
        if logs == nil {
                logs = []GitRunLog{}
        }
        writeJSON(w, logs)
}

func (s *Server) handleGitRunCancel(w http.ResponseWriter, r *http.Request) {
        id := r.PathValue("id")
        runCancelMu.Lock()
        cancel, ok := runCancels[id]
        runCancelMu.Unlock()
        if ok {
                cancel()
                s.db.SQL.Exec(`UPDATE git_runs SET status='cancelled', finished_at=? WHERE id=?`, time.Now().Unix(), id)
                writeJSON(w, map[string]bool{"ok": true})
                return
        }
        writeJSON(w, map[string]any{"ok": false, "error": "run not cancellable"})
}

func (s *Server) handleGitRunRetry(w http.ResponseWriter, r *http.Request) {
        id := r.PathValue("id")
        var wfID, branch string
        s.db.SQL.QueryRow(`SELECT workflow_id, branch FROM git_runs WHERE id=?`, id).Scan(&wfID, &branch)
        runID := s.launchRun(wfID, "manual", "", "Retry", "system", branch)
        writeJSON(w, map[string]string{"run_id": runID})
}

func (s *Server) handleGitTrigger(w http.ResponseWriter, r *http.Request) {
        id := r.PathValue("id")
        var wf GitWorkflow
        err := s.db.SQL.QueryRow(`SELECT id, branch FROM git_workflows WHERE id=?`, id).Scan(&wf.ID, &wf.Branch)
        if err != nil {
                http.Error(w, "workflow not found", 404)
                return
        }
        runID := s.launchRun(id, "manual", "", "Manual trigger", "admin", wf.Branch)
        writeJSON(w, map[string]string{"run_id": runID})
}

func (s *Server) handleGitWebhook(w http.ResponseWriter, r *http.Request) {
        provider := r.PathValue("provider")
        body, _ := io.ReadAll(r.Body)

        var payload map[string]any
        json.Unmarshal(body, &payload)

        var repoURL, branch, commitSHA, commitMsg, author string
	switch provider {
	case "github":
		sig := r.Header.Get("X-Hub-Signature-256")
		repoURL, _ = jsonPath(payload, "repository.clone_url")
		ref, _ := jsonPath(payload, "ref")
		branch = strings.TrimPrefix(ref, "refs/heads/")
		commitSHA, _ = jsonPath(payload, "after")
		commitMsg, _ = jsonPath(payload, "head_commit.message")
		author, _ = jsonPath(payload, "head_commit.author.name")

		var ghSecret string
		s.db.SQL.QueryRow(`SELECT value FROM git_settings WHERE key='github_webhook_secret'`).Scan(&ghSecret)
		if ghSecret != "" {
			if sig == "" || !verifyHMACSHA256(body, ghSecret, strings.TrimPrefix(sig, "sha256=")) {
				http.Error(w, "invalid signature", 401)
				return
			}
		}
	case "gitlab":
		gitlabToken := r.Header.Get("X-Gitlab-Token")
		repoURL, _ = jsonPath(payload, "project.git_http_url")
		ref, _ := jsonPath(payload, "ref")
		branch = strings.TrimPrefix(ref, "refs/heads/")
		commitSHA, _ = jsonPath(payload, "checkout_sha")
		author, _ = jsonPath(payload, "user_username")

		var glSecret string
		s.db.SQL.QueryRow(`SELECT value FROM git_settings WHERE key='gitlab_webhook_secret'`).Scan(&glSecret)
		if glSecret != "" && glSecret != gitlabToken {
			http.Error(w, "invalid token", 401)
			return
		}
	case "gitea":
		giteaSig := r.Header.Get("X-Gitea-Signature")
		repoURL, _ = jsonPath(payload, "repository.clone_url")
		ref, _ := jsonPath(payload, "ref")
		branch = strings.TrimPrefix(ref, "refs/heads/")
		commitSHA, _ = jsonPath(payload, "after")

		var gaSecret string
		s.db.SQL.QueryRow(`SELECT value FROM git_settings WHERE key='gitea_webhook_secret'`).Scan(&gaSecret)
		if gaSecret != "" {
			if giteaSig == "" || !verifyHMACSHA256(body, gaSecret, giteaSig) {
				http.Error(w, "invalid signature", 401)
				return
			}
		}
	case "bitbucket":
		bbSig := r.Header.Get("X-Hub-Signature")
		repoURL, _ = jsonPath(payload, "repository.links.clone.0.href")
		branch, _ = jsonPath(payload, "push.changes.0.new.name")
		commitSHA, _ = jsonPath(payload, "push.changes.0.new.target.hash")
		author, _ = jsonPath(payload, "actor.display_name")

		var bbSecret string
		s.db.SQL.QueryRow(`SELECT value FROM git_settings WHERE key='bitbucket_webhook_secret'`).Scan(&bbSecret)
		if bbSecret != "" {
			if bbSig == "" || !verifyHMACSHA256(body, bbSecret, strings.TrimPrefix(bbSig, "sha256=")) {
				http.Error(w, "invalid signature", 401)
				return
			}
		}
	}

        rows, _ := s.db.SQL.Query(`SELECT id FROM git_workflows WHERE enabled=1 AND repo_url=? AND branch=? AND trigger_type='push'`,
                repoURL, branch)
        if rows != nil {
                var wfIDs []string
                for rows.Next() {
                        var id string
                        rows.Scan(&id)
                        wfIDs = append(wfIDs, id)
                }
                rows.Close()
                for _, id := range wfIDs {
                        go s.launchRun(id, "webhook", commitSHA, commitMsg, author, branch)
                }
        }

        w.WriteHeader(200)
        w.Write([]byte(`{"ok":true}`))
}

func (s *Server) handleGitSettingsGet(w http.ResponseWriter, r *http.Request) {
	get := func(k string) string {
		var v string
		s.db.SQL.QueryRow(`SELECT value FROM git_settings WHERE key=?`, k).Scan(&v)
		if v != "" {
			return "***"
		}
		return v
	}
	maxC := 3
	timeout := 600
	s.db.SQL.QueryRow(`SELECT CAST(value AS INTEGER) FROM git_settings WHERE key='max_concurrent'`).Scan(&maxC)
	s.db.SQL.QueryRow(`SELECT CAST(value AS INTEGER) FROM git_settings WHERE key='default_timeout'`).Scan(&timeout)
	writeJSON(w, GitSettings{
		GitHubToken:    get("github_token"),
		GitLabToken:    get("gitlab_token"),
		GiteaToken:     get("gitea_token"),
		WorkDir:        get("work_dir"),
		MaxConcurrent:  maxC,
		DefaultTimeout: timeout,
	})
}

func (s *Server) handleGitSettingsPut(w http.ResponseWriter, r *http.Request) {
        var cfg GitSettings
        if err := json.NewDecoder(r.Body).Decode(&cfg); err != nil {
                http.Error(w, "internal server error", 400)
                return
        }
        save := func(k, v string) {
                s.db.SQL.Exec(`INSERT INTO git_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`, k, v)
        }
        save("github_token", cfg.GitHubToken)
        save("gitlab_token", cfg.GitLabToken)
        save("gitea_token", cfg.GiteaToken)
        save("work_dir", cfg.WorkDir)
        save("max_concurrent", fmt.Sprintf("%d", cfg.MaxConcurrent))
        save("default_timeout", fmt.Sprintf("%d", cfg.DefaultTimeout))
        writeJSON(w, map[string]bool{"ok": true})
}

func (s *Server) handleGitWebhookInfo(w http.ResponseWriter, r *http.Request) {
        get := func(k string) string {
                var v string
                s.db.SQL.QueryRow(`SELECT value FROM git_settings WHERE key=?`, k).Scan(&v)
                return v
        }
        host := r.Host
        if host == "" {
                host = "your-server.com"
        }
        writeJSON(w, map[string]any{
                "base_url": fmt.Sprintf("https://%s/api/git-actions/webhook", host),
                "providers": map[string]any{
                        "github": map[string]string{
                                "url":    fmt.Sprintf("https://%s/api/git-actions/webhook/github", host),
                                "secret": get("github_webhook_secret"),
                        },
                        "gitlab": map[string]string{
                                "url":    fmt.Sprintf("https://%s/api/git-actions/webhook/gitlab", host),
                                "secret": get("gitlab_webhook_secret"),
                        },
                        "gitea": map[string]string{
                                "url":    fmt.Sprintf("https://%s/api/git-actions/webhook/gitea", host),
                                "secret": get("gitea_webhook_secret"),
                        },
                        "bitbucket": map[string]string{
                                "url":    fmt.Sprintf("https://%s/api/git-actions/webhook/bitbucket", host),
                                "secret": "",
                        },
                },
        })
}

func (s *Server) handleGitWebhookSecretUpdate(w http.ResponseWriter, r *http.Request) {
        var body struct {
                Provider string `json:"provider"`
                Secret   string `json:"secret"`
        }
        json.NewDecoder(r.Body).Decode(&body)
        s.db.SQL.Exec(`INSERT INTO git_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
                body.Provider+"_webhook_secret", body.Secret)
        writeJSON(w, map[string]bool{"ok": true})
}

// ── execution engine ───────────────────────────────────────────────────────────

func (s *Server) launchRun(workflowID, triggerType, commitSHA, commitMsg, author, branch string) string {
        runID := newUUID()
        now := time.Now().Unix()
        s.db.SQL.Exec(`INSERT INTO git_runs(id,workflow_id,status,trigger_type,commit_sha,commit_message,author,branch,started_at)
                VALUES(?,?,?,?,?,?,?,?,?)`,
                runID, workflowID, "running", triggerType, commitSHA, commitMsg, author, branch, now)

        go func() {
                s.executeRun(runID, workflowID)
        }()
        return runID
}

func (s *Server) executeRun(runID, workflowID string) {
        addLog := func(level, msg string) {
                s.db.SQL.Exec(`INSERT INTO git_run_logs(run_id,ts,level,message) VALUES(?,?,?,?)`,
                        runID, time.Now().Unix(), level, msg)
        }
        fail := func(msg string) {
                addLog("error", msg)
                s.db.SQL.Exec(`UPDATE git_runs SET status='failed', finished_at=?, error_msg=? WHERE id=?`,
                        time.Now().Unix(), msg, runID)
                runCancelMu.Lock()
                delete(runCancels, runID)
                runCancelMu.Unlock()
        }

        var wf GitWorkflow
        var notifyS, notifyF, enabled int
        err := s.db.SQL.QueryRow(`SELECT id,name,repo_url,branch,build_command,deploy_command,
                pre_commands,post_commands,env_vars,timeout_secs,notify_on_success,notify_on_failure,enabled
                FROM git_workflows WHERE id=?`, workflowID).Scan(
                &wf.ID, &wf.Name, &wf.RepoURL, &wf.Branch, &wf.BuildCommand, &wf.DeployCommand,
                &wf.PreCommands, &wf.PostCommands, &wf.EnvVars, &wf.TimeoutSecs,
                &notifyS, &notifyF, &enabled)
        if err != nil {
                fail("workflow not found: " + err.Error())
                return
        }
        wf.NotifyOnSuccess = notifyS == 1
        wf.NotifyOnFailure = notifyF == 1
        wf.Enabled = enabled == 1

        addLog("info", fmt.Sprintf("[git-actions] Starting workflow: %s", wf.Name))

        timeout := time.Duration(wf.TimeoutSecs) * time.Second
        if timeout == 0 {
                timeout = 10 * time.Minute
        }

	runCmd := func(cmdStr string) error {
		if strings.TrimSpace(cmdStr) == "" {
			return nil
		}
		if !allowedGitCmdPattern.MatchString(cmdStr) {
			addLog("error", fmt.Sprintf("rejected command with unsafe characters: %q", cmdStr))
			return fmt.Errorf("command contains unsafe characters")
		}
		addLog("info", fmt.Sprintf("$ %s", cmdStr))
		parts := strings.Fields(cmdStr)
		if len(parts) == 0 {
			return nil
		}
		cmd := exec.Command(parts[0], parts[1:]...)
		out, err := cmd.CombinedOutput()
		lines := strings.Split(strings.TrimSpace(string(out)), "\n")
		for _, line := range lines {
			if strings.TrimSpace(line) == "" {
				continue
			}
			lvl := "info"
			lower := strings.ToLower(line)
			if strings.Contains(lower, "error") || strings.Contains(lower, "fatal") {
				lvl = "error"
			} else if strings.Contains(lower, "warn") {
				lvl = "warn"
			}
			addLog(lvl, line)
		}
		return err
	}

        // Pre-commands
        var pre []string
        json.Unmarshal([]byte(wf.PreCommands), &pre)
        for _, cmd := range pre {
                if err := runCmd(cmd); err != nil {
                        fail(fmt.Sprintf("pre-command failed: %s", err))
                        return
                }
        }

        // Build
        if wf.BuildCommand != "" {
                addLog("info", "[git-actions] Running build command…")
                if err := runCmd(wf.BuildCommand); err != nil {
                        fail(fmt.Sprintf("build failed: %s", err))
                        return
                }
        }

        // Deploy
        if wf.DeployCommand != "" {
                addLog("info", "[git-actions] Running deploy command…")
                if err := runCmd(wf.DeployCommand); err != nil {
                        fail(fmt.Sprintf("deploy failed: %s", err))
                        return
                }
        }

        // Post-commands
        var post []string
        json.Unmarshal([]byte(wf.PostCommands), &post)
        for _, cmd := range post {
                if err := runCmd(cmd); err != nil {
                        fail(fmt.Sprintf("post-command failed: %s", err))
                        return
                }
        }

        addLog("info", "[git-actions] Workflow completed successfully")
        s.db.SQL.Exec(`UPDATE git_runs SET status='success', finished_at=? WHERE id=?`, time.Now().Unix(), runID)
        runCancelMu.Lock()
        delete(runCancels, runID)
        runCancelMu.Unlock()
        _ = timeout
}

// ── helpers ───────────────────────────────────────────────────────────────────

func verifyHMACSHA256(body []byte, secret, sig string) bool {
        mac := hmac.New(sha256.New, []byte(secret))
        mac.Write(body)
        expected := hex.EncodeToString(mac.Sum(nil))
        return hmac.Equal([]byte(expected), []byte(sig))
}

func jsonPath(obj map[string]any, path string) (string, bool) {
        parts := strings.SplitN(path, ".", 2)
        val, ok := obj[parts[0]]
        if !ok {
                return "", false
        }
        if len(parts) == 1 {
                if s, ok := val.(string); ok {
                        return s, true
                }
                return fmt.Sprintf("%v", val), true
        }
        sub, ok := val.(map[string]any)
        if !ok {
                return "", false
        }
        return jsonPath(sub, parts[1])
}
