package api

import (
        "archive/tar"
        "archive/zip"
        "compress/gzip"
        "encoding/json"
        "fmt"
        "io"
        "io/fs"
        "net/http"
        "os"
        "path/filepath"
        "sort"
        "strconv"
        "strings"
        "time"
)

// ── File System API ───────────────────────────────────────────────────────────

type fileEntry struct {
        Name      string `json:"name"`
        Path      string `json:"path"`
        Size      int64  `json:"size"`
        Mode      string `json:"mode"`
        ModeOctal string `json:"mode_octal"`
        IsDir     bool   `json:"is_dir"`
        IsSymlink bool   `json:"is_symlink"`
        LinkTarget string `json:"link_target,omitempty"`
        Owner     string `json:"owner"`
        Group     string `json:"group"`
        ModTime   int64  `json:"mod_time"`
        MimeType  string `json:"mime_type,omitempty"`
}

func safeRoot(rawPath string) (string, error) {
        clean := filepath.Clean("/" + strings.TrimPrefix(rawPath, "/"))
        return clean, nil
}

func mimeFromExt(name string) string {
        ext := strings.ToLower(filepath.Ext(name))
        switch ext {
        case ".html", ".htm":
                return "text/html"
        case ".css":
                return "text/css"
        case ".js", ".mjs":
                return "application/javascript"
        case ".json":
                return "application/json"
        case ".xml":
                return "application/xml"
        case ".txt", ".log", ".md":
                return "text/plain"
        case ".sh", ".bash":
                return "text/x-shellscript"
        case ".py":
                return "text/x-python"
        case ".go":
                return "text/x-go"
        case ".png":
                return "image/png"
        case ".jpg", ".jpeg":
                return "image/jpeg"
        case ".gif":
                return "image/gif"
        case ".svg":
                return "image/svg+xml"
        case ".pdf":
                return "application/pdf"
        case ".zip":
                return "application/zip"
        case ".tar":
                return "application/x-tar"
        case ".gz":
                return "application/gzip"
        case ".conf", ".ini", ".toml", ".yaml", ".yml":
                return "text/plain"
        }
        return "application/octet-stream"
}

func statToEntry(info fs.FileInfo, path string) fileEntry {
        entry := fileEntry{
                Name:      info.Name(),
                Path:      path,
                Size:      info.Size(),
                Mode:      info.Mode().String(),
                ModeOctal: fmt.Sprintf("%04o", info.Mode().Perm()),
                IsDir:     info.IsDir(),
                ModTime:   info.ModTime().Unix(),
                MimeType:  mimeFromExt(info.Name()),
        }
        entry.Owner = fileOwner(info)
        entry.Group = fileGroup(info)
        return entry
}

func (s *Server) handleFSList(w http.ResponseWriter, r *http.Request) {
        rawPath := r.URL.Query().Get("path")
        if rawPath == "" {
                rawPath = "/"
        }
        path, err := safeRoot(rawPath)
        if err != nil {
                http.Error(w, "invalid path", http.StatusBadRequest)
                return
        }

        entries, err := os.ReadDir(path)
        if err != nil {
                http.Error(w, "cannot read directory: "+err.Error(), http.StatusNotFound)
                return
        }

        var files []fileEntry
        for _, e := range entries {
                info, err := e.Info()
                if err != nil {
                        continue
                }
                entryPath := filepath.Join(path, e.Name())
                fe := statToEntry(info, entryPath)
                if e.Type()&fs.ModeSymlink != 0 {
                        fe.IsSymlink = true
                        target, _ := os.Readlink(entryPath)
                        fe.LinkTarget = target
                }
                files = append(files, fe)
        }
        if files == nil {
                files = []fileEntry{}
        }
        sort.Slice(files, func(i, j int) bool {
                if files[i].IsDir != files[j].IsDir {
                        return files[i].IsDir
                }
                return files[i].Name < files[j].Name
        })

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]interface{}{ //nolint:errcheck
                "path":  path,
                "files": files,
        })
}

