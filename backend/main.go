package main

import (
    "embed"
    "context"
    "flag"
    "fmt"
    "io/fs"
    "log"
    "net/http"
    "os"
    "strings"
    "time"

    "drone-dashboard/ingest"
    "drone-dashboard/logger"
    "drone-dashboard/scheduler"
    _ "drone-dashboard/migrations"

    "github.com/pocketbase/pocketbase"
    "github.com/pocketbase/pocketbase/apis"
    "github.com/pocketbase/pocketbase/core"
    "github.com/pocketbase/pocketbase/plugins/migratecmd"
    "github.com/pocketbase/dbx"
    "strconv"
)

//go:embed static/*
var staticFiles embed.FS

func main() {
    // Parse flags
    flags := parseFlags()

    // Static files
    staticContent := mustStaticFS()

    // Configure logging
    logger.Configure(flags.LogLevel)

    // Initialize PocketBase and migrations
    app := newPocketBaseApp()

    // Create services
    ingestService := mustNewIngestService(app, flags.FPVTrackside)
    ingest.RegisterRoutes(app, ingestService)

    // Scheduler manager
    manager := scheduler.NewManager(app, ingestService, scheduler.Config{})

    // Register server lifecycle and routes
    registerServe(app, staticContent, ingestService, manager, flags)

    // Register record hooks
    registerRaceUpdateHook(app)

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
}

func parseFlags() CLIFlags {
    fpv := flag.String("fpvtrackside", "http://localhost:8080", "FPVTrackside API endpoint")
    port := flag.Int("port", 3000, "Server port (display only)")
    logLevel := flag.String("log-level", "info", "Log level: error|warn|info|debug|trace")
    ingestEnabled := flag.Bool("ingest-enabled", true, "Enable background scheduler loops")
    help := flag.Bool("help", false, "Show help message")
    flag.Parse()
    if *help {
        fmt.Printf(helpText(), os.Args[0])
        os.Exit(0)
    }
    return CLIFlags{FPVTrackside: *fpv, Port: *port, LogLevel: *logLevel, IngestEnabled: *ingestEnabled}
}

func helpText() string {
    return `
Usage: %s [OPTIONS]

Options:
  -fpvtrackside string    Set the FPVTrackside API endpoint (default: http://localhost:8080)
  -port int               Set the server port (default: 3000)
  -log-level string       Log level: error|warn|info|debug|trace
  -ingest-enabled bool    Enable background scheduler loops (default: true)
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
        // Start loops
        ctx := context.Background()
        manager.StartLoops(ctx)
        // Routing
        se.Router.Any("/{path...}", func(c *core.RequestEvent) error {
            req := c.Request
            resp := c.Response
            path := req.URL.Path

            if strings.HasPrefix(path, "/direct/") {
                newPath := strings.TrimPrefix(path, "/direct/")
                bytes, err := ingestService.Client.GetBytes(newPath)
                if err != nil {
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
        fmt.Printf("API proxy available at: /direct/* -> %s\n", flags.FPVTrackside)
        fmt.Printf("PocketBase + Drone Dashboard running on http://localhost:%d\n", flags.Port)
        fmt.Printf("PocketBase Admin UI available at: http://localhost:%d/_/\n", flags.Port)
        return se.Next()
    })
}

func setSchedulerEnabledFromFlag(app core.App, enabled bool) {
    col, err := app.FindCollectionByNameOrId("server_settings")
    if err != nil {
        return
    }
    rec, _ := app.FindFirstRecordByFilter("server_settings", "key = 'scheduler.enabled'", nil)
    if rec == nil {
        rec = core.NewRecord(col)
        rec.Set("key", "scheduler.enabled")
    }
    if enabled {
        rec.Set("value", "true")
    } else {
        rec.Set("value", "false")
    }
    _ = app.Save(rec)
}

func registerRaceUpdateHook(app core.App) {
    app.OnRecordAfterUpdateSuccess("races").BindFunc(func(e *core.RecordEvent) error {
        rec := e.Record
        start := rec.GetString("start")
        end := rec.GetString("end")
        valid := rec.GetBool("valid")
        if valid && start != "" && !strings.HasPrefix(start, "0") && (end == "" || strings.HasPrefix(end, "0")) {
            r, _ := app.FindFirstRecordByFilter("ingest_targets", "type = 'race' && sourceId = {:sid}", dbx.Params{"sid": rec.Id})
            if r == nil {
                col, err := app.FindCollectionByNameOrId("ingest_targets")
                if err == nil {
                    r = core.NewRecord(col)
                    r.Set("type", "race")
                    r.Set("sourceId", rec.Id)
                    r.Set("event", rec.GetString("event"))
                }
            }
            if r != nil {
                activeMs := 200
                if srec, err := app.FindFirstRecordByFilter("server_settings", "key = 'scheduler.raceActiveMs'", nil); err == nil && srec != nil {
                    if v := srec.GetString("value"); v != "" {
                        if n, convErr := strconv.Atoi(v); convErr == nil {
                            activeMs = n
                        }
                    }
                }
                r.Set("intervalMs", activeMs)
                r.Set("priority", 100)
                r.Set("enabled", true)
                r.Set("nextDueAt", time.Now().UnixMilli())
                _ = app.Save(r)
            }
        }
        return nil
    })
}
