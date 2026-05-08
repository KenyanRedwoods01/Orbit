package api

import (
        "bytes"
        "encoding/json"
        "fmt"
        "net/http"
        "os"
        "strconv"
        "strings"
        "syscall"

        "github.com/shirou/gopsutil/v3/process"
)

type processEntry struct {
        PID     int32   `json:"pid"`
        PPID    int32   `json:"ppid"`
        Name    string  `json:"name"`
        User    string  `json:"user"`
        CPUPct  float64 `json:"cpu_pct"`
        MemPct  float32 `json:"mem_pct"`
        MemRSS  uint64  `json:"mem_rss"`
        VirtMem uint64  `json:"virt_bytes"`
        Status  string  `json:"status"`
        Threads int32   `json:"threads"`
        FDs     int32   `json:"fds"`
        Nice    int32   `json:"nice"`
        Cmdline string  `json:"cmdline"`
        CWD     string  `json:"cwd"`
}

func (s *Server) handleProcessList(w http.ResponseWriter, r *http.Request) {
        ctx := r.Context()
        procs, err := process.ProcessesWithContext(ctx)
        if err != nil {
                http.Error(w, "failed to list processes", http.StatusInternalServerError)
                return
        }

        entries := make([]processEntry, 0, len(procs))
        for _, p := range procs {
                name, _ := p.NameWithContext(ctx)
                cpuPct, _ := p.CPUPercentWithContext(ctx)
                memPct, _ := p.MemoryPercentWithContext(ctx)
                memInfo, _ := p.MemoryInfoWithContext(ctx)
                status, _ := p.StatusWithContext(ctx)
                username, _ := p.UsernameWithContext(ctx)
                ppid, _ := p.PpidWithContext(ctx)
                threads, _ := p.NumThreadsWithContext(ctx)
                fds, _ := p.NumFDsWithContext(ctx)
                nice, _ := p.NiceWithContext(ctx)
                cmdline, _ := p.CmdlineWithContext(ctx)
                cwd, _ := p.CwdWithContext(ctx)

                var rss, virt uint64
                if memInfo != nil {
                        rss = memInfo.RSS
                        virt = memInfo.VMS
                }
                statusStr := ""
                if len(status) > 0 {
                        statusStr = status[0]
                }

                entries = append(entries, processEntry{
                        PID:     p.Pid,
                        PPID:    ppid,
                        Name:    name,
                        User:    username,
                        CPUPct:  cpuPct,
                        MemPct:  memPct,
                        MemRSS:  rss,
                        VirtMem: virt,
                        Status:  statusStr,
                        Threads: threads,
                        FDs:     int32(fds),
                        Nice:    int32(nice),
                        Cmdline: cmdline,
                        CWD:     cwd,
                })
        }

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(entries) //nolint:errcheck
}

func (s *Server) handleProcessGet(w http.ResponseWriter, r *http.Request) {
        pidStr := r.PathValue("pid")
        pidVal, err := strconv.ParseInt(pidStr, 10, 32)
        if err != nil {
                http.Error(w, "bad pid", http.StatusBadRequest)
                return
        }
        ctx := r.Context()
        p, err := process.NewProcessWithContext(ctx, int32(pidVal))
        if err != nil {
                http.Error(w, "process not found", http.StatusNotFound)
                return
        }

        name, _ := p.NameWithContext(ctx)
        cpuPct, _ := p.CPUPercentWithContext(ctx)
        memPct, _ := p.MemoryPercentWithContext(ctx)
        memInfo, _ := p.MemoryInfoWithContext(ctx)
        status, _ := p.StatusWithContext(ctx)
        username, _ := p.UsernameWithContext(ctx)
        ppid, _ := p.PpidWithContext(ctx)
        threads, _ := p.NumThreadsWithContext(ctx)
        fds, _ := p.NumFDsWithContext(ctx)
        nice, _ := p.NiceWithContext(ctx)
        cmdline, _ := p.CmdlineWithContext(ctx)
        cwd, _ := p.CwdWithContext(ctx)

        var rss, virt uint64
        if memInfo != nil {
                rss = memInfo.RSS
                virt = memInfo.VMS
        }
        statusStr := ""
        if len(status) > 0 {
                statusStr = status[0]
        }

        entry := processEntry{
                PID:     p.Pid,
                PPID:    ppid,
                Name:    name,
                User:    username,
                CPUPct:  cpuPct,
                MemPct:  memPct,
                MemRSS:  rss,
                VirtMem: virt,
                Status:  statusStr,
                Threads: threads,
                FDs:     int32(fds),
                Nice:    int32(nice),
                Cmdline: cmdline,
                CWD:     cwd,
        }

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(entry) //nolint:errcheck
}