func (s *Server) handleFSStat(w http.ResponseWriter, r *http.Request) {
        rawPath := r.URL.Query().Get("path")
        if rawPath == "" {
                http.Error(w, "path is required", http.StatusBadRequest)
                return
        }
        path, _ := safeRoot(rawPath)
        info, err := os.Lstat(path)
        if err != nil {
                http.Error(w, "not found", http.StatusNotFound)
                return
        }
        fe := statToEntry(info, path)
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(fe) //nolint:errcheck
}

func (s *Server) handleFSRead(w http.ResponseWriter, r *http.Request) {
        rawPath := r.URL.Query().Get("path")
        if rawPath == "" {
                http.Error(w, "path is required", http.StatusBadRequest)
                return
        }
        path, _ := safeRoot(rawPath)

        info, err := os.Stat(path)
        if err != nil {
                http.Error(w, "not found", http.StatusNotFound)
                return
        }
        if info.IsDir() {
                http.Error(w, "path is a directory", http.StatusBadRequest)
                return
        }
        if info.Size() > 10*1024*1024 {
                http.Error(w, "file too large to read (max 10 MB)", http.StatusRequestEntityTooLarge)
                return
        }

        data, err := os.ReadFile(path)
        if err != nil {
                http.Error(w, "read error: "+err.Error(), http.StatusInternalServerError)
                return
        }
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]interface{}{ //nolint:errcheck
                "path":    path,
                "content": string(data),
                "size":    info.Size(),
                "mode":    fmt.Sprintf("%04o", info.Mode().Perm()),
        })
}

func (s *Server) handleFSWrite(w http.ResponseWriter, r *http.Request) {
        var req struct {
                Path    string `json:"path"`
                Content string `json:"content"`
                Mode    string `json:"mode"`
        }
        if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
                http.Error(w, "bad request", http.StatusBadRequest)
                return
        }
        if req.Path == "" {
                http.Error(w, "path is required", http.StatusBadRequest)
                return
        }
        path, _ := safeRoot(req.Path)

        mode := fs.FileMode(0o644)
        if req.Mode != "" {
                if v, err := strconv.ParseUint(req.Mode, 8, 32); err == nil {
                        mode = fs.FileMode(v)
                }
        }

        if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
                http.Error(w, "mkdir error: "+err.Error(), http.StatusInternalServerError)
                return
        }
        if err := os.WriteFile(path, []byte(req.Content), mode); err != nil {
                http.Error(w, "write error: "+err.Error(), http.StatusInternalServerError)
                return
        }

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]interface{}{ //nolint:errcheck
                "ok": true, "path": path, "size": len(req.Content),
        })
}

func (s *Server) handleFSUpload(w http.ResponseWriter, r *http.Request) {
        if err := r.ParseMultipartForm(100 << 20); err != nil {
                http.Error(w, "parse form error: "+err.Error(), http.StatusBadRequest)
                return
        }

        dir := r.FormValue("path")
        if dir == "" {
                dir = "/"
        }
        dir, _ = safeRoot(dir)

        file, header, err := r.FormFile("file")
        if err != nil {
                http.Error(w, "no file in request", http.StatusBadRequest)
                return
        }
        defer file.Close()

        dest := filepath.Join(dir, filepath.Base(header.Filename))
        out, err := os.Create(dest)
        if err != nil {
                http.Error(w, "create error: "+err.Error(), http.StatusInternalServerError)
                return
        }
        defer out.Close()

        n, err := io.Copy(out, file)
        if err != nil {
                http.Error(w, "write error: "+err.Error(), http.StatusInternalServerError)
                return
        }

        w.Header().Set("Content-Type", "application/json")
        w.WriteHeader(http.StatusCreated)
        json.NewEncoder(w).Encode(map[string]interface{}{ //nolint:errcheck
                "ok": true, "path": dest, "size": n, "name": header.Filename,
        })
}

func (s *Server) handleFSDownload(w http.ResponseWriter, r *http.Request) {
        rawPath := r.URL.Query().Get("path")
        if rawPath == "" {
                http.Error(w, "path is required", http.StatusBadRequest)
                return
        }
        path, _ := safeRoot(rawPath)

        info, err := os.Stat(path)
        if err != nil {
                http.Error(w, "not found", http.StatusNotFound)
                return
        }
        if info.IsDir() {
                http.Error(w, "use /api/files/compress to download directories", http.StatusBadRequest)
                return
        }

        w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, info.Name()))
        w.Header().Set("Content-Type", mimeFromExt(info.Name()))
        w.Header().Set("Content-Length", strconv.FormatInt(info.Size(), 10))
        http.ServeFile(w, r, path)
}

