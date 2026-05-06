package api

import (
        "bufio"
        "bytes"
        "encoding/json"
        "net/http"
        "os/exec"
        "strings"
        "time"

        "github.com/gorilla/websocket"
)

// containerInfo matches the Container type expected by the frontend:
// { id, name, image, status, state, cpu_pct, mem_bytes, mem_limit }
type containerInfo struct {
        ID       string  `json:"id"`
        Name     string  `json:"name"`
        Image    string  `json:"image"`
        State    string  `json:"state"`
        Status   string  `json:"status"`
        CpuPct   float64 `json:"cpu_pct"`
        MemBytes int64   `json:"mem_bytes"`
        MemLimit int64   `json:"mem_limit"`
}

type imageInfo struct {
        ID         string `json:"id"`
        Repository string `json:"repository"`
        Tag        string `json:"tag"`
        Size       string `json:"size"`
        Created    string `json:"created"`
}

func (s *Server) handleContainerList(w http.ResponseWriter, r *http.Request) {
        containers := listDockerContainers()
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(containers) //nolint:errcheck
}

func listDockerContainers() []containerInfo {
        type rawItem struct {
                ID     string `json:"ID"`
                Names  string `json:"Names"`
                Image  string `json:"Image"`
                State  string `json:"State"`
                Status string `json:"Status"`
                Ports  string `json:"Ports"`
        }

        out, err := exec.Command("docker", "ps", "-a",
                "--format", `{"ID":"{{.ID}}","Names":"{{.Names}}","Image":"{{.Image}}","State":"{{.State}}","Status":"{{.Status}}","Ports":"{{.Ports}}"}`,
        ).Output()
        if err != nil {
                return []containerInfo{}
        }

        var result []containerInfo
        for _, line := range splitLines(string(out)) {
                var item rawItem
                if err := json.Unmarshal([]byte(line), &item); err != nil {
                        continue
                }
                name := strings.TrimPrefix(item.Names, "/")
                result = append(result, containerInfo{
                        ID:       item.ID,
                        Name:     name,
                        Image:    item.Image,
                        State:    item.State,
                        Status:   item.Status,
                        CpuPct:   0,
                        MemBytes: 0,
                        MemLimit: 0,
                })
        }
        if result == nil {
                return []containerInfo{}
        }
        return result
}

func splitLines(s string) []string {
        var lines []string
        start := 0
        for i, c := range s {
                if c == '\n' {
                        line := s[start:i]
                        if line != "" {
                                lines = append(lines, line)
                        }
                        start = i + 1
                }
        }
        if start < len(s) && s[start:] != "" {
                lines = append(lines, s[start:])
        }
        return lines
}