var signalMap = map[string]syscall.Signal{
        "SIGTERM": syscall.SIGTERM,
        "SIGKILL": syscall.SIGKILL,
        "SIGHUP":  syscall.SIGHUP,
        "SIGSTOP": syscall.SIGSTOP,
        "SIGCONT": syscall.SIGCONT,
        "SIGUSR1": syscall.SIGUSR1,
        "SIGUSR2": syscall.SIGUSR2,
        "SIGINT":  syscall.SIGINT,
}

func (s *Server) handleProcessSignal(w http.ResponseWriter, r *http.Request) {
        pidStr := r.PathValue("pid")
        pidVal, err := strconv.ParseInt(pidStr, 10, 32)
        if err != nil {
                http.Error(w, "bad pid", http.StatusBadRequest)
                return
        }

        var req struct {
                Signal string `json:"signal"`
        }
        if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
                http.Error(w, "bad request", http.StatusBadRequest)
                return
        }
        if req.Signal == "" {
                req.Signal = "SIGTERM"
        }
        req.Signal = strings.ToUpper(req.Signal)

        sig, ok := signalMap[req.Signal]
        if !ok {
                http.Error(w, "unknown signal: "+req.Signal, http.StatusBadRequest)
                return
        }

        proc, err := os.FindProcess(int(pidVal))
        if err != nil {
                http.Error(w, "process not found", http.StatusNotFound)
                return
        }
        if err := proc.Signal(sig); err != nil {
                http.Error(w, "failed to send signal: "+err.Error(), http.StatusInternalServerError)
                return
        }

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]string{"status": "ok", "signal": req.Signal}) //nolint:errcheck
}

// handleProcessBatchSignal sends a signal to multiple PIDs at once.
func (s *Server) handleProcessBatchSignal(w http.ResponseWriter, r *http.Request) {
        var req struct {
                PIDs   []int32 `json:"pids"`
                Signal string  `json:"signal"`
        }
        if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
                http.Error(w, "bad request", http.StatusBadRequest)
                return
        }
        if len(req.PIDs) == 0 {
                http.Error(w, "pids array is required", http.StatusBadRequest)
                return
        }
        if req.Signal == "" {
                req.Signal = "SIGTERM"
        }
        req.Signal = strings.ToUpper(req.Signal)
        sig, ok := signalMap[req.Signal]
        if !ok {
                http.Error(w, "unknown signal: "+req.Signal, http.StatusBadRequest)
                return
        }

        results := make(map[string]string, len(req.PIDs))
        for _, pid := range req.PIDs {
                proc, err := os.FindProcess(int(pid))
                if err != nil {
                        results[strconv.Itoa(int(pid))] = "not found"
                        continue
                }
                if err := proc.Signal(sig); err != nil {
                        results[strconv.Itoa(int(pid))] = "error: " + err.Error()
                } else {
                        results[strconv.Itoa(int(pid))] = "ok"
                }
        }

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]interface{}{ //nolint:errcheck
                "signal":  req.Signal,
                "results": results,
        })
}

// handleProcessRenice changes the scheduling priority (nice value) of a process.
func (s *Server) handleProcessRenice(w http.ResponseWriter, r *http.Request) {
        pidStr := r.PathValue("pid")
        pidVal, err := strconv.ParseInt(pidStr, 10, 32)
        if err != nil {
                http.Error(w, "bad pid", http.StatusBadRequest)
                return
        }

        var req struct {
                Nice int `json:"nice"`
        }
        if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
                http.Error(w, "bad request", http.StatusBadRequest)
                return
        }
        if req.Nice < -20 || req.Nice > 19 {
                http.Error(w, "nice must be between -20 and 19", http.StatusBadRequest)
                return
        }

        if err := syscall.Setpriority(syscall.PRIO_PROCESS, int(pidVal), req.Nice); err != nil {
                http.Error(w, "setpriority failed: "+err.Error(), http.StatusInternalServerError)
                return
        }

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]interface{}{ //nolint:errcheck
                "status": "ok",
                "pid":    pidVal,
                "nice":   req.Nice,
        })
}

