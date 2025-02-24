# Drone Dashboard Backend (Go)

A lightweight Go server that acts as a proxy for the Velocidrone API and serves static frontend files. This implementation provides a single binary output with minimal dependencies, using only Go's standard library.

## Prerequisites

- Go 1.21 or later (https://golang.org/dl/)

## Building

To build the server into a single executable:

```bash
go build -o drone-dashboard.exe
```

This will create a `drone-dashboard.exe` file in the current directory.

### Multi-Platform Build Scripts

For convenience, build scripts are provided to compile for all major platforms at once in parallel:

- On Windows: Run `build.bat`
- On Linux/macOS: Run `./build.sh` (make it executable first with `chmod +x build.sh`)

These scripts will create a `build` directory containing 64-bit binaries for:
- Windows (AMD64)
- Linux (AMD64 and ARM64)
- macOS (Intel and Apple Silicon)

All builds run in parallel for faster compilation. The build script will wait for all platforms to complete before finishing.

## Running

Before running the server, ensure you have:
1. Built the frontend and copied the files to a `static` directory next to the executable
2. Have access to a Velocidrone API endpoint

### Command Line Options

```bash
Usage: drone-dashboard [OPTIONS]

Options:
  -velocidrone-api string   Set the Velocidrone API endpoint (default: http://localhost:8080)
  -port int                 Set the server port (default: 3000)
  -help                     Show this help message
```

### Examples

Run with default settings:
```bash
./drone-dashboard
```

Run with custom API endpoint and port:
```bash
./drone-dashboard -velocidrone-api="http://localhost:8000" -port=4000
```

## Features

- **API Proxy**: Forwards requests from `/api/*` to the configured Velocidrone API endpoint
- **Static File Server**: Serves the frontend files from the `static` directory
- **Zero External Dependencies**: Uses only Go standard library
- **Small Binary Size**: Produces a single, efficient executable
- **Cross-Platform**: Can be compiled for any platform that Go supports 