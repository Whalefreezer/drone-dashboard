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
	"strings"
	"time"

	"drone-dashboard/control"
	"drone-dashboard/importer"
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
	slog.Debug("PocketBase args", "args", pbArgs)
	app.RootCmd.SetArgs(pbArgs)

	// Create services
	// Select ingest source based on configuration
	var ingestService *ingest.Service
	hub := control.NewHub()
	hub.SetFetchStatsStore(control.NewPocketBaseFetchStatsStore(app))
	hub.SetCurrentRaceProvider(control.NewClientKVCurrentRaceProvider(app, time.Second))

	if flags.AuthToken != "" {
		if flags.CloudURL != "" {
			// Pits mode: auth-token and cloud-url set
			ingestService = mustNewIngestService(app, flags.FPVTrackside)
			pc, err := control.NewPitsClient(flags.CloudURL, flags.AuthToken, flags.PitsID, flags.FPVTrackside)
			if err != nil {
				log.Fatal("control client init:", err)
			}
			go pc.Start(context.Background())
		} else {
			// Cloud mode: auth-token set but no cloud-url
			control.RegisterServer(app, hub, flags.AuthToken)
			ingestService = ingest.NewServiceWithSource(app, ingest.NewRemoteSource(hub, flags.PitsID))
		}
	} else {
		// Standalone mode: no auth-token
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
	FPVTrackside   string
	Port           int
	LogLevel       string
	IngestEnabled  bool
	DirectProxy    bool
	CloudURL       string
	AuthToken      string
	PitsID         string
	DBDir          string
	ImportSnapshot string
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

	fs.StringVar(&out.CloudURL, "cloud-url", "", "Cloud WS URL (pits mode)")
	fs.StringVar(&out.AuthToken, "auth-token", "", "Auth token for control link")
	fs.StringVar(&out.PitsID, "pits-id", "default", "Identifier for this pits instance")
	fs.StringVar(&out.DBDir, "db-dir", "", "Directory for SQLite database files (empty = in-memory)")
	fs.StringVar(&out.ImportSnapshot, "import-snapshot", "", "Path to PB snapshot JSON to import at startup")

	showHelp := fs.Bool("help", false, "Show help message")
	_ = fs.Parse(os.Args[1:])
	if *showHelp {
		fmt.Printf(helpText(), os.Args[0])
		os.Exit(0)
	}

	// Check for AUTH_TOKEN environment variable if not set via flag
	if out.AuthToken == "" {
		out.AuthToken = os.Getenv("AUTH_TOKEN")
	}

	return out
}

// preparePocketBaseArgs ensures PB receives proper command/flags and our port maps to --http
func preparePocketBaseArgs(flags CLIFlags) []string {
	// Always serve with our port mapping
	args := []string{"serve", "--http", fmt.Sprintf("0.0.0.0:%d", flags.Port)}

	return args
}