func (s *Server) handleFSMkdir(w http.ResponseWriter, r *http.Request) {
        var req struct {
                Path string `json:"path"`
                Mode string `json:"mode"`
        }
        if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
                http.Error(w, "bad request", http.StatusBadRequest)
                return
        }
        if req.Path == "" {
                http.Error(w, "path is required", http.StatusBadRequest)
                return
        }
        path, _ := safeRoot(req.Path)
        mode := fs.FileMode(0o755)
        if req.Mode != "" {
                if v, err := strconv.ParseUint(req.Mode, 8, 32); err == nil {
                        mode = fs.FileMode(v)
                }
        }
        if err := os.MkdirAll(path, mode); err != nil {
                http.Error(w, "mkdir error: "+err.Error(), http.StatusInternalServerError)
                return
        }
        w.Header().Set("Content-Type", "application/json")
        w.WriteHeader(http.StatusCreated)
        json.NewEncoder(w).Encode(map[string]interface{}{"ok": true, "path": path}) //nolint:errcheck
}

func (s *Server) handleFSDelete(w http.ResponseWriter, r *http.Request) {
        var req struct {
                Path      string `json:"path"`
                Recursive bool   `json:"recursive"`
        }
        if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
                http.Error(w, "bad request", http.StatusBadRequest)
                return
        }
        if req.Path == "" {
                http.Error(w, "path is required", http.StatusBadRequest)
                return
        }
        path, _ := safeRoot(req.Path)

        var err error
        if req.Recursive {
                err = os.RemoveAll(path)
        } else {
                err = os.Remove(path)
        }
        if err != nil {
                http.Error(w, "delete error: "+err.Error(), http.StatusInternalServerError)
                return
        }
        w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleFSRename(w http.ResponseWriter, r *http.Request) {
        var req struct {
                OldPath string `json:"old_path"`
                NewPath string `json:"new_path"`
        }
        if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
                http.Error(w, "bad request", http.StatusBadRequest)
                return
        }
        if req.OldPath == "" || req.NewPath == "" {
                http.Error(w, "old_path and new_path are required", http.StatusBadRequest)
                return
        }
        oldPath, _ := safeRoot(req.OldPath)
        newPath, _ := safeRoot(req.NewPath)

        if err := os.Rename(oldPath, newPath); err != nil {
                http.Error(w, "rename error: "+err.Error(), http.StatusInternalServerError)
                return
        }
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]interface{}{"ok": true, "path": newPath}) //nolint:errcheck
}

func (s *Server) handleFSChmod(w http.ResponseWriter, r *http.Request) {
        var req struct {
                Path string `json:"path"`
                Mode string `json:"mode"`
        }
        if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
                http.Error(w, "bad request", http.StatusBadRequest)
                return
        }
        if req.Path == "" || req.Mode == "" {
                http.Error(w, "path and mode are required", http.StatusBadRequest)
                return
        }
        path, _ := safeRoot(req.Path)
        modeVal, err := strconv.ParseUint(req.Mode, 8, 32)
        if err != nil {
                http.Error(w, "invalid mode (use octal like 0755)", http.StatusBadRequest)
                return
        }
        if err := os.Chmod(path, fs.FileMode(modeVal)); err != nil {
                http.Error(w, "chmod error: "+err.Error(), http.StatusInternalServerError)
                return
        }
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]interface{}{"ok": true, "path": path, "mode": req.Mode}) //nolint:errcheck
}

func (s *Server) handleFSChown(w http.ResponseWriter, r *http.Request) {
        var req struct {
                Path  string `json:"path"`
                UID   int    `json:"uid"`
                GID   int    `json:"gid"`
        }
        if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
                http.Error(w, "bad request", http.StatusBadRequest)
                return
        }
        if req.Path == "" {
                http.Error(w, "path is required", http.StatusBadRequest)
                return
        }
        path, _ := safeRoot(req.Path)
        if err := os.Lchown(path, req.UID, req.GID); err != nil {
                http.Error(w, "chown error: "+err.Error(), http.StatusInternalServerError)
                return
        }
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]interface{}{"ok": true, "path": path}) //nolint:errcheck
}

