## Ingestion, Sync, and API Plan

This doc proposes how the backend will ingest FPVTrackside data, normalize it into PocketBase, and expose APIs for the frontend. It also outlines idempotency, scheduling, and backfill strategies.

References:
- Frontend fetches: [state/atoms.ts](mdc:frontend/src/state/atoms.ts)
- Types: [types/](mdc:frontend/src/types/index.ts)
- Migrations/wiring: [pocketbase-migrations-and-wiring.md](mdc:frontend/docs/pocketbase-migrations-and-wiring.md)
- Data model: [pocketbase-data-model.md](mdc:frontend/docs/pocketbase-data-model.md)
- PocketBase migrations: [Go Migrations](https://pocketbase.io/docs/go-migrations/)

### Ingestion sources

- FPVTrackside Browser API base (configurable): `-fpvtrackside-api` flag, proxied as `/fpv-api/*` in `backend/main.go`.
- Endpoints:
  - `/events/{eventId}/Event.json` (single event array)
  - `/events/{eventId}/Pilots.json`
  - `/httpfiles/Channels.json`
  - `/events/{eventId}/Rounds.json`
  - `/events/{eventId}/{raceId}/Race.json`
  - `/events/{eventId}/Results.json` and per‑race `Result.json`

### Ingestion service design

- A Go service in `backend/ingest/` implementing:
  - `FetchClient` (HTTP GET with base URL from flags)
  - `Parser` mapping JSON → internal structs aligned with `frontend/src/types/*` where feasible (duplicated minimal Go structs to decouple from TS)
  - `Upserter` resolving relations and writing into PocketBase via `app` core APIs.
  - `IdMap` layer: cache of `(sourceId → PB id)` per collection for relation resolution.

#### Idempotency and upsert rules

- All collections key on `(source="fpvtrackside", sourceId)`.
- Upsert steps per record type:
  1. Lookup existing by unique index `(source, sourceId)`.
  2. If exists, update changed fields only.
  3. If not, create and store PB id in `IdMap`.
- Relations are resolved after primary entities exist; order:
  - events → rounds → pilots/channels → races → detections/laps/gamePoints → results

#### Event scoping

- An ingestion run operates for a single `eventId` unless a full backfill is requested.
- Store `event` relation on rounds/races/results and contextual entities as described in the data model.

### Scheduling and triggers

- Initial implementation: manual HTTP endpoints to trigger pulls:
  - `POST /ingest/events/{eventId}/snapshot` → fetch Event, Pilots, Channels, Rounds, and existing Races for that event; upsert all.
  - `POST /ingest/events/{eventId}/race/{raceId}` → fetch a single race payload and upsert detections/laps/gamePoints.
  - `POST /ingest/events/{eventId}/results` → fetch aggregated results and upsert.

- Optional periodic job (later):
  - Use PocketBase jobs scheduling or an external cron to poll active races more frequently and inactive ones less.

### Backend routing

- Add a route group under `/ingest/*` with admin‑only access (PocketBase admin token or server‑only usage).
- Reuse the existing serve hook in `main.go` to register handlers that call the ingestion service.

### Error handling

- All ingestion endpoints return a summary: counts per collection, updated/created, and any errors.
- Partial failure strategy: continue per record type, accumulate errors, and return 207‑style JSON summary.

### Data freshness and frontend strategy

- Phase 1: Frontend continues to call the original FPV endpoints via proxy while we validate ingestion.
- Phase 2: Switch frontend atoms to query PocketBase collections:
  - `eventDataAtom` → `GET /api/collections/events/records?filter=sourceId=={eventId}`
  - `pilotsAtom` → `GET /api/collections/pilots/records?filter=event=={eventPBId}` (or global pilots if unscoped)
  - `channelsDataAtom` → `GET /api/collections/channels/records`
  - `roundsDataAtom` → `GET /api/collections/rounds/records?filter=event=={eventPBId}&sort=order`
  - `raceFamilyAtom(raceId)` → `GET /api/collections/races/records?filter=sourceId=={raceId}` then joins to `laps` and `detections`

We can expose denormalized PocketBase views via collection rules or embed relations to reduce client round‑trips.

### Backfill strategy

- Provide a `POST /ingest/events/{eventId}/full` endpoint that:
  1) pulls `Event.json`, `Pilots.json`, `Channels.json`, `Rounds.json`
  2) enumerates `Event.Races` and fetches each `Race.json`
  3) fetches `Results.json`
  4) performs upserts in order with rate limiting and progress logging

### Security and access

- Keep ingestion endpoints private/admin‑only.
- Public read access can be granted to select collections (e.g., events, rounds, races) as needed; detections/laps can be read‑only.

### Open questions

- Do we scope `pilotChannels` per event or maintain a global mapping plus event overrides? Proposal: scope by event to reflect temporary assignments.
- Should we materialize processed laps server‑side? For now, keep client‑side processing; revisit after performance review.

### Milestones

1. Implement migrations and wire migrate command.
2. Implement ingestion service skeleton and manual trigger endpoints.
3. Ingest single event snapshot successfully; verify via Admin UI.
4. Switch selected frontend atoms to PocketBase read APIs.


