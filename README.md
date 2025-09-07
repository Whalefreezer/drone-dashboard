# Drone Dashboard

Real-time FPV drone racing dashboard with a Go backend and a Deno + React + Vite frontend. The backend embeds the production frontend and proxies data from FPVTrackside; it also provides a lightweight PocketBase datastore and admin UI for reliability and tooling.

## Highlights

- Live race views, leaderboards, pilot/channel info, and lap timing
- PocketBase-powered data store with admin UI at `/_/`
- Ingest + scheduler to reduce load on FPVTrackside and improve resilience
- All-in-one binary with embedded static frontend for easy deployment
- Dev-friendly Deno/Vite setup with fast HMR and comprehensive tests

## Prerequisites

- Deno v2.1.0+
- Go v1.21+
- VS Code with the Deno extension (recommended)

## Quick Start

Choose one of the two workflows below.

### 1) Dev Workflow (recommended)

Run backend and frontend separately with Vite proxying API calls to the backend.

1. Backend (from `backend/`):
   ```bash
   go run main.go -fpvtrackside=http://localhost:8080 -port=3000
   ```
   - Admin UI: `http://localhost:3000/_/`
   - Server logs will print a summary box on startup

2. Frontend (from `frontend/`):
   - Create `frontend/.env` with at least:
     ```
     VITE_API_URL=http://localhost:3000
     ```
   - Start Vite dev server:
     ```bash
     deno task dev
     ```
   - App: `http://localhost:5173`

Notes
- The Vite proxy forwards `/api/*` and `/direct/*` to `VITE_API_URL`.
- Default `vite.config.ts` falls back to `http://localhost:8090`; set `VITE_API_URL` explicitly to the backend port you chose (typically 3000).

### 2) Single Binary (embedded frontend)

Build the production frontend and bundle it into the backend executable.

1. Build frontend (from `frontend/`):
   ```bash
   deno task build
   ```
   This outputs to `backend/static/`.

2. Build backend (from `backend/`):
   ```bash
   # Cross-platform release builds
   ./build.sh

   # Or a local binary
   go build -o drone-dashboard
   ```

3. Run:
   ```bash
   ./drone-dashboard -fpvtrackside=http://localhost:8080 -port=3000
   ```
   - Dashboard: `http://localhost:3000`
   - Admin UI: `http://localhost:3000/_/`

## Architecture

- Frontend: Deno + React + Vite (source in `frontend/src/`, public assets in `frontend/public/`). Production build is emitted into `backend/static/` and embedded by the Go binary.
- Backend: Go HTTP server that embeds static assets and exposes:
  - `/_/` PocketBase admin UI
  - `/api/*` PocketBase REST API (used by the app and internal services)
  - `/direct/*` optional proxy to FPVTrackside (enable with `-direct-proxy`)
- Ingest + Scheduler: A manager service fetches and caches data from FPVTrackside on appropriate intervals for active races to minimize upstream load.
- Control Link (Cloud/Pits): Optional WebSocket control plane for multi-site setups; see backend docs.

## Configuration

### Frontend env (create `frontend/.env`)

- `VITE_API_URL`: URL of the backend (e.g., `http://localhost:3000`)
- `VITE_USE_PB`: Set `true` to prefer PocketBase collections where supported
- `VITE_USE_PB_RACE`: Set `true` to subscribe races via PocketBase
- `VITE_EVENT_ID`: Optional override to pin a specific event id

Vite dev proxy targets `/api` and `/direct` using `VITE_API_URL`. See `frontend/vite.config.ts`.

### Backend flags (run `./drone-dashboard -help`)

- `-fpvtrackside`: FPVTrackside base URL (default `http://localhost:8080`)
- `-port`: HTTP port to serve admin UI, API, and static (default `3000`)
- `-log-level`: `error|warn|info|debug|trace`
- `-ingest-enabled`: Enable background scheduler loops (default `true`)
- `-direct-proxy`: Expose `/direct/*` to FPVTrackside (disabled by default)
- `-cloud-url`: Cloud WebSocket URL (pits mode)
- `-auth-token`: Auth token enabling cloud or pits mode
- `-pits-id`: Identifier for this pits instance (default `default`)
- `-db-dir`: Directory for SQLite DB files; empty uses in-memory