func helpText() string {
	return `
Usage: %s [OPTIONS]

Options:
  --fpvtrackside string    Set the FPVTrackside API endpoint (default: http://localhost:8080)
  --port int               Set the server port (default: 3000)
  --log-level string       Log level: error|warn|info|debug|trace
  --ingest-enabled bool    Enable background scheduler loops (default: true)
  --direct-proxy           Enable /direct/* proxy to FPVTrackside (default: false)

  --cloud-url string       Cloud WebSocket URL (required for pits mode)
  --auth-token string      Authentication token (enables cloud or pits mode)
  --pits-id string         Identifier for this pits instance
  --db-dir string          Directory for SQLite database files (empty = in-memory)
  --help                   Show this help message

Environment Variables:
  AUTH_TOKEN               Authentication token (alternative to --auth-token flag)

Behavior Modes:
  Standalone (default): No auth-token provided
    - Uses direct FPVTrackside connection
    - No cloud connectivity

  Cloud: auth-token provided, no cloud-url
    - Acts as cloud server waiting for pits connections
    - Provides WebSocket control interface at /control

  Pits: auth-token AND cloud-url provided
    - Connects to cloud server as a pits instance
    - Forwards race data to cloud via WebSocket

Note: The server binds to all network interfaces (0.0.0.0)
      The FPVTrackside API will be available at /direct/* endpoints
      PocketBase API will be available at /api/* endpoints
      PocketBase Admin UI will be available at /_/

Examples:
  # Standalone mode (default)
  drone-dashboard

  # Standalone with custom FPVTrackside endpoint
  drone-dashboard -fpvtrackside="http://localhost:8000" -port=4000

  # Cloud mode - acts as server for pits
  drone-dashboard -auth-token="your-token-here"

  # Pits mode - connects to cloud server
  drone-dashboard -auth-token="your-token-here" -cloud-url="ws://cloud.example.com/ws"

  # Using environment variable for auth token
  AUTH_TOKEN="your-token-here" drone-dashboard
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
		app = pocketbase.NewWithConfig(pocketbase.Config{
			HideStartBanner: true,
			DefaultDataDir:  ".",
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
		app = pocketbase.NewWithConfig(pocketbase.Config{
			HideStartBanner: true,
			DefaultDataDir:  flags.DBDir,
		})
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

		// Optional import of PB snapshot before any background loops
		if flags.ImportSnapshot != "" {
			if err := importer.ImportFromFile(app, flags.ImportSnapshot); err != nil {
				return fmt.Errorf("import snapshot: %w", err)
			}
		}

		// Reflect CLI flag into server_settings
		setSchedulerEnabledFromFlag(app, flags.IngestEnabled)

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

		// Health check endpoint
		se.Router.GET("/health", func(c *core.RequestEvent) error {
			return c.JSON(http.StatusOK, map[string]interface{}{
				"status":    "ok",
				"timestamp": fmt.Sprintf("%d", time.Now().Unix()),
			})
		})

		// Catch-all static last with SPA index fallback
		se.Router.Any("/{path...}", func(c *core.RequestEvent) error {
			staticHandler := apis.Static(static, true)
			return staticHandler(c)
		})

		if flags.AuthToken != "" && flags.CloudURL == "" {
			slog.Info("Cloud mode: waiting for pits connection; WS control on /control")
		} else {
			slog.Debug("Pointing to FPVTrackside API", "url", flags.FPVTrackside)
			if flags.DirectProxy {
				slog.Info("Direct proxy enabled", "route", "/direct/*", "target", flags.FPVTrackside)
			} else {
				slog.Debug("Direct proxy disabled (enable with -direct-proxy)")
			}
		}
		printDashboardBox(flags)
		return se.Next()
	})
}

// printDashboardBox prints a nicely formatted dashboard information box
func printDashboardBox(flags CLIFlags) {
	const contentWidth = 57 // Width of the content area

	// Helper function to format a line with proper padding
	formatLine := func(icon, label, value string) string {
		const labelWidth = 15 // Fixed width for labels
		paddedLabel := fmt.Sprintf("%-*s", labelWidth, label)
		content := fmt.Sprintf("  %s %s: %s", icon, paddedLabel, value)
		padding := ""
		if len(content) < contentWidth {
			padding = strings.Repeat(" ", contentWidth-len(content)+2)
		}
		return fmt.Sprintf("║%s%s║", content, padding)
	}

	fmt.Printf("\n")
	fmt.Printf("╔%s╗\n", strings.Repeat("═", contentWidth))
	fmt.Printf("║%s║\n", centerText("🚀 DRONE DASHBOARD", contentWidth))
	fmt.Printf("╠%s╣\n", strings.Repeat("═", contentWidth))

	fmt.Println(formatLine("🌐", "Main Dashboard", fmt.Sprintf("http://0.0.0.0:%d", flags.Port)))
	fmt.Println(formatLine("🔧", "DB Admin Panel", fmt.Sprintf("http://0.0.0.0:%d/_/", flags.Port)))

	if flags.AuthToken != "" && flags.CloudURL == "" {
		fmt.Println(formatLine("🔧", "Control Link", fmt.Sprintf("ws://0.0.0.0:%d/control", flags.Port)))
	} else {
		fmt.Println(formatLine("📡", "FPVTrackside", flags.FPVTrackside))
	}

	fmt.Printf("╚%s╝\n", strings.Repeat("═", contentWidth))
	fmt.Printf("\n")
}

// centerText centers text within a given width
func centerText(text string, width int) string {
	if len(text) >= width {
		return text
	}
	padding := (width - len(text)) / 2
	leftPad := strings.Repeat(" ", padding)
	rightPad := strings.Repeat(" ", width-len(text)-padding+2)
	return leftPad + text + rightPad
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
	const charset = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789_"
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
