package main

import (
    "context"
    "embed"
    "flag"
    "fmt"
    "io"
    "io/fs"
    "log"
    "log/slog"
    "net/http"
    "os"
    "strings"

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
    flags, pbArgs := parseFlags()

	// Static files
	staticContent := mustStaticFS()

	// Configure logging
	logger.Configure(flags.LogLevel)

    // Initialize PocketBase and migrations
    app := newPocketBaseApp()

    // Ensure PocketBase sees only its own args and port mapping
    pbArgs = preparePocketBaseArgs(pbArgs, flags)
    app.RootCmd.SetArgs(pbArgs)

	// Create services
	ingestService := mustNewIngestService(app, flags.FPVTrackside)

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
}

// getServerSetting retrieves a server setting value by key with optional default
func getServerSetting(app core.App, key string, defaultValue string) string {
	rec, err := app.FindFirstRecordByFilter("server_settings", "key = {:key}", dbx.Params{"key": key})
	if err != nil || rec == nil {
		return defaultValue
	}
	value := rec.GetString("value")
	if value == "" {
		return defaultValue
	}
	return value
}

// getServerSettingInt retrieves a server setting as an integer with optional default
func getServerSettingInt(app core.App, key string, defaultValue int) int {
	value := getServerSetting(app, key, "")
	if value == "" {
		return defaultValue
	}
	if n, err := strconv.Atoi(value); err == nil {
		return n
	}
	return defaultValue
}

func parseFlags() (CLIFlags, []string) {
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

    showHelp := fs.Bool("help", false, "Show help message")
    _ = fs.Parse(os.Args[1:])
    if *showHelp {
        fmt.Printf(helpText(), os.Args[0])
        os.Exit(0)
    }
    // Remaining args are for PocketBase (eg. serve/migrate/superuser ...)
    return out, fs.Args()
}

// preparePocketBaseArgs ensures PB receives proper command/flags and our port maps to --http
func preparePocketBaseArgs(pbArgs []string, flags CLIFlags) []string {
    // If no PB command provided, default to `serve` and inject --http with our port
    if len(pbArgs) == 0 {
        return []string{"serve", "--http", fmt.Sprintf("127.0.0.1:%d", flags.Port)}
    }

    // Only inject --http for the `serve` command and when not already specified
    hasServe := false
    for _, a := range pbArgs {
        if a == "serve" {
            hasServe = true
            break
        }
    }
    if !hasServe {
        return pbArgs
    }

    hasHTTP := false
    for _, a := range pbArgs {
        if a == "--http" || strings.HasPrefix(a, "--http=") {
            hasHTTP = true
            break
        }
    }
    if hasHTTP {
        return pbArgs
    }

    // Insert --http right after `serve`
    out := make([]string, 0, len(pbArgs)+2)
    inserted := false
    for _, a := range pbArgs {
        out = append(out, a)
        if !inserted && a == "serve" {
            out = append(out, "--http", fmt.Sprintf("127.0.0.1:%d", flags.Port))
            inserted = true
        }
    }
    if !inserted {
        out = append(out, "--http", fmt.Sprintf("127.0.0.1:%d", flags.Port))
    }
    return out
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

func newPocketBaseApp() *pocketbase.PocketBase {
	app := pocketbase.New()
	// Register migrations and enable automigrate when running via `go run`
	isGoRun := strings.HasPrefix(os.Args[0], os.TempDir())
	migratecmd.MustRegister(app, app.RootCmd, migratecmd.Config{Automigrate: isGoRun})
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
		// Reflect CLI flag into server_settings
		setSchedulerEnabledFromFlag(app, flags.IngestEnabled)

		// Set up initial race ingest target after everything is ready
		setupInitialRaceIngestTarget(app)

		// Start loops
		ctx := context.Background()
		manager.StartLoops(ctx)

		// Routing
		se.Router.Any("/{path...}", func(c *core.RequestEvent) error {
			req := c.Request
			resp := c.Response
			path := req.URL.Path

            if flags.DirectProxy && strings.HasPrefix(path, "/direct/") {
                newPath := strings.TrimPrefix(path, "/direct/")
                bytes, err := ingestService.Client.GetBytes(newPath)
                if err != nil {
                    slog.Warn("http.direct.fetch.error", "path", newPath, "err", err)
                    return c.InternalServerError("fetch event", err)
                }
                resp.WriteHeader(http.StatusOK)
                resp.Write([]byte(string(bytes)))
                return nil
            }
			staticHandler := apis.Static(static, false)
			return staticHandler(c)
		})

        fmt.Printf("Pointing to FPVTrackside API: %s\n", flags.FPVTrackside)
        if flags.DirectProxy {
            fmt.Printf("Direct proxy enabled: /direct/* -> %s\n", flags.FPVTrackside)
        } else {
            fmt.Printf("Direct proxy disabled (enable with -direct-proxy)\n")
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

// setupInitialRaceIngestTarget sets up the initial race ingest target on startup
func setupInitialRaceIngestTarget(app core.App) {
	// The scheduler manager automatically handles race ingest targets
	// and sets correct intervals for active races via ensureActiveRacePriority()
	log.Printf("Race ingest targets will be managed by scheduler")
}