func (s *Server) handleFSSearch(w http.ResponseWriter, r *http.Request) {
        q := r.URL.Query().Get("q")
        rawPath := r.URL.Query().Get("path")
        if rawPath == "" {
                rawPath = "/"
        }
        if q == "" {
                http.Error(w, "q is required", http.StatusBadRequest)
                return
        }
        rootPath, _ := safeRoot(rawPath)
        q = strings.ToLower(q)

        var results []fileEntry
        deadline := time.Now().Add(5 * time.Second)

        filepath.WalkDir(rootPath, func(p string, d fs.DirEntry, err error) error { //nolint:errcheck
                if err != nil || time.Now().After(deadline) {
                        return nil
                }
                if strings.Contains(strings.ToLower(d.Name()), q) {
                        info, err2 := d.Info()
                        if err2 == nil {
                                results = append(results, statToEntry(info, p))
                        }
                }
                if len(results) >= 200 {
                        return filepath.SkipAll
                }
                return nil
        })

        if results == nil {
                results = []fileEntry{}
        }
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]interface{}{ //nolint:errcheck
                "query":   q,
                "root":    rootPath,
                "results": results,
                "count":   len(results),
        })
}

func (s *Server) handleFSCompress(w http.ResponseWriter, r *http.Request) {
        var req struct {
                Paths  []string `json:"paths"`
                Output string   `json:"output"`
                Format string   `json:"format"`
        }
        if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
                http.Error(w, "bad request", http.StatusBadRequest)
                return
        }
        if len(req.Paths) == 0 || req.Output == "" {
                http.Error(w, "paths and output are required", http.StatusBadRequest)
                return
        }
        if req.Format == "" {
                req.Format = "tar.gz"
        }

        outPath, _ := safeRoot(req.Output)

        switch req.Format {
        case "zip":
                outFile, err := os.Create(outPath)
                if err != nil {
                        http.Error(w, "create error: "+err.Error(), http.StatusInternalServerError)
                        return
                }
                zw := zip.NewWriter(outFile)
                for _, srcRaw := range req.Paths {
                        src, _ := safeRoot(srcRaw)
                        filepath.WalkDir(src, func(p string, d fs.DirEntry, err error) error { //nolint:errcheck
                                if err != nil || d.IsDir() {
                                        return nil
                                }
                                rel, _ := filepath.Rel(filepath.Dir(src), p)
                                fw, err2 := zw.Create(rel)
                                if err2 != nil {
                                        return nil
                                }
                                f, err2 := os.Open(p)
                                if err2 != nil {
                                        return nil
                                }
                                defer f.Close()
                                io.Copy(fw, f) //nolint:errcheck
                                return nil
                        })
                }
                zw.Close()
                outFile.Close()

        default: // tar.gz
                outFile, err := os.Create(outPath)
                if err != nil {
                        http.Error(w, "create error: "+err.Error(), http.StatusInternalServerError)
                        return
                }
                gw := gzip.NewWriter(outFile)
                tw := tar.NewWriter(gw)
                for _, srcRaw := range req.Paths {
                        src, _ := safeRoot(srcRaw)
                        filepath.WalkDir(src, func(p string, d fs.DirEntry, err error) error { //nolint:errcheck
                                if err != nil {
                                        return nil
                                }
                                info, err2 := d.Info()
                                if err2 != nil {
                                        return nil
                                }
                                rel, _ := filepath.Rel(filepath.Dir(src), p)
                                hdr, err2 := tar.FileInfoHeader(info, "")
                                if err2 != nil {
                                        return nil
                                }
                                hdr.Name = rel
                                tw.WriteHeader(hdr) //nolint:errcheck
                                if d.IsDir() {
                                        return nil
                                }
                                f, err2 := os.Open(p)
                                if err2 != nil {
                                        return nil
                                }
                                defer f.Close()
                                io.Copy(tw, f) //nolint:errcheck
                                return nil
                        })
                }
                tw.Close()
                gw.Close()
                outFile.Close()
        }

        info, _ := os.Stat(outPath)
        size := int64(0)
        if info != nil {
                size = info.Size()
        }

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]interface{}{ //nolint:errcheck
                "ok": true, "output": outPath, "format": req.Format, "size": size,
        })
}

