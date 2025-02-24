#!/bin/bash
echo "Building Drone Dashboard for all platforms..."

# Create build directory if it doesn't exist
mkdir -p build

# Function to compress binary if UPX is available
compress_if_available() {
    local binary=$1
    local platform=$2
    if [ "$platform" != "macos" ] && command -v upx >/dev/null 2>&1; then
        echo "Compressing $binary..."
        upx --best "$binary" >/dev/null 2>&1
        echo "Compressed $binary"
    fi
}

# Start all builds in parallel
echo "Starting parallel builds..."

# Windows build
(GOOS=windows GOARCH=amd64 go build -ldflags="-s -w" -trimpath -o build/drone-dashboard-windows-amd64.exe && 
 echo "Windows build complete." && 
 compress_if_available "build/drone-dashboard-windows-amd64.exe" "windows") &

# Linux builds
(GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -trimpath -o build/drone-dashboard-linux-amd64 && 
 echo "Linux amd64 build complete." && 
 compress_if_available "build/drone-dashboard-linux-amd64" "linux") &

(GOOS=linux GOARCH=arm64 go build -ldflags="-s -w" -trimpath -o build/drone-dashboard-linux-arm64 && 
 echo "Linux arm64 build complete." && 
 compress_if_available "build/drone-dashboard-linux-arm64" "linux") &

# macOS builds (no compression)
(GOOS=darwin GOARCH=amd64 go build -ldflags="-s -w" -trimpath -o build/drone-dashboard-macos-amd64 && 
 echo "macOS amd64 build complete.") &

(GOOS=darwin GOARCH=arm64 go build -ldflags="-s -w" -trimpath -o build/drone-dashboard-macos-arm64 && 
 echo "macOS arm64 build complete.") &

# Wait for all background jobs to complete
wait

echo "All builds complete! Binaries are in the build directory."

# Show UPX info message if not available
if ! command -v upx >/dev/null 2>&1; then
    echo "Note: Install UPX (https://upx.github.io/) for additional binary compression (Windows/Linux only)"
fi 