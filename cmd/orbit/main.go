package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/orbit-sh/orbit/internal/api"
	"github.com/orbit-sh/orbit/internal/config"
	"github.com/orbit-sh/orbit/internal/db"
)

var version = "dev"

func main() {
	var (
		cfgPath    = flag.String("config", "/etc/orbit/orbit.toml", "path to config file")
		showVersion = flag.Bool("version", false, "print version and exit")
	)
	flag.Parse()

	if *showVersion {
		fmt.Printf("orbit %s\n", version)
		os.Exit(0)
	}

	// Handle subcommands (e.g. `orbit server add`, `orbit mcp enable`)
	if flag.NArg() > 0 {
		runSubcommand(flag.Args())
		return
	}

	cfg, err := config.Load(*cfgPath)
	if err != nil {
		log.Fatalf("config: %v", err)
	}

	database, err := db.Open(cfg.DataDir)
	if err != nil {
		log.Fatalf("db: %v", err)
	}
	defer database.Close()

	srv, err := api.NewServer(cfg, database)
	if err != nil {
		log.Fatalf("server init: %v", err)
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM, syscall.SIGHUP)
	defer stop()

	log.Printf("orbit %s listening on %s", version, cfg.ListenAddr)
	if err := srv.Run(ctx); err != nil {
		log.Fatalf("server: %v", err)
	}
}

// runSubcommand handles CLI sub-commands like `orbit mcp enable --scope read-only`.
func runSubcommand(args []string) {
	// TODO: implement subcommand dispatch
	fmt.Fprintf(os.Stderr, "unknown subcommand: %s\n", args[0])
	os.Exit(1)
}