func (s *Server) handleFSExtract(w http.ResponseWriter, r *http.Request) {
        var req struct {
                Path   string `json:"path"`
                Output string `json:"output"`
        }
        if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
                http.Error(w, "bad request", http.StatusBadRequest)
                return
        }
        if req.Path == "" {
                http.Error(w, "path is required", http.StatusBadRequest)
                return
        }
        srcPath, _ := safeRoot(req.Path)
        if req.Output == "" {
                req.Output = filepath.Dir(srcPath)
        }
        outPath, _ := safeRoot(req.Output)

        if err := os.MkdirAll(outPath, 0o755); err != nil {
                http.Error(w, "mkdir error", http.StatusInternalServerError)
                return
        }

        ext := strings.ToLower(srcPath)
        var extractErr error

        switch {
        case strings.HasSuffix(ext, ".zip"):
                r2, err := zip.OpenReader(srcPath)
                if err != nil {
                        http.Error(w, "zip open error: "+err.Error(), http.StatusInternalServerError)
                        return
                }
                defer r2.Close()
                for _, f := range r2.File {
                        dest := filepath.Join(outPath, f.Name)
                        if f.FileInfo().IsDir() {
                                os.MkdirAll(dest, f.Mode()) //nolint:errcheck
                                continue
                        }
                        os.MkdirAll(filepath.Dir(dest), 0o755) //nolint:errcheck
                        rc, err2 := f.Open()
                        if err2 != nil {
                                continue
                        }
                        df, err2 := os.Create(dest)
                        if err2 != nil {
                                rc.Close()
                                continue
                        }
                        io.Copy(df, rc) //nolint:errcheck
                        df.Close()
                        rc.Close()
                }
        default: // tar.gz / tar
                f, err := os.Open(srcPath)
                if err != nil {
                        http.Error(w, "open error: "+err.Error(), http.StatusInternalServerError)
                        return
                }
                defer f.Close()

                var tr *tar.Reader
                if strings.HasSuffix(ext, ".gz") || strings.HasSuffix(ext, ".tgz") {
                        gr, err2 := gzip.NewReader(f)
                        if err2 != nil {
                                http.Error(w, "gzip error: "+err2.Error(), http.StatusInternalServerError)
                                return
                        }
                        defer gr.Close()
                        tr = tar.NewReader(gr)
                } else {
                        tr = tar.NewReader(f)
                }

                for {
                        hdr, err2 := tr.Next()
                        if err2 == io.EOF {
                                break
                        }
                        if err2 != nil {
                                extractErr = err2
                                break
                        }
                        dest := filepath.Join(outPath, hdr.Name)
                        if hdr.FileInfo().IsDir() {
                                os.MkdirAll(dest, hdr.FileInfo().Mode()) //nolint:errcheck
                                continue
                        }
                        os.MkdirAll(filepath.Dir(dest), 0o755) //nolint:errcheck
                        df, err2 := os.Create(dest)
                        if err2 != nil {
                                continue
                        }
                        io.Copy(df, tr) //nolint:errcheck
                        df.Close()
                }
        }

        if extractErr != nil {
                http.Error(w, "extract error: "+extractErr.Error(), http.StatusInternalServerError)
                return
        }

        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]interface{}{"ok": true, "output": outPath}) //nolint:errcheck
}

