package main

import (
	"embed"
	"flag"
	"fmt"
	"io/fs"
	"log"

	// "net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"strings"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/plugins/migratecmd"

	_ "drone-dashboard/migrations"
)

//go:embed static/*
var staticFiles embed.FS

func main() {
	// Parse command line flags
	velocidroneAPI := flag.String("velocidrone-api", "http://localhost:8080", "Velocidrone API endpoint")
	port := flag.Int("port", 3000, "Server port")
	help := flag.Bool("help", false, "Show help message")
	flag.Parse()

	if *help {
		fmt.Printf(`
Usage: %s [OPTIONS]

Options:
  -velocidrone-api string   Set the Velocidrone API endpoint (default: http://localhost:8080)
  -port int                 Set the server port (default: 3000)
  -help                     Show this help message

Example:
  drone-dashboard -velocidrone-api="http://localhost:8000" -port=4000
`, os.Args[0])
		os.Exit(0)
	}

	// Initialize PocketBase
	app := pocketbase.New()

	migratecmd.MustRegister(app, app.RootCmd, migratecmd.Config{
		Automigrate: true,
	})

	// Create reverse proxy for API requests
	apiTarget, err := url.Parse(*velocidroneAPI)
	if err != nil {
		log.Fatal("Invalid Velocidrone API URL:", err)
	}
	proxy := httputil.NewSingleHostReverseProxy(apiTarget)

	// Add custom routes to PocketBase
	app.OnServe().BindFunc(func(se *core.ServeEvent) error {
		// Set the HTTP port based on command line flag
		se.Server.Addr = fmt.Sprintf("localhost:%d", *port)

		// Handle API requests
		se.Router.GET("/api/*", func(c *core.RequestEvent) error {
			// Strip /api prefix and proxy the request
			req := c.Request
			req.URL.Path = strings.TrimPrefix(req.URL.Path, "/api")
			proxy.ServeHTTP(c.Response, req)
			return nil
		})

		// Serve static files from embedded filesystem
		staticContent, err := fs.Sub(staticFiles, "static")
		if err != nil {
			return fmt.Errorf("failed to access static files: %w", err)
		}

		se.Router.GET("/*", apis.Static(staticContent, false))

		return se.Next()
	})

	// Start PocketBase
	fmt.Printf("Pointing to Velocidrone API: %s\n", *velocidroneAPI)
	fmt.Printf("Starting server on http://localhost:%d\n", *port)

	if err := app.Start(); err != nil {
		log.Fatal("Server error:", err)
	}
}
