package main

import (
	"context"
	"crypto/rand"
	"embed"
	"flag"
	"fmt"
	"io"
	"io/fs"
	"log"
	"log/slog"
	"math/big"
	"net/http"
	"os"
	"path/filepath"

	"drone-dashboard/control"
	"drone-dashboard/ingest"
	"drone-dashboard/logger"
	_ "drone-dashboard/migrations"
	"drone-dashboard/scheduler"

	"strconv"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/plugins/migratecmd"
)

//go:embed static/*
var staticFiles embed.FS

func main() {
	// Parse flags (separate from PocketBase CLI)
	flags := parseFlags()

	// Static files
	staticContent := mustStaticFS()

	// Configure logging
	logger.Configure(flags.LogLevel)

	// Initialize PocketBase and migrations
	app := newPocketBaseApp(flags)

	// Ensure PocketBase sees only its own args and port mapping
	pbArgs := preparePocketBaseArgs(flags)
	slog.Info("PocketBase args", "args", pbArgs)
	app.RootCmd.SetArgs(pbArgs)

	// Create services
	// Select ingest source based on mode
	var ingestService *ingest.Service
	hub := control.NewHub()

	switch flags.Mode {
	case "cloud":
		// Cloud mode: register control server and set RemoteSource
		control.RegisterServer(app, hub, flags.AuthToken)
		ingestService = ingest.NewServiceWithSource(app, ingest.NewRemoteSource(hub, flags.PitsID))
	case "pits":
		// Pits mode: use direct source and start outbound control client
		ingestService = mustNewIngestService(app, flags.FPVTrackside)
		if flags.CloudURL != "" {
			pc, err := control.NewPitsClient(flags.CloudURL, flags.AuthToken, flags.PitsID, flags.FPVTrackside)
			if err != nil {
				log.Fatal("control client init:", err)
			}
			go pc.Start(context.Background())
		}
	default: // standalone
		ingestService = mustNewIngestService(app, flags.FPVTrackside)
	}

	// Scheduler manager
	manager := scheduler.NewManager(app, ingestService, scheduler.Config{})

	ingest.RegisterRoutes(app, ingestService)

	// Register record hooks for active race priority updates
	manager.RegisterHooks()

	// Register server lifecycle and routes
	registerServe(app, staticContent, ingestService, manager, flags)

	// Note: Race ingest targets are managed by the scheduler manager
	// which automatically sets correct intervals for active races

	// Start PocketBase
	if err := app.Start(); err != nil {
		log.Fatal("PocketBase startup error:", err)
	}
}

// ----- Structure & helpers -----

type CLIFlags struct {
	FPVTrackside  string
	Port          int
	LogLevel      string
	IngestEnabled bool
	DirectProxy   bool
	Mode          string // standalone|pits|cloud
	CloudURL      string
	AuthToken     string
	PitsID        string
	DBDir         string
}

func parseFlags() CLIFlags {
	var out CLIFlags
	fs := flag.NewFlagSet(os.Args[0], flag.ContinueOnError)
	// Silence default error printing; we'll handle help explicitly
	fs.SetOutput(io.Discard)

	// Primary flags
	fs.StringVar(&out.FPVTrackside, "fpvtrackside", "http://localhost:8080", "FPVTrackside API endpoint")
	fs.IntVar(&out.Port, "port", 3000, "Server port")
	fs.StringVar(&out.LogLevel, "log-level", "info", "Log level: error|warn|info|debug|trace")
	fs.BoolVar(&out.IngestEnabled, "ingest-enabled", true, "Enable background scheduler loops")
	fs.BoolVar(&out.DirectProxy, "direct-proxy", false, "Enable /direct/* proxy to FPVTrackside")
	fs.StringVar(&out.Mode, "mode", "standalone", "Mode: standalone|pits|cloud")
	fs.StringVar(&out.CloudURL, "cloud-url", "", "Cloud WS URL (pits mode)")
	fs.StringVar(&out.AuthToken, "auth-token", "", "Auth token for control link")
	fs.StringVar(&out.PitsID, "pits-id", "default", "Identifier for this pits instance")
	fs.StringVar(&out.DBDir, "db-dir", "", "Directory for SQLite database files (empty = in-memory)")

	showHelp := fs.Bool("help", false, "Show help message")
	_ = fs.Parse(os.Args[1:])
	if *showHelp {
		fmt.Printf(helpText(), os.Args[0])
		os.Exit(0)
	}
	return out
}

