package main

import (
	"flag"
	"fmt"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"strings"
)

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

	// Create reverse proxy for API requests
	apiTarget, err := url.Parse(*velocidroneAPI)
	if err != nil {
		log.Fatal("Invalid Velocidrone API URL:", err)
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

	// Handle static files
	fileServer := http.FileServer(http.Dir("static"))
	mux.Handle("/", fileServer)

	// Start the server
	addr := fmt.Sprintf("0.0.0.0:%d", *port)
	fmt.Printf("Pointing to Velocidrone API: %s\n", *velocidroneAPI)
	fmt.Printf("Server running on http://localhost:%d\n", *port)
	
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatal("Server error:", err)
	}
} 