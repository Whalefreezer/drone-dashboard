#!/bin/bash
echo "Building Drone Dashboard for all platforms..."

# Create build directory if it doesn't exist
mkdir -p build

# Start all builds in parallel
echo "Starting parallel builds..."

# Windows build
GOOS=windows GOARCH=amd64 go build -ldflags="-s -w" -trimpath -o build/drone-dashboard-windows-amd64.exe && echo "Windows build complete." &

# Linux builds
GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -trimpath -o build/drone-dashboard-linux-amd64 && echo "Linux amd64 build complete." &
GOOS=linux GOARCH=arm64 go build -ldflags="-s -w" -trimpath -o build/drone-dashboard-linux-arm64 && echo "Linux arm64 build complete." &

# macOS builds
GOOS=darwin GOARCH=amd64 go build -ldflags="-s -w" -trimpath -o build/drone-dashboard-macos-amd64 && echo "macOS amd64 build complete." &
GOOS=darwin GOARCH=arm64 go build -ldflags="-s -w" -trimpath -o build/drone-dashboard-macos-arm64 && echo "macOS arm64 build complete." &

# Wait for all background jobs to complete
wait

echo "All builds complete! Check the build directory for binaries." 