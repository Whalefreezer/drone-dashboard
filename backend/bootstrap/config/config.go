package config

import (
	"embed"
	"flag"
	"fmt"
	"io"
	"io/fs"
	"log"
	"os"
	"path/filepath"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/plugins/migratecmd"
)

type Flags struct {
	FPVTrackside    string
	Port            int
	LogLevel        string
	IngestEnabled   bool
	DirectProxy     bool
	CloudURL        string
	AuthToken       string
	PitsID          string
	DBDir           string
	ImportSnapshot  string
	UITitle         string
	UITitleProvided bool
}

func ParseFlags() Flags {
	var out Flags
	fs := flag.NewFlagSet(os.Args[0], flag.ContinueOnError)
	fs.SetOutput(io.Discard)

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
	uiTitle := fs.String("ui-title", "", "UI title shown in the browser tab (default: Drone Dashboard)")

	showHelp := fs.Bool("help", false, "Show help message")
	_ = fs.Parse(os.Args[1:])
	if *showHelp {
		fmt.Printf(helpText(), os.Args[0])
		os.Exit(0)
	}

	if out.AuthToken == "" {
		out.AuthToken = os.Getenv("AUTH_TOKEN")
	}
	fs.Visit(func(f *flag.Flag) {
		if f.Name == "ui-title" {
			out.UITitleProvided = true
		}
	})
	trimmedTitle := strings.TrimSpace(*uiTitle)
	if trimmedTitle == "" {
		trimmedTitle = "Drone Dashboard"
	}
	out.UITitle = trimmedTitle

	return out
}

func PreparePocketBaseArgs(flags Flags) []string {
	return []string{"serve", "--http", fmt.Sprintf("0.0.0.0:%d", flags.Port)}
}

func MustStaticFS(staticFiles embed.FS) fs.FS {
	staticContent, err := fs.Sub(staticFiles, "static")
	if err != nil {
		log.Fatal("Failed to access static files:", err)
	}
	return staticContent
}

func NewPocketBaseApp(flags Flags) *pocketbase.PocketBase {
	var app *pocketbase.PocketBase
	if flags.DBDir == "" {
		app = pocketbase.NewWithConfig(pocketbase.Config{
			HideStartBanner: true,
			DefaultDataDir:  ".",
			DBConnect: func(dbPath string) (*dbx.DB, error) {
				base := filepath.Base(dbPath)
				dsn := "file:" + base + "?mode=memory&cache=shared"
				db, err := dbx.Open("sqlite", dsn)
				if err != nil {
					return nil, err
				}
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

func helpText() string {
	return `
Usage: %s [OPTIONS]

Options:
  --fpvtrackside string    Set the FPVTrackside API endpoint (default: http://localhost:8080)
  --port int               Set the server port (default: 3000)
  --log-level string       Log level: error|warn|info|debug|trace
  --ingest-enabled bool    Enable background scheduler loops (default: true)
  --direct-proxy           Enable /direct/* proxy to FPVTrackside (default: false)
  --ui-title string        UI title shown in the browser tab (default: Drone Dashboard)

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
