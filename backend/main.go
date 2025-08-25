package main

import (
	"embed"
	"flag"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"os"
	"strings"

	"drone-dashboard/ingest"
	"drone-dashboard/logger"
	_ "drone-dashboard/migrations"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/plugins/migratecmd"
)

//go:embed static/*
var staticFiles embed.FS

func main() {
	// Parse command line flags
	fpvtracksideAPI := flag.String("fpvtrackside", "http://localhost:8080", "FPVTrackside API endpoint")
	port := flag.Int("port", 3000, "Server port")
	logLevel := flag.String("log-level", "info", "Log level: error|warn|info|debug|trace")
	help := flag.Bool("help", false, "Show help message")
	flag.Parse()

	if *help {
		fmt.Printf(`
Usage: %s [OPTIONS]

Options:
  -fpvtrackside string   Set the FPVTrackside API endpoint (default: http://localhost:8080)
  -port int                 Set the server port (default: 3000)
  -help                     Show this help message

Note: The FPVTrackside API will be available at /direct/* endpoints
      PocketBase API will be available at /api/* endpoints
      PocketBase Admin UI will be available at /_/

Example:
  drone-dashboard -fpvtrackside-api="http://localhost:8000" -port=4000
`, os.Args[0])
		os.Exit(0)
	}

	// Handle static files from embedded filesystem
	staticContent, err := fs.Sub(staticFiles, "static")
	if err != nil {
		log.Fatal("Failed to access static files:", err)
	}

	// Configure logging level
	logger.Configure(*logLevel)

	// Initialize PocketBase app
	app := pocketbase.New()

	// Register migrations and enable automigrate when running via `go run`
	isGoRun := strings.HasPrefix(os.Args[0], os.TempDir())
	migratecmd.MustRegister(app, app.RootCmd, migratecmd.Config{
		Automigrate: isGoRun,
	})

	// Create service once for reuse across all proxy requests
	ingestService, err := ingest.NewService(app, *fpvtracksideAPI)
	if err != nil {
		log.Fatal("Failed to create proxy service:", err)
	}

	ingest.RegisterRoutes(app, ingestService)

	// Hook into the serve event to add custom routes
	app.OnServe().BindFunc(func(se *core.ServeEvent) error {
		// Add a single route handler that routes based on path
		se.Router.Any("/{path...}", func(c *core.RequestEvent) error {
			req := c.Request
			resp := c.Response
			path := req.URL.Path

			// Handle FPV API proxy requests
			if strings.HasPrefix(path, "/direct/") {
				// Strip /direct prefix for the proxy
				newPath := strings.TrimPrefix(path, "/direct/")
				bytes, err := ingestService.Client.GetBytes(newPath)
				if err != nil {
					return c.InternalServerError("fetch event", err)
				}
				str := string(bytes)

				resp.WriteHeader(http.StatusOK)
				resp.Write([]byte(str))
				return nil
			}

			// For all other requests, serve static files
			staticHandler := apis.Static(staticContent, false)
			return staticHandler(c)
		})

		fmt.Printf("Pointing to FPVTrackside API: %s\n", *fpvtracksideAPI)
		fmt.Printf("API proxy available at: /direct/* -> %s\n", *fpvtracksideAPI)
		fmt.Printf("PocketBase + Drone Dashboard running on http://localhost:%d\n", *port)
		fmt.Printf("PocketBase Admin UI available at: http://localhost:%d/_/\n", *port)

		return se.Next()
	})

	// Start PocketBase
	if err := app.Start(); err != nil {
		log.Fatal("PocketBase startup error:", err)
	}
}
