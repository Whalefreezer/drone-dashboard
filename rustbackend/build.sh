#!/bin/bash
echo "Building Drone Dashboard for all platforms..."

# Create build directory if it doesn't exist
mkdir -p build

# Start all builds in parallel
echo "Starting parallel builds..."

# Windows build
cargo build --release --target x86_64-pc-windows-msvc && \
    cp target/x86_64-pc-windows-msvc/release/drone-dashboard.exe build/drone-dashboard-windows-amd64.exe && \
    echo "Windows build complete." &

# Linux builds
cargo build --release --target x86_64-unknown-linux-gnu && \
    cp target/x86_64-unknown-linux-gnu/release/drone-dashboard build/drone-dashboard-linux-amd64 && \
    echo "Linux amd64 build complete." &
cargo build --release --target aarch64-unknown-linux-gnu && \
    cp target/aarch64-unknown-linux-gnu/release/drone-dashboard build/drone-dashboard-linux-arm64 && \
    echo "Linux arm64 build complete." &

# macOS builds
cargo build --release --target x86_64-apple-darwin && \
    cp target/x86_64-apple-darwin/release/drone-dashboard build/drone-dashboard-macos-amd64 && \
    echo "macOS amd64 build complete." &
cargo build --release --target aarch64-apple-darwin && \
    cp target/aarch64-apple-darwin/release/drone-dashboard build/drone-dashboard-macos-arm64 && \
    echo "macOS arm64 build complete." &

# Wait for all background jobs to complete
wait

echo "All builds complete! Check the build directory for binaries." 