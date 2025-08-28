package main

import (
	"context"
	"embed"
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
	rec.Set("value", strconv.FormatBool(enabled))
	_ = app.Save(rec)
}

// setupRaceIngestTarget creates or updates an ingest target for the current race
func setupRaceIngestTarget(app core.App, eventId string, context string) {
	// Get current race using the same logic as currentRaceAtom
	currentRace := findCurrentRace(app, eventId)
	if currentRace == nil {
		log.Printf("No current race found for %s", context)
		return
	}

	// Create or update ingest target for the current race
	r, _ := app.FindFirstRecordByFilter("ingest_targets", "type = 'race' && sourceId = {:sid}", dbx.Params{"sid": currentRace.Id})
	if r == nil {
		col, err := app.FindCollectionByNameOrId("ingest_targets")
		if err == nil {
			r = core.NewRecord(col)
			r.Set("type", "race")
			r.Set("sourceId", currentRace.Id)
			r.Set("event", currentRace.GetString("event"))
		}
	}
	if r != nil {
		activeMs := getServerSettingInt(app, "scheduler.raceActiveMs", 200)
		r.Set("intervalMs", activeMs)
		r.Set("priority", 100)
		r.Set("enabled", true)
		r.Set("nextDueAt", time.Now().UnixMilli())
		_ = app.Save(r)
		log.Printf("Race ingest target set up for race: %s (%s)", currentRace.Id, context)
	}
}

// setupInitialRaceIngestTarget sets up the initial race ingest target on startup
func setupInitialRaceIngestTarget(app core.App) {
	// Find the current event
	currentEvent, err := app.FindFirstRecordByFilter("events", "isCurrent = 1", nil)
	if err != nil || currentEvent == nil {
		log.Printf("No current event found for initial race ingest target setup")
		return
	}

	eventId := currentEvent.Id
	log.Printf("Setting up initial race ingest target for event: %s", eventId)
	setupRaceIngestTarget(app, eventId, "startup")
}

func registerRaceUpdateHook(app core.App) {
	app.OnRecordAfterUpdateSuccess("races").BindFunc(func(e *core.RecordEvent) error {
		rec := e.Record
		eventId := rec.GetString("event")
		if eventId == "" {
			return nil
		}

		setupRaceIngestTarget(app, eventId, "race update")
		return nil
	})
}

// findCurrentRace determines the current race using the same logic as currentRaceAtom
// This uses a single SQL query with proper joins and ordering
func findCurrentRace(app core.App, eventId string) *core.Record {
	// Query to find current race with proper ordering by round order and race number
	// This follows the exact same logic as currentRaceAtom:
	// 1. Find active race (valid, started, not ended)
	// 2. If none, find last completed race and return next one
	// 3. Fallback to first race

	query := `
		WITH ordered_races AS (
			SELECT 
				r.id,
				r.raceNumber,
				r.start,
				r.end,
				r.valid,
				r.event,
				round."order" as round_order,
				-- Determine if race is active (started but not ended)
				CASE 
					WHEN r.valid = 1 
						AND r.start IS NOT NULL 
						AND r.start != '' 
						AND r.start NOT LIKE '0%'
						AND (r.end IS NULL OR r.end = '' OR r.end LIKE '0%')
					THEN 1 
					ELSE 0 
				END as is_active,
				-- Determine if race is completed (started and ended)
				CASE 
					WHEN r.valid = 1 
						AND r.start IS NOT NULL 
						AND r.start != '' 
						AND r.start NOT LIKE '0%'
						AND r.end IS NOT NULL 
						AND r.end != '' 
						AND r.end NOT LIKE '0%'
					THEN 1 
					ELSE 0 
				END as is_completed,
				ROW_NUMBER() OVER (
					ORDER BY round."order" ASC, r.raceNumber ASC
				) as race_order
			FROM races r
			LEFT JOIN rounds round ON r.round = round.id
			WHERE r.event = {:eventId}
		),
		active_race AS (
			SELECT id FROM ordered_races 
			WHERE is_active = 1 
			ORDER BY race_order ASC 
			LIMIT 1
		),
		last_completed_race AS (
			SELECT race_order FROM ordered_races 
			WHERE is_completed = 1 
			ORDER BY race_order DESC 
			LIMIT 1
		),
		next_after_completed AS (
			SELECT r.id 
			FROM ordered_races r
			CROSS JOIN last_completed_race lcr
			WHERE r.race_order = lcr.race_order + 1
		),
		first_race AS (
			SELECT id FROM ordered_races 
			ORDER BY race_order ASC 
			LIMIT 1
		)
		SELECT 
			COALESCE(
				(SELECT id FROM active_race),
				(SELECT id FROM next_after_completed),
				(SELECT id FROM first_race)
			) as current_race_id
	`

	var result struct {
		CurrentRaceId string `db:"current_race_id"`
	}

	err := app.DB().NewQuery(query).Bind(dbx.Params{"eventId": eventId}).One(&result)
	if err != nil {
		log.Printf("  Error querying races for event %s: %v", eventId, err)
		return nil
	}
	if result.CurrentRaceId == "" {
		log.Printf("  No current race found for event %s", eventId)
		return nil
	}

	// Fetch the actual race record
	race, err := app.FindRecordById("races", result.CurrentRaceId)
	if err != nil {
		log.Printf("  Error fetching race record: %v", err)
		return nil
	}

	return race
}
