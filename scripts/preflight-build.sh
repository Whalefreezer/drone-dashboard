#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")"/.. && pwd)"

log() {
	echo "[preflight-build] $1"
}

run_preflight() {
	log "Running project preflight checks"
	( cd "$ROOT_DIR" && deno task -c e2e/deno.json preflight )
}

build_frontend() {
	log "Building frontend"
	( cd "$ROOT_DIR/frontend" && deno task build )
}

compress_if_available() {
	local binary="$1"
	if command -v upx >/dev/null 2>&1; then
		log "Compressing binary with upx"
		if ! upx --force -9 "$binary"; then
			log "Warning: upx compression failed"
		fi
	else
		log "UPX not found; skipping compression"
	fi
}

build_backend_linux() {
	local output="$ROOT_DIR/backend/build/drone-dashboard_linux_x86"
	log "Building backend linux/amd64 binary"
	mkdir -p "$ROOT_DIR/backend/build"
	rm -f "$output"
	( cd "$ROOT_DIR/backend" && GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -trimpath -o "$output" )
	compress_if_available "$output"
}

main() {
	run_preflight
	build_frontend
	build_backend_linux
	log "Done. Artifacts available in frontend/dist and backend/build"
	log "Backend binary: $ROOT_DIR/backend/build/drone-dashboard_linux_x86"
}

main "$@"
