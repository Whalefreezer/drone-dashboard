#!/usr/bin/env bash
set -euo pipefail

# Configuration
PI_USER="pi"
PI_HOST="192.168.1.11"
PI_DEPLOY_DIR="/home/pi/drone-dashboard"
SERVICE_NAME="drone-dashboard"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

log() {
	echo -e "${GREEN}[deploy]${NC} $1"
}

warn() {
	echo -e "${YELLOW}[deploy]${NC} $1"
}

error() {
	echo -e "${RED}[deploy]${NC} $1"
}

# Step 1: Verify SSH connectivity
verify_ssh() {
	log "Verifying SSH connectivity to ${PI_USER}@${PI_HOST}..."
	if ! ssh -o ConnectTimeout=5 "${PI_USER}@${PI_HOST}" "echo 'SSH connection successful'" > /dev/null 2>&1; then
		error "Failed to connect to Raspberry Pi at ${PI_HOST}"
		error "Please ensure:"
		error "  1. The Pi is powered on and connected to the network"
		error "  2. SSH is enabled on the Pi"
		error "  3. You have SSH key authentication set up or can enter password"
		exit 1
	fi
	log "SSH connectivity verified"
}

# Step 2: Run preflight checks and build
build_project() {
	log "Running preflight checks and building project..."

	# Get the project root directory
	SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
	PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

	# Run preflight checks
	log "Running preflight checks..."
	if ! ( cd "$PROJECT_ROOT" && deno task -c e2e/deno.json preflight ); then
		error "Preflight checks failed. Please fix errors before deploying."
		exit 1
	fi

	# Build frontend
	log "Building frontend..."
	if ! ( cd "$PROJECT_ROOT/frontend" && deno task build ); then
		error "Frontend build failed."
		exit 1
	fi

	# Build backend for ARM64
	log "Building backend for ARM64..."
	BINARY_PATH="${PROJECT_ROOT}/backend/build/drone-dashboard_linux_arm"
	mkdir -p "${PROJECT_ROOT}/backend/build"
	rm -f "${BINARY_PATH}"

	if ! ( cd "$PROJECT_ROOT/backend" && GOOS=linux GOARCH=arm64 go build -ldflags="-s -w" -trimpath -o "${BINARY_PATH}" ); then
		error "Backend build failed."
		exit 1
	fi

	# Compress with UPX if available
	if command -v upx >/dev/null 2>&1; then
		log "Compressing binary with upx..."
		if ! upx --force -9 "${BINARY_PATH}" 2>/dev/null; then
			warn "UPX compression failed, continuing with uncompressed binary"
		else
			log "Binary compressed successfully"
		fi
	else
		log "UPX not found; skipping compression"
	fi

	# Verify binary exists
	if [[ ! -f "${BINARY_PATH}" ]]; then
		error "Binary not found at ${BINARY_PATH}"
		exit 1
	fi

	log "Binary built successfully ($(du -h "${BINARY_PATH}" | cut -f1))"
}

# Step 3: Create directory structure on Pi
setup_directories() {
	log "Setting up directory structure on Pi..."

	ssh "${PI_USER}@${PI_HOST}" bash <<'EOF'
		set -euo pipefail

		# Create directory structure
		mkdir -p ~/drone-dashboard/{bin,data}

		# Set proper permissions
		chmod 755 ~/drone-dashboard
		chmod 755 ~/drone-dashboard/bin
		chmod 700 ~/drone-dashboard/data

		echo "Directory structure created"
EOF

	log "Directory structure ready"
}

# Step 4: Upload environment file (first-time only)
upload_env() {
	log "Checking environment configuration..."

	# Check if .env already exists on Pi
	if ssh "${PI_USER}@${PI_HOST}" "test -f ${PI_DEPLOY_DIR}/.env"; then
		warn "Environment file already exists on Pi, skipping upload"
		warn "To update credentials, edit ${PI_DEPLOY_DIR}/.env on the Pi"
	else
		log "Creating .env file on Pi..."

		# Get the project root directory
		SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
		PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
		LOCAL_ENV="${PROJECT_ROOT}/backend/.env"

		if [[ ! -f "${LOCAL_ENV}" ]]; then
			error "Local .env file not found at ${LOCAL_ENV}"
			error "Please create it with required credentials"
			exit 1
		fi

		# Upload .env file
		scp "${LOCAL_ENV}" "${PI_USER}@${PI_HOST}:${PI_DEPLOY_DIR}/.env"

		# Set proper permissions
		ssh "${PI_USER}@${PI_HOST}" "chmod 600 ${PI_DEPLOY_DIR}/.env"

		log "Environment file uploaded"
	fi
}