Environment variables
- `SUPERUSER_EMAIL`: PocketBase admin email (default `admin@example.com`)
- `SUPERUSER_PASSWORD`: PocketBase admin password (auto-generated if empty)

Behavior modes
- Standalone: no `-auth-token` (default). Direct FPVTrackside ingest.
- Cloud: `-auth-token` provided, no `-cloud-url`. Hosts WS control at `/control`.
- Pits: `-auth-token` and `-cloud-url` provided. Connects outbound to cloud.

## Commands

Frontend (from `frontend/`)
- `deno task dev`: Start Vite dev server at `http://localhost:5173`
- `deno task build`: Build to `backend/static/`
- `deno task preview` or `deno task serve`: Preview/serve production build
- `deno test` or `deno task test[:watch]`: Run unit/integration tests
- `deno fmt` / `deno lint`: Format and lint

Backend (from `backend/`)
- `go run main.go -fpvtrackside=http://localhost:8080 -port=3000`
- `./build.sh`: Cross-platform binaries into `backend/build/`
- `go test ./...`: Run Go tests

### PB Snapshot (offline seed)
- Generate: in the running app, click the floating "Download PB Snapshot" dev tool to export current PocketBase-backed data to a JSON file. The name looks like `pb-snapshot-<eventId-or-none>-<timestamp>.json`.
- Import: start the backend with `-import-snapshot=/absolute/or/relative/path/to/pb-snapshot.json`. The importer runs before background schedulers and merges by id (creates missing, updates existing) while preserving relationships.
- Notes: the snapshot contains `version`, `snapshotTime`, `currentEventId`, and `collections` (events, pilots, channels, rounds, races, pilotChannels, laps, detections, gamePoints, client_kv, ingest_targets, server_settings). The importer sets `isCurrent` to true for `currentEventId` and clears it on others.

## Project Structure

```
.
├── frontend/            # Deno + React + Vite app
│   ├── src/             # Source code (components, features, state)
│   ├── public/          # Public assets and MSW mocks
│   └── dist/            # Production build (not committed)
├── backend/             # Go server + embedded static
│   ├── main.go          # Entry point
│   ├── static/          # Embedded frontend (output from Vite build)
│   ├── build.sh/.bat    # Cross-platform builds
│   └── docs/            # Architecture and deployment docs
├── docs/                # Project-level docs
├── scripts/             # Auxiliary scripts
└── .github/             # CI/CD config
```

## Testing

Frontend
- Deno test runner; JSDOM and Testing Library for component tests
- Tests co-located next to code as `*.test.ts(x)`
- Run `deno task test` or `deno task test:watch`

Backend
- Table-driven Go tests; run `go test ./...`

Target high coverage (~80%) where practical.

## Deployment

- Build the frontend (`deno task build`), then produce binaries via `backend/build.sh`.
- See backend docs for examples and ops guidance:
  - `backend/README.md`
  - `backend/docs/deployment-examples.md`
  - `backend/docs/cloud-config.md`
  - `backend/docs/pits-config.md`

## Contributing

- Follow the guidelines in `CONTRIBUTING.md` and `CODING_STANDARDS.md`.
- Use Conventional Commits (e.g., `feat(leaderboard): add position change tags`).
- Place tests next to code and keep changes focused and minimal.

## Troubleshooting

- Frontend cannot reach API: ensure `VITE_API_URL` points to your backend (port 3000 by default) and that the backend is running.
- Admin UI credentials: set `SUPERUSER_EMAIL`/`SUPERUSER_PASSWORD` or check logs for the generated password on first run.
- Direct FPVTrackside fetch: start backend with `-direct-proxy` and use `/direct/*` routes for diagnostics.
4. Tag maintainers for urgent matters