// preparePocketBaseArgs ensures PB receives proper command/flags and our port maps to --http
func preparePocketBaseArgs(flags CLIFlags) []string {
	// Always serve with our port mapping
	args := []string{"serve", "--http", fmt.Sprintf("127.0.0.1:%d", flags.Port)}

	// Optionally add database directory if specified
	if flags.DBDir != "" {
		args = append(args, "--dir", flags.DBDir)
	}

	return args
}

func helpText() string {
	return `
Usage: %s [OPTIONS]

Options:
  -fpvtrackside string    Set the FPVTrackside API endpoint (default: http://localhost:8080)
  -port int               Set the server port (default: 3000)
  -log-level string       Log level: error|warn|info|debug|trace
  -ingest-enabled bool    Enable background scheduler loops (default: true)
  -direct-proxy           Enable /direct/* proxy to FPVTrackside (default: false)
  -mode string            Mode: standalone|pits|cloud (default: standalone)
  -cloud-url string       Cloud WS URL (pits mode)
  -auth-token string      Auth token for control link
  -pits-id string         Identifier for this pits instance
  -db-dir string          Directory for SQLite database files (empty = in-memory)
  -help                   Show this help message

Note: The FPVTrackside API will be available at /direct/* endpoints
      PocketBase API will be available at /api/* endpoints
      PocketBase Admin UI will be available at /_/

Example:
  drone-dashboard -fpvtrackside="http://localhost:8000" -port=4000
`
}

func mustStaticFS() fs.FS {
	staticContent, err := fs.Sub(staticFiles, "static")
	if err != nil {
		log.Fatal("Failed to access static files:", err)
	}
	return staticContent
}

func newPocketBaseApp(flags CLIFlags) *pocketbase.PocketBase {
	// Optional: use in-memory DB with modernc.org/sqlite when db-dir is empty
	var app *pocketbase.PocketBase
	if flags.DBDir == "" {
		slog.Info("db.config", "mode", "memory")
		app = pocketbase.NewWithConfig(pocketbase.Config{
			DBConnect: func(dbPath string) (*dbx.DB, error) {
				// Use distinct shared in-memory databases for data and aux
				base := filepath.Base(dbPath)
				dsn := "file:" + base + "?mode=memory&cache=shared"
				db, err := dbx.Open("sqlite", dsn)
				if err != nil {
					return nil, err
				}
				// Enable foreign keys and a reasonable busy timeout.
				if _, err := db.NewQuery("PRAGMA foreign_keys=ON;").Execute(); err != nil {
					return nil, err
				}
				if _, err := db.NewQuery("PRAGMA busy_timeout=1000;").Execute(); err != nil {
					return nil, err
				}
				return db, nil
			},
		})
	} else {
		app = pocketbase.New()
	}
	migratecmd.MustRegister(app, app.RootCmd, migratecmd.Config{Automigrate: true})
	return app
}

func mustNewIngestService(app core.App, baseURL string) *ingest.Service {
	svc, err := ingest.NewService(app, baseURL)
	if err != nil {
		log.Fatal("Failed to create proxy service:", err)
	}
	return svc
}

