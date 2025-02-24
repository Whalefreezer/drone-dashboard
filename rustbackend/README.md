# Drone Dashboard Backend (Rust)

A lightweight Rust server that acts as a proxy for the Velocidrone API and serves static frontend files. This implementation provides a single binary output with minimal dependencies, using modern Rust async runtime and web frameworks.

## Prerequisites

- Rust 1.75 or later (https://rustup.rs)
- For cross-compilation, install the following targets:
  ```bash
  rustup target add x86_64-pc-windows-msvc
  rustup target add x86_64-unknown-linux-gnu
  rustup target add aarch64-unknown-linux-gnu
  rustup target add x86_64-apple-darwin
  rustup target add aarch64-apple-darwin
  ```

## Building

Before building, ensure your frontend files are in the `static` directory. These files will be embedded into the binary during compilation.

To build the server into a single executable:

```bash
cargo build --release
```

This will create a release build in `target/release/` that includes both the server and the frontend files.

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

The frontend files should be placed in the `static` directory before building. The build process will embed these files directly into the binary using the `include_dir` crate, resulting in a single, self-contained executable.

Directory structure:
```
rustbackend/
├── src/
│   └── main.rs
├── Cargo.toml
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
1. Access to a Velocidrone API endpoint

### Command Line Options

```bash
Usage: drone-dashboard [OPTIONS]

Options:
  --velocidrone-api <URL>  Set the Velocidrone API endpoint [default: http://localhost:8080]
  --port <PORT>           Set the server port [default: 3000]
  -h, --help             Show this help message
  -V, --version          Show version information
```

### Examples

Run with default settings:
```bash
./drone-dashboard
```

Run with custom API endpoint and port:
```bash
./drone-dashboard --velocidrone-api="http://localhost:8000" --port=4000
```

## Features

- **API Proxy**: Forwards requests from `/api/*` to the configured Velocidrone API endpoint
- **Static File Server**: Serves embedded frontend files (no external files needed)
- **Async Runtime**: Uses Tokio for high-performance async I/O
- **Modern Web Framework**: Built with Axum for efficient routing and handling
- **Small Binary Size**: Produces a single, efficient executable
- **Cross-Platform**: Can be compiled for any platform that Rust supports
- **Self-Contained**: All frontend files are embedded in the binary
- **Type Safety**: Leverages Rust's strong type system and memory safety guarantees 