// handleProcessOpenFiles returns the list of open files and sockets for a process.
func (s *Server) handleProcessOpenFiles(w http.ResponseWriter, r *http.Request) {
        pidStr := r.PathValue("pid")
        pidVal, err := strconv.ParseInt(pidStr, 10, 32)
        if err != nil {
                http.Error(w, "bad pid", http.StatusBadRequest)
                return
        }

        ctx := r.Context()
        p, err := process.NewProcessWithContext(ctx, int32(pidVal))
        if err != nil {
                http.Error(w, "process not found", http.StatusNotFound)
                return
        }

        openFiles, err := p.OpenFilesWithContext(ctx)
        if err != nil {
                openFiles = nil
        }

        connections, err := p.ConnectionsWithContext(ctx)
        if err != nil {
                connections = nil
        }

        type openFile struct {
                FD   int32  `json:"fd"`
                Path string `json:"path"`
        }
        type connection struct {
                FD     uint32 `json:"fd"`
                Family string `json:"family"`
                Type   string `json:"type"`
                Laddr  string `json:"laddr"`
                Raddr  string `json:"raddr"`
                Status string `json:"status"`
        }

        files := make([]openFile, 0, len(openFiles))
        for _, f := range openFiles {
                files = append(files, openFile{FD: int32(f.Fd), Path: f.Path})
        }

        conns := make([]connection, 0, len(connections))
        for _, c := range connections {
                family := "IPv4"
                if c.Family == 10 {
                        family = "IPv6"
                }
                connType := "TCP"
                if c.Type == 2 {
                        connType = "UDP"
                }
                laddr := ""
                if c.Laddr.IP != "" {
                        laddr = c.Laddr.IP + ":" + strconv.Itoa(int(c.Laddr.Port))
                }
                raddr := ""
                if c.Raddr.IP != "" {
                        raddr = c.Raddr.IP + ":" + strconv.Itoa(int(c.Raddr.Port))
                }
                conns = append(conns, connection{
                        FD:     c.Fd,
                        Family: family,
                        Type:   connType,
                        Laddr:  laddr,
                        Raddr:  raddr,
                        Status: c.Status,
                })
        }

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]interface{}{ //nolint:errcheck
                "pid":         pidVal,
                "open_files":  files,
                "connections": conns,
        })
}

// handleProcessEnviron returns the environment variables of a process from /proc/{pid}/environ.
func (s *Server) handleProcessEnviron(w http.ResponseWriter, r *http.Request) {
        pidStr := r.PathValue("pid")
        pidVal, err := strconv.ParseInt(pidStr, 10, 32)
        if err != nil {
                http.Error(w, "bad pid", http.StatusBadRequest)
                return
        }

        type envVar struct {
                K string `json:"k"`
                V string `json:"v"`
        }

        data, err := os.ReadFile(fmt.Sprintf("/proc/%d/environ", pidVal))
        if err != nil {
                // Not accessible (permission denied or process gone) — return empty
                w.Header().Set("Content-Type", "application/json")
                json.NewEncoder(w).Encode(map[string]interface{}{"vars": []envVar{}}) //nolint:errcheck
                return
        }

        var vars []envVar
        for _, item := range bytes.Split(data, []byte{0}) {
                s := string(item)
                if s == "" {
                        continue
                }
                parts := strings.SplitN(s, "=", 2)
                if len(parts) == 2 {
                        vars = append(vars, envVar{K: parts[0], V: parts[1]})
                } else if parts[0] != "" {
                        vars = append(vars, envVar{K: parts[0], V: ""})
                }
        }
        if vars == nil {
                vars = []envVar{}
        }

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]interface{}{"vars": vars}) //nolint:errcheck
}