func registerServe(app *pocketbase.PocketBase, static fs.FS, ingestService *ingest.Service, manager *scheduler.Manager, flags CLIFlags) {
	app.OnServe().BindFunc(func(se *core.ServeEvent) error {
		// Ensure superuser exists
		if err := ensureSuperuser(app); err != nil {
			return fmt.Errorf("failed to ensure superuser: %w", err)
		}

		// Reflect CLI flag into server_settings
		setSchedulerEnabledFromFlag(app, flags.IngestEnabled)

		// Set up initial race ingest target after everything is ready
		setupInitialRaceIngestTarget(app)

		// Start loops
		ctx := context.Background()
		manager.StartLoops(ctx)

		// Routing (register specific first)
		// Optional direct proxy (only in direct source modes)
		se.Router.Any("/direct/{path...}", func(c *core.RequestEvent) error {
			if !flags.DirectProxy {
				return c.NotFoundError("not found", nil)
			}
			// Only available when using direct source
			ds, ok := ingestService.Source.(ingest.DirectSource)
			if !ok {
				return c.NotFoundError("not found", nil)
			}
			req := c.Request
			resp := c.Response
			srcPath := req.PathValue("path")
			bytes, err := ds.C.GetBytes(srcPath)
			if err != nil {
				slog.Warn("http.direct.fetch.error", "path", srcPath, "err", err)
				return c.InternalServerError("fetch event", err)
			}
			resp.WriteHeader(http.StatusOK)
			resp.Write([]byte(string(bytes)))
			return nil
		})

		// Catch-all static last
		se.Router.Any("/{path...}", func(c *core.RequestEvent) error {
			staticHandler := apis.Static(static, false)
			return staticHandler(c)
		})

		if flags.Mode == "cloud" {
			fmt.Printf("Cloud mode: waiting for pits connection; WS control on /control\n")
		} else {
			fmt.Printf("Pointing to FPVTrackside API: %s\n", flags.FPVTrackside)
			if flags.DirectProxy {
				fmt.Printf("Direct proxy enabled: /direct/* -> %s\n", flags.FPVTrackside)
			} else {
				fmt.Printf("Direct proxy disabled (enable with -direct-proxy)\n")
			}
		}
		fmt.Printf("PocketBase + Drone Dashboard running on http://localhost:%d\n", flags.Port)
		fmt.Printf("PocketBase Admin UI available at: http://localhost:%d/_/\n", flags.Port)
		return se.Next()
	})
}

func setSchedulerEnabledFromFlag(app core.App, enabled bool) {
	col, err := app.FindCollectionByNameOrId("server_settings")
	if err != nil {
		slog.Warn("server_settings.collection.find.error", "err", err)
		return
	}
	rec, _ := app.FindFirstRecordByFilter("server_settings", "key = 'scheduler.enabled'", nil)
	if rec == nil {
		rec = core.NewRecord(col)
		rec.Set("key", "scheduler.enabled")
	}
	rec.Set("value", strconv.FormatBool(enabled))
	if err := app.Save(rec); err != nil {
		slog.Warn("server_settings.save.error", "key", "scheduler.enabled", "err", err)
	}
}

// ensureSuperuser creates a superuser if one doesn't exist with the configured email/password
func ensureSuperuser(app core.App) error {
	// Env-configurable email/password with sensible defaults
	email := os.Getenv("SUPERUSER_EMAIL")
	if email == "" {
		email = "admin@example.com"
	}
	password := os.Getenv("SUPERUSER_PASSWORD")
	generated := false
	if password == "" {
		// Generate a strong random password if not provided
		if p, err := generatePassword(24); err == nil {
			password = p
			generated = true
		} else {
			return fmt.Errorf("failed to generate password: %w", err)
		}
	}

	// Get the superusers collection
	superusers, err := app.FindCollectionByNameOrId(core.CollectionNameSuperusers)
	if err != nil {
		return fmt.Errorf("failed to find superusers collection: %w", err)
	}

	// Check if superuser already exists
	existingRecord, _ := app.FindAuthRecordByEmail(core.CollectionNameSuperusers, email)
	if existingRecord != nil {
		slog.Info("superuser.ensure.skipped",
			"reason", "superuser already exists",
			"email", email)
		return nil
	}

	// Create new superuser record
	record := core.NewRecord(superusers)
	record.Set("email", email)
	record.Set("password", password)

	if err := app.Save(record); err != nil {
		return fmt.Errorf("failed to save superuser: %w", err)
	}

	// Always log creation; print password only if it was generated
	if generated {
		slog.Info("superuser.ensure.created",
			"email", email,
			"password", password,
			"note", "password generated because SUPERUSER_PASSWORD was not set")
	} else {
		slog.Info("superuser.ensure.created",
			"email", email)
	}
	return nil
}

// generatePassword returns a random password of the requested length
// using a URL-safe alphanumeric+symbols charset.
func generatePassword(length int) (string, error) {
	const charset = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*()-_=+"
	max := big.NewInt(int64(len(charset)))
	out := make([]byte, length)
	for i := 0; i < length; i++ {
		n, err := rand.Int(rand.Reader, max)
		if err != nil {
			return "", err
		}
		out[i] = charset[n.Int64()]
	}
	return string(out), nil
}

// setupInitialRaceIngestTarget sets up the initial race ingest target on startup
func setupInitialRaceIngestTarget(app core.App) {
	// The scheduler manager automatically handles race ingest targets
	// and sets correct intervals for active races via ensureActiveRacePriority()
	log.Printf("Race ingest targets will be managed by scheduler")
}
