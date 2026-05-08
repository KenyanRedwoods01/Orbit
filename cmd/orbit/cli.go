package main

import (
	"archive/tar"
	"compress/gzip"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"github.com/KenyanRedwoods01/Orbit/internal/auth"
	"github.com/KenyanRedwoods01/Orbit/internal/config"
	_ "github.com/mattn/go-sqlite3"
)

func runSubcommand(args []string) {
	if len(args) == 0 {
		printCLIHelp()
		os.Exit(1)
	}

	switch args[0] {
	case "help", "--help", "-h":
		printCLIHelp()
	case "reset-admin":
		cmdResetAdmin(args[1:])
	case "update":
		cmdUpdate(args[1:], "")
	case "upgrade":
		cmdUpgrade(args[1:])
	default:
		fmt.Fprintf(os.Stderr, "orbit: unknown subcommand %q\n\n", args[0])
		printCLIHelp()
		os.Exit(1)
	}
}

func printCLIHelp() {
	fmt.Print(`Orbit CLI Agent

Usage:
  orbit [flags]                       Start the Orbit server (default)
  orbit reset-admin [options]         Reset admin credentials
  orbit update [options]              Update to the latest release
  orbit upgrade [options]             Upgrade/downgrade to a specific version

Flags (server mode):
  --config <path>   Config file (default: /etc/orbit/orbit.toml)
  --version         Print version and exit

Subcommand options:

  reset-admin
    --config <path>    Config file to locate data directory
    --username <name>  New admin username (default: keep existing)
    --password <pass>  New admin password

  update
    --config <path>    Config file to locate data directory
    --yes              Skip confirmation prompt

  upgrade
    --version <tag>    Target version tag (e.g. v0.2.0); defaults to latest
    --config <path>    Config file to locate data directory
    --yes              Skip confirmation prompt

Examples:
  orbit reset-admin --password mysecretpass
  orbit update --yes
  orbit upgrade --version v0.2.0
  orbit upgrade --yes

Source: https://github.com/KenyanRedwoods01/Orbit/releases
`)
}

// ── reset-admin ────────────────────────────────────────────────────────────────

func cmdResetAdmin(args []string) {
	fs := flag.NewFlagSet("reset-admin", flag.ExitOnError)
	cfgPath := fs.String("config", "/etc/orbit/orbit.toml", "path to config file")
	newUser := fs.String("username", "", "new admin username (blank = keep existing)")
	newPass := fs.String("password", "", "new admin password (required)")
	fs.Parse(args) //nolint:errcheck

	cfg, err := config.Load(*cfgPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "orbit reset-admin: failed to load config: %v\n", err)
		os.Exit(1)
	}

	dbPath := filepath.Join(cfg.DataDir, "orbit.db")
	db, err := sql.Open("sqlite3", dbPath+"?_journal_mode=WAL&_foreign_keys=on")
	if err != nil {
		fmt.Fprintf(os.Stderr, "orbit reset-admin: failed to open database at %s: %v\n", dbPath, err)
		os.Exit(1)
	}
	defer db.Close()

	var currentUser string
	if scanErr := db.QueryRow(`SELECT username FROM users ORDER BY id ASC LIMIT 1`).Scan(&currentUser); scanErr != nil {
		fmt.Fprintf(os.Stderr, "orbit reset-admin: no users found — run orbit first to complete setup.\n")
		os.Exit(1)
	}

	if *newPass == "" {
		fmt.Fprintf(os.Stderr, "orbit reset-admin: --password is required\n")
		fs.Usage()
		os.Exit(1)
	}
	if len(*newPass) < 8 {
		fmt.Fprintf(os.Stderr, "orbit reset-admin: password must be at least 8 characters\n")
		os.Exit(1)
	}

	hash, err := auth.HashPassword(*newPass)
	if err != nil {
		fmt.Fprintf(os.Stderr, "orbit reset-admin: failed to hash password: %v\n", err)
		os.Exit(1)
	}

	targetUser := currentUser
	if *newUser != "" {
		targetUser = *newUser
		if _, execErr := db.Exec(`UPDATE users SET username = ?, pw_hash = ? WHERE username = ?`, targetUser, hash, currentUser); execErr != nil {
			fmt.Fprintf(os.Stderr, "orbit reset-admin: database update failed: %v\n", execErr)
			os.Exit(1)
		}
	} else {
		if _, execErr := db.Exec(`UPDATE users SET pw_hash = ? WHERE username = ?`, hash, currentUser); execErr != nil {
			fmt.Fprintf(os.Stderr, "orbit reset-admin: database update failed: %v\n", execErr)
			os.Exit(1)
		}
	}

	db.Exec(`DELETE FROM sessions`) //nolint:errcheck

	fmt.Printf("Admin credentials reset successfully.\n")
	fmt.Printf("  Username : %s\n", targetUser)
	fmt.Printf("  Sessions : all invalidated\n")
	fmt.Printf("  Next step: systemctl restart orbit\n")
}