func (s *Server) handleContainerStart(w http.ResponseWriter, r *http.Request) {
        id := r.PathValue("id")
        out, err := exec.Command("docker", "start", id).CombinedOutput()
        if err != nil {
                http.Error(w, "failed to start container: "+string(out), http.StatusInternalServerError)
                return
        }
        w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleContainerStop(w http.ResponseWriter, r *http.Request) {
        id := r.PathValue("id")
        out, err := exec.Command("docker", "stop", id).CombinedOutput()
        if err != nil {
                http.Error(w, "failed to stop container: "+string(out), http.StatusInternalServerError)
                return
        }
        w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleContainerRestart(w http.ResponseWriter, r *http.Request) {
        id := r.PathValue("id")
        out, err := exec.Command("docker", "restart", id).CombinedOutput()
        if err != nil {
                http.Error(w, "failed to restart container: "+string(out), http.StatusInternalServerError)
                return
        }
        w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleContainerRemove(w http.ResponseWriter, r *http.Request) {
        id := r.PathValue("id")
        force := r.URL.Query().Get("force")
        args := []string{"rm"}
        if force == "true" || force == "1" {
                args = append(args, "-f")
        }
        args = append(args, id)
        out, err := exec.Command("docker", args...).CombinedOutput()
        if err != nil {
                http.Error(w, "failed to remove container: "+string(out), http.StatusInternalServerError)
                return
        }
        w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleContainerInspect(w http.ResponseWriter, r *http.Request) {
        id := r.PathValue("id")
        out, err := exec.Command("docker", "inspect", id).Output()
        if err != nil {
                http.Error(w, "container not found", http.StatusNotFound)
                return
        }
        var arr []json.RawMessage
        if err := json.Unmarshal(out, &arr); err != nil || len(arr) == 0 {
                http.Error(w, "failed to parse inspect output", http.StatusInternalServerError)
                return
        }
        w.Header().Set("Content-Type", "application/json")
        w.Write(arr[0]) //nolint:errcheck
}

// handleContainerStatsWS streams live docker stats over WebSocket.
func (s *Server) handleContainerStatsWS(w http.ResponseWriter, r *http.Request) {
        id := r.PathValue("id")

        conn, err := wsUpgrader.Upgrade(w, r, nil)
        if err != nil {
                return
        }
        defer conn.Close()

        cmd := exec.CommandContext(r.Context(), "docker", "stats", "--no-trunc", "--format",
                `{"id":"{{.ID}}","name":"{{.Name}}","cpu":"{{.CPUPerc}}","mem":"{{.MemUsage}}","mem_pct":"{{.MemPerc}}","net":"{{.NetIO}}","block":"{{.BlockIO}}","pids":"{{.PIDs}}"}`,
                id)
        stdout, err := cmd.StdoutPipe()
        if err != nil {
                conn.WriteMessage(websocket.TextMessage, []byte(`{"error":"cannot get stats"}`)) //nolint:errcheck
                return
        }
        if err := cmd.Start(); err != nil {
                conn.WriteMessage(websocket.TextMessage, []byte(`{"error":"docker not available"}`)) //nolint:errcheck
                return
        }
        defer cmd.Wait() //nolint:errcheck

        scanner := bufio.NewScanner(stdout)
        for scanner.Scan() {
                line := scanner.Text()
                if line == "" {
                        continue
                }
                var raw json.RawMessage
                if err := json.Unmarshal([]byte(line), &raw); err != nil {
                        continue
                }
                msg, _ := json.Marshal(map[string]interface{}{
                        "type":    "stats",
                        "payload": raw,
                        "ts":      time.Now().UnixMilli(),
                })
                if err := conn.WriteMessage(websocket.TextMessage, msg); err != nil {
                        return
                }
        }
}

func (s *Server) handleContainerLogsWS(w http.ResponseWriter, r *http.Request) {
        id := r.PathValue("id")

        conn, err := wsUpgrader.Upgrade(w, r, nil)
        if err != nil {
                return
        }
        defer conn.Close()

        tail := r.URL.Query().Get("tail")
        if tail == "" {
                tail = "100"
        }

        cmd := exec.CommandContext(r.Context(), "docker", "logs", "--follow", "--tail", tail, id)
        stdout, err := cmd.StdoutPipe()
        if err != nil {
                conn.WriteMessage(websocket.TextMessage, []byte(`{"error":"cannot get logs"}`)) //nolint:errcheck
                return
        }
        cmd.Stderr = cmd.Stdout
        if err := cmd.Start(); err != nil {
                conn.WriteMessage(websocket.TextMessage, []byte(`{"error":"docker not available"}`)) //nolint:errcheck
                return
        }
        defer cmd.Wait() //nolint:errcheck

        scanner := bufio.NewScanner(stdout)
        for scanner.Scan() {
                line := scanner.Text()
                data, _ := json.Marshal(map[string]string{"line": line})
                if err := conn.WriteMessage(websocket.TextMessage, data); err != nil {
                        return
                }
        }
}

func (s *Server) handleImageList(w http.ResponseWriter, r *http.Request) {
        out, err := exec.Command("docker", "images",
                "--format", `{"id":"{{.ID}}","repository":"{{.Repository}}","tag":"{{.Tag}}","size":"{{.Size}}","created":"{{.CreatedSince}}"}`,
        ).Output()
        if err != nil {
                w.Header().Set("Content-Type", "application/json")
                json.NewEncoder(w).Encode([]imageInfo{}) //nolint:errcheck
                return
        }

        var images []imageInfo
        for _, line := range splitLines(string(out)) {
                var img imageInfo
                if err := json.Unmarshal([]byte(line), &img); err != nil {
                        continue
                }
                images = append(images, img)
        }
        if images == nil {
                images = []imageInfo{}
        }
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(images) //nolint:errcheck
}

func (s *Server) handleImageRemove(w http.ResponseWriter, r *http.Request) {
        id := r.PathValue("id")
        force := r.URL.Query().Get("force")
        args := []string{"rmi"}
        if force == "true" || force == "1" {
                args = append(args, "-f")
        }
        args = append(args, id)
        out, err := exec.Command("docker", args...).CombinedOutput()
        if err != nil {
                http.Error(w, "failed to remove image: "+string(out), http.StatusInternalServerError)
                return
        }
        w.WriteHeader(http.StatusNoContent)
}

// ── Docker Volumes ─────────────────────────────────────────────────────────────

type volumeInfo struct {
        Name       string `json:"name"`
        Driver     string `json:"driver"`
        Mountpoint string `json:"mountpoint"`
        Size       string `json:"size"`
        UsedBy     []string `json:"usedBy"`
        Created    string `json:"created"`
}

func (s *Server) handleVolumeList(w http.ResponseWriter, r *http.Request) {
        type rawVol struct {
                Name       string `json:"Name"`
                Driver     string `json:"Driver"`
                Mountpoint string `json:"Mountpoint"`
                CreatedAt  string `json:"CreatedAt"`
        }

        out, err := exec.Command("docker", "volume", "ls",
                "--format", `{"Name":"{{.Name}}","Driver":"{{.Driver}}","Mountpoint":"{{.Mountpoint}}","CreatedAt":"{{.CreatedAt}}"}`,
        ).Output()
        if err != nil {
                w.Header().Set("Content-Type", "application/json")
                json.NewEncoder(w).Encode([]volumeInfo{}) //nolint:errcheck
                return
        }

        // Build a map of volume name -> containers using it
        usageMap := buildVolumeUsage()

        var vols []volumeInfo
        for _, line := range splitLines(string(out)) {
                var rv rawVol
                if err := json.Unmarshal([]byte(line), &rv); err != nil {
                        continue
                }
                used := usageMap[rv.Name]
                if used == nil {
                        used = []string{}
                }
                vols = append(vols, volumeInfo{
                        Name:       rv.Name,
                        Driver:     rv.Driver,
                        Mountpoint: rv.Mountpoint,
                        Size:       volumeSize(rv.Name),
                        UsedBy:     used,
                        Created:    rv.CreatedAt,
                })
        }
        if vols == nil {
                vols = []volumeInfo{}
        }
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(vols) //nolint:errcheck
}

// buildVolumeUsage returns a map from volume name to list of container names using it.
func buildVolumeUsage() map[string][]string {
        type rawMount struct {
                Type   string `json:"Type"`
                Name   string `json:"Name"`
                Source string `json:"Source"`
        }
        type rawCont struct {
                Names  string `json:"Names"`
                Mounts string `json:"Mounts"`
        }

        out, err := exec.Command("docker", "ps", "-a",
                "--format", `{"Names":"{{.Names}}","Mounts":"{{.Mounts}}"}`,
        ).Output()
        if err != nil {
                return map[string][]string{}
        }

        result := map[string][]string{}
        for _, line := range splitLines(string(out)) {
                var rc rawCont
                if err := json.Unmarshal([]byte(line), &rc); err != nil {
                        continue
                }
                name := strings.TrimPrefix(rc.Names, "/")
                for _, m := range strings.Split(rc.Mounts, ",") {
                        m = strings.TrimSpace(m)
                        if m != "" {
                                result[m] = append(result[m], name)
                        }
                }
        }
        return result
}

// volumeSize queries df for a volume mountpoint size. Returns "—" on error.
func volumeSize(name string) string {
        out, err := exec.Command("docker", "system", "df", "-v",
                "--format", `{"VolumeName":"{{.Name}}","Size":"{{.Size}}"}`,
        ).Output()
        if err != nil {
                return "—"
        }
        type entry struct {
                Name string `json:"VolumeName"`
                Size string `json:"Size"`
        }
        for _, line := range splitLines(string(out)) {
                var e entry
                if err := json.Unmarshal([]byte(line), &e); err != nil {
                        continue
                }
                if e.Name == name {
                        return e.Size
                }
        }
        return "—"
}

// ── Docker Networks ────────────────────────────────────────────────────────────

type networkInfo struct {
        ID         string `json:"id"`
        Name       string `json:"name"`
        Driver     string `json:"driver"`
        Subnet     string `json:"subnet"`
        Gateway    string `json:"gateway"`
        Containers int    `json:"containers"`
        Created    string `json:"created"`
        Internal   bool   `json:"internal"`
}

func (s *Server) handleNetworkList(w http.ResponseWriter, r *http.Request) {
        type rawNet struct {
                ID       string `json:"ID"`
                Name     string `json:"Name"`
                Driver   string `json:"Driver"`
                Scope    string `json:"Scope"`
                Internal string `json:"Internal"`
                CreatedAt string `json:"CreatedAt"`
        }

        out, err := exec.Command("docker", "network", "ls",
                "--format", `{"ID":"{{.ID}}","Name":"{{.Name}}","Driver":"{{.Driver}}","Scope":"{{.Scope}}","Internal":"{{.Internal}}","CreatedAt":"{{.CreatedAt}}"}`,
        ).Output()
        if err != nil {
                w.Header().Set("Content-Type", "application/json")
                json.NewEncoder(w).Encode([]networkInfo{}) //nolint:errcheck
                return
        }

        var nets []networkInfo
        for _, line := range splitLines(string(out)) {
                var rn rawNet
                if err := json.Unmarshal([]byte(line), &rn); err != nil {
                        continue
                }
                subnet, gateway := inspectNetworkSubnet(rn.ID)
                containers := countNetworkContainers(rn.ID)
                nets = append(nets, networkInfo{
                        ID:         rn.ID,
                        Name:       rn.Name,
                        Driver:     rn.Driver,
                        Subnet:     subnet,
                        Gateway:    gateway,
                        Containers: containers,
                        Created:    rn.CreatedAt,
                        Internal:   rn.Internal == "true",
                })
        }
        if nets == nil {
                nets = []networkInfo{}
        }
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(nets) //nolint:errcheck
}

func inspectNetworkSubnet(id string) (subnet, gateway string) {
        out, err := exec.Command("docker", "network", "inspect", id,
                "--format", `{{range .IPAM.Config}}{{.Subnet}}|{{.Gateway}}{{end}}`,
        ).Output()
        if err != nil || len(out) == 0 {
                return "—", "—"
        }
        parts := strings.SplitN(strings.TrimSpace(string(out)), "|", 2)
        if len(parts) == 2 {
                s := parts[0]
                g := parts[1]
                if s == "" {
                        s = "—"
                }
                if g == "" {
                        g = "—"
                }
                return s, g
        }
        return "—", "—"
}

func countNetworkContainers(id string) int {
        out, err := exec.Command("docker", "network", "inspect", id,
                "--format", `{{len .Containers}}`,
        ).Output()
        if err != nil {
                return 0
        }
        n := 0
        for _, b := range strings.TrimSpace(string(out)) {
                if b >= '0' && b <= '9' {
                        n = n*10 + int(b-'0')
                }
        }
        return n
}

// ── Docker System Info ─────────────────────────────────────────────────────────

type dockerSystemInfo struct {
        Version       string `json:"version"`
        APIVersion    string `json:"apiVersion"`
        GoVersion     string `json:"goVersion"`
        OS            string `json:"os"`
        Arch          string `json:"arch"`
        KernelVersion string `json:"kernelVersion"`
        DiskUsage     string `json:"diskUsage"`
        ImagesCount   int    `json:"imagesCount"`
        VolumesCount  int    `json:"volumesCount"`
        NetworksCount int    `json:"networksCount"`
        BuildHash     string `json:"buildHash,omitempty"`
        DiskTotal     int64  `json:"diskTotal,omitempty"`
        DiskUsed      int64  `json:"diskUsed,omitempty"`
}

func (s *Server) handleDockerSystemInfo(w http.ResponseWriter, r *http.Request) {
        type dockerVersion struct {
                Version       string `json:"Version"`
                APIVersion    string `json:"ApiVersion"`
                GoVersion     string `json:"GoVersion"`
                GitCommit     string `json:"GitCommit"`
                Os            string `json:"Os"`
                Arch          string `json:"Arch"`
                KernelVersion string `json:"KernelVersion"`
        }

        info := dockerSystemInfo{
                Version:       "—",
                APIVersion:    "—",
                OS:            "—",
                Arch:          "—",
                KernelVersion: "—",
                DiskUsage:     "—",
        }

        // Get docker version
        vout, err := exec.Command("docker", "version", "--format",
                `{"Version":"{{.Server.Version}}","ApiVersion":"{{.Server.APIVersion}}","GoVersion":"{{.Server.GoVersion}}","GitCommit":"{{.Server.GitCommit}}","Os":"{{.Server.Os}}","Arch":"{{.Server.Arch}}","KernelVersion":"{{.Server.KernelVersion}}"}`,
        ).Output()
        if err == nil && len(vout) > 0 {
                var dv dockerVersion
                if json.Unmarshal(bytes.TrimSpace(vout), &dv) == nil {
                        info.Version = dv.Version
                        info.APIVersion = dv.APIVersion
                        info.GoVersion = dv.GoVersion
                        info.BuildHash = dv.GitCommit
                        info.OS = dv.Os
                        info.Arch = dv.Arch
                        info.KernelVersion = dv.KernelVersion
                }
        }

        // Count images
        if iout, err := exec.Command("docker", "images", "-q").Output(); err == nil {
                info.ImagesCount = len(splitLines(string(iout)))
        }
        // Count volumes
        if vout2, err := exec.Command("docker", "volume", "ls", "-q").Output(); err == nil {
                info.VolumesCount = len(splitLines(string(vout2)))
        }
        // Count networks
        if nout, err := exec.Command("docker", "network", "ls", "-q").Output(); err == nil {
                info.NetworksCount = len(splitLines(string(nout)))
        }

        // Disk usage
        type dfEntry struct {
                Type       string `json:"Type"`
                Active     int    `json:"Active"`
                Size       string `json:"Size"`
                Reclaimable string `json:"Reclaimable"`
        }
        if dfout, err := exec.Command("docker", "system", "df", "--format",
                `{"Type":"{{.Type}}","Active":{{.Active}},"Size":"{{.Size}}","Reclaimable":"{{.Reclaimable}}"}`,
        ).Output(); err == nil {
                var totalSize string
                for _, line := range splitLines(string(dfout)) {
                        var e dfEntry
                        if json.Unmarshal([]byte(line), &e) == nil && e.Type == "Images" {
                                totalSize = e.Size
                        }
                }
                if totalSize != "" {
                        info.DiskUsage = totalSize
                }
        }

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(info) //nolint:errcheck
}

// ── System Prune ───────────────────────────────────────────────────────────────

func (s *Server) handleSystemPrune(w http.ResponseWriter, r *http.Request) {
        all := r.URL.Query().Get("all") == "true"
        args := []string{"system", "prune", "-f"}
        if all {
                args = append(args, "-a")
        }
        out, err := exec.Command("docker", args...).CombinedOutput()
        reclaimed := "unknown"
        if err == nil {
                for _, line := range splitLines(string(out)) {
                        if strings.Contains(line, "Total reclaimed space") {
                                parts := strings.SplitN(line, ":", 2)
                                if len(parts) == 2 {
                                        reclaimed = strings.TrimSpace(parts[1])
                                }
                        }
                }
        }
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]string{"reclaimed": reclaimed}) //nolint:errcheck
}

// ── Image Pull ─────────────────────────────────────────────────────────────────

func (s *Server) handleImagePull(w http.ResponseWriter, r *http.Request) {
        var req struct {
                Image string `json:"image"`
        }
        if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Image == "" {
                http.Error(w, "image name required", http.StatusBadRequest)
                return
        }
        out, err := exec.Command("docker", "pull", req.Image).CombinedOutput()
        if err != nil {
                http.Error(w, "pull failed: "+string(out), http.StatusInternalServerError)
                return
        }
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]string{"status": "ok", "output": string(out)}) //nolint:errcheck
}

