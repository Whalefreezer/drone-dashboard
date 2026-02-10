# Drone Dashboard

Real-time FPV drone racing dashboard with a Go backend and a Deno + React + Vite frontend.

## Highlights

- Live race views, leaderboards, pilot/channel info, and lap timing
- PocketBase-backed datastore with admin UI at `/_/`
- Ingest + scheduler services to reduce FPVTrackside load and improve resilience
- Single-binary deploy option with embedded frontend assets
- Deno/Vite dev workflow with tests and lint/format checks

## Prerequisites

- Deno `2.1.0+`
- Go `1.21+`
- Docker (optional, only needed for Playwright server/e2e runtime)

## Quick Start

### Dev Workflow (recommended)

Run backend and frontend separately.

1. Start backend (from `backend/`):

```bash
go run main.go -fpvtrackside=http://localhost:8080 -port=3000
```

2. Create `frontend/.env`:

```bash
VITE_API_URL=http://localhost:3000
```

3. Start frontend (from `frontend/`):

```bash
deno task dev
```

4. Open:
- App: `http://localhost:5173`
- Admin UI: `http://localhost:3000/_/`

Notes:
- Vite proxies `/api/*` and `/direct/*` to `VITE_API_URL`.
- If `VITE_API_URL` is not set, `vite.config.ts` falls back to `http://localhost:8090/`.

### Single Binary Workflow

Build frontend assets, then build/run backend as one executable.

1. Build frontend (from `frontend/`):

```bash
deno task build
```

This writes production assets to `backend/static/`.

2. Build backend (from `backend/`):

```bash
./build.sh
# or
go build -o drone-dashboard
```

3. Run:

```bash
./drone-dashboard -fpvtrackside=http://localhost:8080 -port=3000
```

## Configuration

### Frontend environment (`frontend/.env`)

- `VITE_API_URL`: backend base URL (for Vite proxy target)
- `VITE_USE_PB`: prefer PocketBase collections where supported
- `VITE_USE_PB_RACE`: subscribe to race data via PocketBase
- `VITE_EVENT_ID`: optional event id override
- `VITE_DEV_MODE`: enables extra build reporting in Vite config

### Backend flags

Run `go run main.go --help` (or `./drone-dashboard --help`) for full usage.

- `--fpvtrackside`: FPVTrackside API endpoint (default `http://localhost:8080`)
- `--port`: server port (default `3000`)
- `--log-level`: `error|warn|info|debug|trace`
- `--ingest-enabled`: enable background scheduler loops (default `true`)
- `--direct-proxy`: enable `/direct/*` proxy to FPVTrackside
- `--cloud-url`: Cloud WebSocket URL (pits mode)
- `--auth-token`: auth token for cloud/pits control link
- `--pits-id`: pits instance identifier
- `--db-dir`: SQLite data directory (empty means in-memory)
- `--import-snapshot`: path to a PocketBase snapshot JSON to import on startup
- `--ui-title`: browser tab title (default `Drone Dashboard`)

Environment variables:
- `AUTH_TOKEN`: fallback for `--auth-token`
- `SUPERUSER_EMAIL`: PocketBase admin email (default `admin@example.com`)
- `SUPERUSER_PASSWORD`: PocketBase admin password (auto-generated if empty)

## Commands

### Frontend (`frontend/`)

- `deno task dev`: start Vite dev server
- `deno task build`: build production assets into `../backend/static`
- `deno task preview`: preview production build with Vite
- `deno task serve`: serve `dist/` via std file server (only if you generated `dist/` manually)
- `deno task test`: run tests
- `deno task test:watch`: run tests in watch mode
- `deno task verify`: run fmt + lint + type-check

### Backend (`backend/`)

- `go run main.go -fpvtrackside=http://localhost:8080 -port=3000`
- `go test ./...`
- `go vet ./...`
- `./build.sh`

### Repo preflight (from repo root)

```bash
deno task -c e2e/deno.json preflight
```

Runs frontend verify, e2e verify, and backend vet checks in parallel.

## PB Snapshot (offline seed)

- Generate: use the floating `Download PB Snapshot` dev tool in the running app.
- Import: start backend with `--import-snapshot=/path/to/pb-snapshot.json`.
- Import behavior: upserts by id, preserves relationships, and marks `currentEventId` as current.

## Architecture

- Frontend: `frontend/` (React + Vite + Deno)
- Backend: `backend/` (Go + PocketBase + embedded static assets)
- E2E/preflight harness: `e2e/`
- Docs: `docs/ARCHITECTURE.md`

## Project Structure

```text
.
├── frontend/            # React app (Deno + Vite)
├── backend/             # Go server + PocketBase + embedded static assets
├── e2e/                 # Playwright/e2e + preflight tooling
├── docs/                # Project docs
├── scripts/             # Helper scripts
└── .github/             # CI/CD config
```

## Troubleshooting

- Frontend cannot reach API: verify backend is running and `VITE_API_URL` points to it.
- Admin login issues: set `SUPERUSER_EMAIL` / `SUPERUSER_PASSWORD` or check backend logs for generated credentials.
- Need direct FPVTrackside diagnostics: run backend with `--direct-proxy` and use `/direct/*`.

## Contributing

- Follow `CONTRIBUTING.md` and `CODING_STANDARDS.md`.
- Use Conventional Commits (for example, `feat(leaderboard): add position change tags`).
- Keep tests near implementation files and keep changes focused.
