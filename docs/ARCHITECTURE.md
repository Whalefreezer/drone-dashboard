# Architecture Guide

This page gives a quick map of the moving pieces that come up most often when triaging ingestion, cache, and admin tooling issues.

## Directory Map

| Area | Key files | Notes |
| ---- | --------- | ----- |
| **Frontend** | `frontend/src/routes/admin/*.tsx`, `frontend/src/state/pbAtoms.ts` | Deno + React app. Admin entry points live under `/admin/*`; state is driven by PocketBase subscriptions defined in `pbAtoms.ts`. |
| **Backend** | `backend/main.go`, `backend/ingest/*`, `backend/scheduler/*`, `backend/control/*` | Go server that embeds PocketBase. `main.go` wires services and selects ingest source. `ingest` owns fetch + upsert pipelines. `scheduler` discovers/queues work. `control` houses remote control link helpers and caches. |
| **Migrations** | `backend/migrations/*.go` | Declarative PocketBase collection definitions; useful for seeing which tables exist and what fields they expose. |
| **Docs & Scripts** | `docs/`, `scripts/`, `e2e/` | Reference material, build helpers, and end-to-end/preflight harnesses. |

## PocketBase Collections

Most ingest-related features read and write the collections declared in `backend/migrations/1700000000_init_collections.go`. The table below separates FPVTrackside–derived data from admin/local state so you can quickly tell what should or should not be purged.

| Collection | Data Source | Owner(s) |
| ---------- | ----------- | -------- |
| `events`, `rounds`, `pilots`, `channels`, `tracks` | FPVTrackside ingestion | `backend/ingest/*.go`, `frontend/src/state/pbAtoms.ts` |
| `races`, `pilotChannels`, `detections`, `laps`, `gamePoints`, `results` | FPVTrackside ingestion | `backend/ingest/race.go`, race-related atoms |
| `ingest_targets`, `server_settings` | Scheduler + admin tuning | `backend/scheduler/`, `frontend/src/routes/admin/settings.tsx` |
| `client_kv` | Backend-published race order + admin KV | `backend/scheduler/race.go`, `frontend/src/routes/admin/kv.tsx` |
| `control_stats` | Control link telemetry | `backend/control/stats_store.go`, `frontend/src/routes/admin/control.tsx` |

## Fetch & Scheduler Flow

1. **Discovery** (`backend/scheduler/discovery.go`) fetches the live FPVTrackside event, seeds PocketBase targets, and ensures the current event flag.
2. **Workers** (`backend/scheduler/worker.go`) dequeue `ingest_targets` and call into `backend/ingest/service.go` to fetch/update records.
3. **Ingest Service** (`backend/ingest/*`) parses JSON payloads and upserts via PocketBase transactions. The remote source keeps an in-memory ETag cache (`backend/ingest/source.go`).
4. **Current race cache** (`backend/control/current_race_provider.go`) memoises the active race identifiers when serving control endpoints.

## Admin Routes ↔️ Frontend Entry Points

| Backend route | Purpose | Frontend trigger |
| ------------- | ------- | ---------------- |
| `POST /ingest/events/{eventId}/snapshot` | Force snapshot for an event | Hooked up from admin ingest tools (planned) |
| `POST /ingest/events/{eventId}/race/{raceId}` | Manual single-race ingest | Admin tooling (future) |
| `POST /ingest/events/{eventId}/results` | Refresh event results | Admin ingest view |
| `POST /ingest/events/{eventId}/full` | Full ingestion run | `/admin/ingest` actions |
| `POST /ingest/full` | Auto-discovery full ingest | `/admin/ingest` full-auto button |

When wiring new admin actions, follow the pattern above: superuser guard in Go (`backend/ingest/handlers.go`) and a corresponding React card/button under `frontend/src/routes/admin/` that calls the route via the shared PocketBase client.

## Common Tasks Cheat Sheet

| Task | Touchpoints | Notes |
| ---- | ----------- | ----- |
| **Purge FPV cached data** | `backend/ingest/`, `backend/scheduler/`, `frontend/src/routes/admin/tools.tsx` | Delete rows where `source = 'fpvtrackside'`, reset scheduler caches, and surface a button in the admin Tools page. |
| **Add new collection field** | `backend/migrations/`, `backend/ingest/`, `frontend/src/api/pbTypes.ts` | Update migration, extend ingest upsert payloads, refresh PB types and any atoms/selectors. |
| **Expose new admin toggle** | `backend/migrations/1700000002_scheduler_collections.go`, `backend/scheduler/config.go`, `frontend/src/routes/admin/settings.tsx` | Store in `server_settings`, read during `Manager.loadConfigFromDB`, and add a settings editor row. |
| **Adjust ingest cadence** | `backend/scheduler/config.go`, `backend/scheduler/discovery.go` | Update defaults, ensure discovery seeds the right interval, and reflect changes in docs/tests. |

Keeping this page up to date should make it faster to answer “where does X live?” the next time we expand an issue or build tooling around ingestion.
