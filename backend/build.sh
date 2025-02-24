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
(GOOS=windows GOARCH=amd64 go build -ldflags="-s -w" -trimpath -o build/drone-dashboard.exe && 
 echo "Windows build complete." && 
 compress_if_available "build/drone-dashboard.exe" "windows") &

# Linux builds
(GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -trimpath -o build/drone-dashboard_linux_x86 && 
 echo "Linux amd64 build complete." && 
 compress_if_available "build/drone-dashboard_linux_x86" "linux") &

(GOOS=linux GOARCH=arm64 go build -ldflags="-s -w" -trimpath -o build/drone-dashboard_linux_arm && 
 echo "Linux arm64 build complete." && 
 compress_if_available "build/drone-dashboard_linux_arm" "linux") &

# macOS builds (no compression)
(GOOS=darwin GOARCH=amd64 go build -ldflags="-s -w" -trimpath -o build/drone-dashboard_mac_x86 && 
 echo "macOS amd64 build complete.") &

(GOOS=darwin GOARCH=arm64 go build -ldflags="-s -w" -trimpath -o build/drone-dashboard_mac_arm && 
 echo "macOS arm64 build complete.") &

# Wait for all background jobs to complete
wait

echo "All builds complete! Binaries are in the build directory."

# Show UPX info message if not available
if ! command -v upx >/dev/null 2>&1; then
    echo "Note: Install UPX (https://upx.github.io/) for additional binary compression (Windows/Linux only)"
fi 