// handleFSHex returns a hex dump of the first 256 bytes of a file.
func (s *Server) handleFSHex(w http.ResponseWriter, r *http.Request) {
        path := r.URL.Query().Get("path")
        if path == "" {
                http.Error(w, "path required", http.StatusBadRequest)
                return
        }
        cleanPath, _ := safeRoot(path)
        f, err := os.Open(cleanPath)
        if err != nil {
                http.Error(w, "open error: "+err.Error(), http.StatusInternalServerError)
                return
        }
        defer f.Close()

        buf := make([]byte, 256)
        n, _ := f.Read(buf)
        buf = buf[:n]

        type HexRow struct {
                Addr  string `json:"addr"`
                Bytes string `json:"bytes"`
                ASCII string `json:"ascii"`
        }

        var rows []HexRow
        for i := 0; i < len(buf); i += 16 {
                end := i + 16
                if end > len(buf) {
                        end = len(buf)
                }
                chunk := buf[i:end]

                var hexStr string
                for j, b := range chunk {
                        if j > 0 {
                                if j == 8 {
                                        hexStr += "  "
                                } else {
                                        hexStr += " "
                                }
                        }
                        hexStr += fmt.Sprintf("%02X", b)
                }

                ascii := make([]byte, len(chunk))
                for j, b := range chunk {
                        if b >= 32 && b < 127 {
                                ascii[j] = b
                        } else {
                                ascii[j] = '.'
                        }
                }

                rows = append(rows, HexRow{
                        Addr:  fmt.Sprintf("%08X", i),
                        Bytes: hexStr,
                        ASCII: string(ascii),
                })
        }
        if rows == nil {
                rows = []HexRow{}
        }
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(rows) //nolint:errcheck
}

func fmtArchiveBytes(b int64) string {
        if b == 0 {
                return "-"
        }
        if b < 1024 {
                return fmt.Sprintf("%d B", b)
        }
        if b < 1024*1024 {
                return fmt.Sprintf("%.1f KB", float64(b)/1024)
        }
        return fmt.Sprintf("%.1f MB", float64(b)/(1024*1024))
}

// handleFSArchiveList lists the contents of a zip or tar/tar.gz archive.
func (s *Server) handleFSArchiveList(w http.ResponseWriter, r *http.Request) {
        path := r.URL.Query().Get("path")
        if path == "" {
                http.Error(w, "path required", http.StatusBadRequest)
                return
        }
        cleanPath, _ := safeRoot(path)

        type ArchiveEntry struct {
                Name      string `json:"name"`
                Type      string `json:"type"`
                Size      string `json:"size"`
                SizeBytes int64  `json:"size_bytes"`
                Modified  string `json:"modified"`
        }

        var entries []ArchiveEntry
        ext := strings.ToLower(cleanPath)

        switch {
        case strings.HasSuffix(ext, ".zip"):
                r2, err := zip.OpenReader(cleanPath)
                if err != nil {
                        http.Error(w, "zip error: "+err.Error(), http.StatusInternalServerError)
                        return
                }
                defer r2.Close()
                for _, zf := range r2.File {
                        typ := "file"
                        if zf.FileInfo().IsDir() {
                                typ = "folder"
                        }
                        entries = append(entries, ArchiveEntry{
                                Name:      zf.Name,
                                Type:      typ,
                                SizeBytes: int64(zf.UncompressedSize64),
                                Size:      fmtArchiveBytes(int64(zf.UncompressedSize64)),
                                Modified:  zf.Modified.Format("2006-01-02 15:04"),
                        })
                }
        default:
                tf, err := os.Open(cleanPath)
                if err != nil {
                        http.Error(w, "open error: "+err.Error(), http.StatusInternalServerError)
                        return
                }
                defer tf.Close()

                var tr *tar.Reader
                if strings.HasSuffix(ext, ".gz") || strings.HasSuffix(ext, ".tgz") {
                        gr, err2 := gzip.NewReader(tf)
                        if err2 != nil {
                                http.Error(w, "gzip error: "+err2.Error(), http.StatusInternalServerError)
                                return
                        }
                        defer gr.Close()
                        tr = tar.NewReader(gr)
                } else {
                        tr = tar.NewReader(tf)
                }

                for {
                        hdr, err2 := tr.Next()
                        if err2 == io.EOF {
                                break
                        }
                        if err2 != nil {
                                break
                        }
                        typ := "file"
                        if hdr.FileInfo().IsDir() {
                                typ = "folder"
                        }
                        entries = append(entries, ArchiveEntry{
                                Name:      hdr.Name,
                                Type:      typ,
                                SizeBytes: hdr.Size,
                                Size:      fmtArchiveBytes(hdr.Size),
                                Modified:  hdr.ModTime.Format("2006-01-02 15:04"),
                        })
                }
        }

        if entries == nil {
                entries = []ArchiveEntry{}
        }
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(entries) //nolint:errcheck
}