// ── update ────────────────────────────────────────────────────────────────────

func cmdUpdate(args []string, forceVersion string) {
	fs := flag.NewFlagSet("update", flag.ExitOnError)
	cfgPath := fs.String("config", "/etc/orbit/orbit.toml", "path to config file")
	yes := fs.Bool("yes", false, "skip confirmation prompt")
	fs.Parse(args) //nolint:errcheck

	_ = *cfgPath

	client := &http.Client{Timeout: 30 * time.Second}
	targetTag := forceVersion

	if targetTag == "" {
		fmt.Println("Fetching latest release from GitHub…")
		resp, err := client.Get("https://api.github.com/repos/KenyanRedwoods01/Orbit/releases/latest")
		if err != nil {
			fmt.Fprintf(os.Stderr, "orbit update: network error: %v\n", err)
			os.Exit(1)
		}
		defer resp.Body.Close()
		if resp.StatusCode != 200 {
			fmt.Fprintf(os.Stderr, "orbit update: GitHub API returned HTTP %d\n", resp.StatusCode)
			os.Exit(1)
		}
		var rel struct {
			TagName string `json:"tag_name"`
			Name    string `json:"name"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&rel); err != nil || rel.TagName == "" {
			fmt.Fprintf(os.Stderr, "orbit update: failed to parse release info: %v\n", err)
			os.Exit(1)
		}
		targetTag = rel.TagName
		fmt.Printf("Latest release : %s\n", targetTag)
	}

	goos := runtime.GOOS
	goarch := runtime.GOARCH
	assetName := fmt.Sprintf("orbit_%s_%s.tar.gz", goos, goarch)
	downloadURL := fmt.Sprintf(
		"https://github.com/KenyanRedwoods01/Orbit/releases/download/%s/%s",
		targetTag, assetName,
	)
	checksumURL := fmt.Sprintf(
		"https://github.com/KenyanRedwoods01/Orbit/releases/download/%s/checksums.txt",
		targetTag,
	)

	execPath, err := os.Executable()
	if err != nil {
		fmt.Fprintf(os.Stderr, "orbit update: cannot determine executable path: %v\n", err)
		os.Exit(1)
	}
	if resolved, err2 := filepath.EvalSymlinks(execPath); err2 == nil {
		execPath = resolved
	}

	if !*yes {
		fmt.Printf("\nThis will install Orbit %s\n", targetTag)
		fmt.Printf("  Binary  : %s\n", execPath)
		fmt.Printf("  Download: %s\n", downloadURL)
		fmt.Printf("\nProceed? [y/N] ")
		var answer string
		fmt.Scanln(&answer) //nolint:errcheck
		if !strings.EqualFold(strings.TrimSpace(answer), "y") {
			fmt.Println("Cancelled.")
			os.Exit(0)
		}
	}

	tmpFile, err := os.CreateTemp("", "orbit-update-*.tar.gz")
	if err != nil {
		fmt.Fprintf(os.Stderr, "orbit update: failed to create temp file: %v\n", err)
		os.Exit(1)
	}
	tmpPath := tmpFile.Name()
	defer os.Remove(tmpPath)

	fmt.Printf("Downloading %s…\n", assetName)
	dlResp, err := client.Get(downloadURL)
	if err != nil {
		fmt.Fprintf(os.Stderr, "orbit update: download request failed: %v\n", err)
		os.Exit(1)
	}
	defer dlResp.Body.Close()
	if dlResp.StatusCode != 200 {
		fmt.Fprintf(os.Stderr, "orbit update: download returned HTTP %d — release asset may not exist yet\n", dlResp.StatusCode)
		fmt.Fprintf(os.Stderr, "  Check available assets at: https://github.com/KenyanRedwoods01/Orbit/releases/tag/%s\n", targetTag)
		os.Exit(1)
	}

	hasher := sha256.New()
	if _, err := io.Copy(io.MultiWriter(tmpFile, hasher), dlResp.Body); err != nil {
		tmpFile.Close()
		fmt.Fprintf(os.Stderr, "orbit update: download write failed: %v\n", err)
		os.Exit(1)
	}
	tmpFile.Close()

	expectedHash := fetchChecksum(client, checksumURL, assetName)
	if expectedHash != "" {
		actualHash := hex.EncodeToString(hasher.Sum(nil))
		if !strings.EqualFold(actualHash, expectedHash) {
			fmt.Fprintf(os.Stderr, "orbit update: checksum mismatch — download may be corrupted\n")
			fmt.Fprintf(os.Stderr, "  expected : %s\n  actual   : %s\n", expectedHash, actualHash)
			os.Exit(1)
		}
		fmt.Println("Checksum verified.")
	}

	backupPath := execPath + ".bak"
	if err := os.Rename(execPath, backupPath); err != nil {
		fmt.Fprintf(os.Stderr, "orbit update: failed to backup binary: %v\n", err)
		os.Exit(1)
	}

	if err := installFromTarGz(tmpPath, execPath); err != nil {
		if err2 := os.Rename(backupPath, execPath); err2 != nil {
			fmt.Fprintf(os.Stderr, "orbit update: CRITICAL — could not restore backup: %v\n", err2)
		}
		fmt.Fprintf(os.Stderr, "orbit update: installation failed: %v\n", err)
		os.Exit(1)
	}
	os.Remove(backupPath) //nolint:errcheck

	fmt.Printf("Orbit %s installed successfully.\n", targetTag)
	fmt.Printf("  Restart: systemctl restart orbit\n")
}

func fetchChecksum(client *http.Client, url, filename string) string {
	resp, err := client.Get(url)
	if err != nil || resp.StatusCode != 200 {
		return ""
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(resp.Body)
	for _, line := range strings.Split(string(data), "\n") {
		parts := strings.Fields(line)
		if len(parts) == 2 && parts[1] == filename {
			return parts[0]
		}
	}
	return ""
}

func installFromTarGz(tarGzPath, destPath string) error {
	f, err := os.Open(tarGzPath)
	if err != nil {
		return fmt.Errorf("open archive: %w", err)
	}
	defer f.Close()

	gz, err := gzip.NewReader(f)
	if err != nil {
		return fmt.Errorf("decompress: %w", err)
	}
	defer gz.Close()

	tr := tar.NewReader(gz)
	for {
		hdr, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return fmt.Errorf("read archive entry: %w", err)
		}
		base := filepath.Base(hdr.Name)
		if base != "orbit" && base != "orbit.exe" {
			continue
		}
		tmpBin := destPath + ".new"
		out, err := os.OpenFile(tmpBin, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o755)
		if err != nil {
			return fmt.Errorf("create output file: %w", err)
		}
		if _, err := io.Copy(out, tr); err != nil {
			out.Close()
			os.Remove(tmpBin)
			return fmt.Errorf("write binary: %w", err)
		}
		out.Close()
		return os.Rename(tmpBin, destPath)
	}
	return fmt.Errorf("orbit binary not found in archive")
}

// ── upgrade ───────────────────────────────────────────────────────────────────

func cmdUpgrade(args []string) {
	fs := flag.NewFlagSet("upgrade", flag.ExitOnError)
	targetVersion := fs.String("version", "", "target version tag (e.g. v0.2.0); defaults to latest")
	cfgPath := fs.String("config", "/etc/orbit/orbit.toml", "path to config file")
	yes := fs.Bool("yes", false, "skip confirmation prompt")
	fs.Parse(args) //nolint:errcheck

	passArgs := []string{}
	if *cfgPath != "/etc/orbit/orbit.toml" {
		passArgs = append(passArgs, "--config="+*cfgPath)
	}
	if *yes {
		passArgs = append(passArgs, "--yes")
	}

	cmdUpdate(passArgs, *targetVersion)
}
