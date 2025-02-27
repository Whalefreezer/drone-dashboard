# Drone Dashboard Backend (Go)

A lightweight Go server that acts as a proxy for the FPVTrackside API and serves static frontend files. This implementation provides a single binary output with minimal dependencies, using only Go's standard library.

## Prerequisites

- Go 1.21 or later (https://golang.org/dl/)

## Building

Before building, ensure your frontend files are in the `static` directory. These files will be embedded into the binary during compilation.

To build the server into a single executable:

```bash
go build -o drone-dashboard.exe
```

This will create a `drone-dashboard.exe` file in the current directory that includes both the server and the frontend files.

### Multi-Platform Build Scripts

For convenience, build scripts are provided to compile for all major platforms at once in parallel:

- On Windows: Run `build.bat`
- On Linux/macOS: Run `./build.sh` (make it executable first with `chmod +x build.sh`)

These scripts will create a `build` directory containing 64-bit binaries for:
- Windows (AMD64)
- Linux (AMD64 and ARM64)
- macOS (Intel and Apple Silicon)

All builds run in parallel for faster compilation. The build script will wait for all builds to complete before finishing.

### Static Files

The frontend files should be placed in the `static` directory before building. The build process will embed these files directly into the binary using Go's `embed` package, resulting in a single, self-contained executable.

Directory structure:
```
gobackend/
├── main.go
├── build.bat
├── build.sh
└── static/
    ├── index.html
    ├── css/
    ├── js/
    └── ...
```

## Running

The server is completely self-contained and doesn't need external files to run. Just make sure you have:
1. Access to a FPVTrackside API endpoint

### Command Line Options

```bash
Usage: drone-dashboard [OPTIONS]

Options:
  -fpvtrackside-api string   Set the FPVTrackside API endpoint (default: http://localhost:8080)
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
./drone-dashboard -fpvtrackside-api="http://localhost:8000" -port=4000
```

## Features

- **API Proxy**: Forwards requests from `/api/*` to the configured FPVTrackside API endpoint
- **Static File Server**: Serves embedded frontend files (no external files needed)
- **Zero External Dependencies**: Uses only Go standard library
- **Small Binary Size**: Produces a single, efficient executable
- **Cross-Platform**: Can be compiled for any platform that Go supports
- **Self-Contained**: All frontend files are embedded in the binary 