// ── Container Create ───────────────────────────────────────────────────────────

func (s *Server) handleContainerCreate(w http.ResponseWriter, r *http.Request) {
        var req struct {
                Image   string   `json:"image"`
                Name    string   `json:"name"`
                Ports   []string `json:"ports"`
                Env     []string `json:"env"`
                Volumes []string `json:"volumes"`
                Restart string   `json:"restart"`
                Command []string `json:"command"`
        }
        if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Image == "" {
                http.Error(w, "image name required", http.StatusBadRequest)
                return
        }

        args := []string{"run", "-d"}
        if req.Name != "" {
                args = append(args, "--name", req.Name)
        }
        if req.Restart != "" {
                args = append(args, "--restart", req.Restart)
        }
        for _, p := range req.Ports {
                args = append(args, "-p", p)
        }
        for _, e := range req.Env {
                args = append(args, "-e", e)
        }
        for _, v := range req.Volumes {
                args = append(args, "-v", v)
        }
        args = append(args, req.Image)
        args = append(args, req.Command...)

        out, err := exec.Command("docker", args...).CombinedOutput()
        if err != nil {
                http.Error(w, "create failed: "+string(out), http.StatusInternalServerError)
                return
        }
        id := strings.TrimSpace(string(out))
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]string{"id": id}) //nolint:errcheck
}