# Step 5: Upload binary
upload_binary() {
	log "Uploading binary to Pi..."

	SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
	PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
	BINARY_PATH="${PROJECT_ROOT}/backend/build/drone-dashboard_linux_arm"

	# Upload binary
	scp "${BINARY_PATH}" "${PI_USER}@${PI_HOST}:${PI_DEPLOY_DIR}/bin/drone-dashboard"

	# Make binary executable
	ssh "${PI_USER}@${PI_HOST}" "chmod +x ${PI_DEPLOY_DIR}/bin/drone-dashboard"

	log "Binary uploaded and permissions set"
}

# Step 6: Install/update systemd service
install_service() {
	log "Installing systemd service..."

	# Create service file content
	SERVICE_CONTENT="[Unit]
Description=Drone Dashboard - FPV Race Tracking System
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=pi
Group=pi
WorkingDirectory=${PI_DEPLOY_DIR}

EnvironmentFile=${PI_DEPLOY_DIR}/.env

ExecStart=${PI_DEPLOY_DIR}/bin/drone-dashboard \\
    --port=8095 \\
    --db-dir=${PI_DEPLOY_DIR}/data \\
    --log-level=info

Restart=always
RestartSec=10
StartLimitIntervalSec=300
StartLimitBurst=5

NoNewPrivileges=true
PrivateTmp=true

StandardOutput=journal
StandardError=journal
SyslogIdentifier=drone-dashboard

[Install]
WantedBy=multi-user.target"

	# Upload and install service file
	ssh "${PI_USER}@${PI_HOST}" bash <<EOF
		set -euo pipefail

		# Create temporary service file
		echo '${SERVICE_CONTENT}' > /tmp/drone-dashboard.service

		# Move to systemd directory (requires sudo)
		sudo mv /tmp/drone-dashboard.service /etc/systemd/system/${SERVICE_NAME}.service
		sudo chown root:root /etc/systemd/system/${SERVICE_NAME}.service
		sudo chmod 644 /etc/systemd/system/${SERVICE_NAME}.service

		# Reload systemd
		sudo systemctl daemon-reload

		echo "Service file installed"
EOF

	log "Systemd service installed"
}

# Step 7: Enable and restart service
restart_service() {
	log "Restarting service..."

	ssh "${PI_USER}@${PI_HOST}" bash <<EOF
		set -euo pipefail

		# Enable service to start on boot
		sudo systemctl enable ${SERVICE_NAME}

		# Restart service
		sudo systemctl restart ${SERVICE_NAME}

		# Wait a moment for startup
		sleep 2

		# Check status
		if sudo systemctl is-active --quiet ${SERVICE_NAME}; then
			echo "Service is running"
		else
			echo "Warning: Service may have failed to start"
			sudo systemctl status ${SERVICE_NAME} --no-pager || true
			exit 1
		fi
EOF

	log "Service restarted successfully"
}

# Step 8: Display service status and access info
show_status() {
	log "Deployment complete!"
	echo ""
	echo "Service status:"
	ssh "${PI_USER}@${PI_HOST}" "sudo systemctl status ${SERVICE_NAME} --no-pager" || true
	echo ""
	echo "Access the dashboard at: http://${PI_HOST}:8095"
	echo "Admin panel at: http://${PI_HOST}:8095/_/"
	echo ""
	echo "Useful commands:"
	echo "  View logs:    ssh ${PI_USER}@${PI_HOST} 'sudo journalctl -u ${SERVICE_NAME} -f'"
	echo "  Restart:      ssh ${PI_USER}@${PI_HOST} 'sudo systemctl restart ${SERVICE_NAME}'"
	echo "  Stop:         ssh ${PI_USER}@${PI_HOST} 'sudo systemctl stop ${SERVICE_NAME}'"
	echo "  Check status: ssh ${PI_USER}@${PI_HOST} 'sudo systemctl status ${SERVICE_NAME}'"
}

# Main deployment flow
main() {
	log "Starting deployment to Raspberry Pi at ${PI_HOST}..."
	echo ""

	verify_ssh
	build_project
	setup_directories
	upload_env
	upload_binary
	install_service
	restart_service
	show_status
}

main "$@"
