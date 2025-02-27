package main

import (
	"embed"
	"flag"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"strings"
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

	// Create the main router/multiplexer
	mux := http.NewServeMux()

	// Handle API requests
	mux.HandleFunc("/api/", func(w http.ResponseWriter, r *http.Request) {
		// Strip /api prefix
		r.URL.Path = strings.TrimPrefix(r.URL.Path, "/api")
		proxy.ServeHTTP(w, r)
	})

	// Handle static files from embedded filesystem
	staticContent, err := fs.Sub(staticFiles, "static")
	if err != nil {
		log.Fatal("Failed to access static files:", err)
	}
	fileServer := http.FileServer(http.FS(staticContent))
	mux.Handle("/", fileServer)

	// Start the server
	addr := fmt.Sprintf("0.0.0.0:%d", *port)
	fmt.Printf("Pointing to FPVTrackside API: %s\n", *fpvtracksideAPI)
	fmt.Printf("Server running on http://localhost:%d\n", *port)

	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatal("Server error:", err)
	}
}
