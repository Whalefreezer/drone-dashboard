package main

import (
	"embed"
	"flag"
	"fmt"
	"io/fs"
	"log"
	"net/http/httputil"
	"net/url"
	"os"
	"strings"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
)

//go:embed static/*
var staticFiles embed.FS

func main() {
	// Parse command line flags
	fpvtracksideAPI := flag.String("fpvtrackside-api", "http://localhost:8080", "FPVTrackside API endpoint")
	port := flag.Int("port", 3000, "Server port")
	help := flag.Bool("help", false, "Show help message")
	flag.Parse()

	if *help {
		fmt.Printf(`
Usage: %s [OPTIONS]

Options:
  -fpvtrackside-api string   Set the FPVTrackside API endpoint (default: http://localhost:8080)
  -port int                 Set the server port (default: 3000)
  -help                     Show this help message

Note: The FPVTrackside API will be available at /fpv-api/* endpoints
      PocketBase API will be available at /api/* endpoints
      PocketBase Admin UI will be available at /_/

Example:
  drone-dashboard -fpvtrackside-api="http://localhost:8000" -port=4000
`, os.Args[0])
		os.Exit(0)
	}

	// Create reverse proxy for API requests
	apiTarget, err := url.Parse(*fpvtracksideAPI)
	if err != nil {
		log.Fatal("Invalid FPVTrackside API URL:", err)
	}
	proxy := httputil.NewSingleHostReverseProxy(apiTarget)

	// Handle static files from embedded filesystem
	staticContent, err := fs.Sub(staticFiles, "static")
	if err != nil {
		log.Fatal("Failed to access static files:", err)
	}

	// Initialize PocketBase app
	app := pocketbase.New()

	// Hook into the serve event to add custom routes
	app.OnServe().BindFunc(func(se *core.ServeEvent) error {
		// Add a single route handler that routes based on path
		se.Router.Any("/{path...}", func(c *core.RequestEvent) error {
			req := c.Request
			resp := c.Response
			path := req.URL.Path

			// Handle FPV API proxy requests
			if strings.HasPrefix(path, "/fpv-api/") {
				// Strip /fpv-api prefix for the proxy
				originalPath := path
				req.URL.Path = strings.TrimPrefix(path, "/fpv-api")

				// Serve the proxy request
				proxy.ServeHTTP(resp, req)

				// Restore original path
				req.URL.Path = originalPath
				return nil
			}

			// For all other requests, serve static files
			staticHandler := apis.Static(staticContent, false)
			return staticHandler(c)
		})

		fmt.Printf("Pointing to FPVTrackside API: %s\n", *fpvtracksideAPI)
		fmt.Printf("API proxy available at: /fpv-api/* -> %s\n", *fpvtracksideAPI)
		fmt.Printf("PocketBase + Drone Dashboard running on http://localhost:%d\n", *port)
		fmt.Printf("PocketBase Admin UI available at: http://localhost:%d/_/\n", *port)

		return se.Next()
	})

	// Start PocketBase
	if err := app.Start(); err != nil {
		log.Fatal("PocketBase startup error:", err)
	}
}
