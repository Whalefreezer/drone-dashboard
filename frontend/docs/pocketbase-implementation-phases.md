## PocketBase Integration – Phases and Tasks

This roadmap breaks down the work to normalize FPVTrackside data into PocketBase, ingest it, and migrate the frontend to query PocketBase.

References:

- Data model: [pocketbase-data-model.md](mdc:frontend/docs/pocketbase-data-model.md)
- Migrations and wiring: [pocketbase-migrations-and-wiring.md](mdc:frontend/docs/pocketbase-migrations-and-wiring.md)
- Ingestion and API: [pocketbase-ingestion-and-api.md](mdc:frontend/docs/pocketbase-ingestion-and-api.md)
- PocketBase migrations guide: [Extend with Go – Migrations](https://pocketbase.io/docs/go-migrations/)

### Scope and outcomes

- **Backend**: PocketBase schema, migrations, ingestion endpoints, optional schedulers.
- **Frontend**: Transition fetches from FPVTrackside proxy to PocketBase, preserving existing types.
- **Ops**: Repeatable backfill and migration history with clean deploys.

### Dependencies

- Go toolchain and current backend entrypoint (`backend/main.go`).
- Access to FPVTrackside Browser API (configurable via `-fpvtrackside-api`).

## Phase 0 – Discovery and validation

- Audit current fetches in `frontend/src/state/atoms.ts` and confirm required endpoints are stable.
- Confirm event selection strategy (how we get `eventId`).
- Define environment configuration conventions (ports, base URLs).
- Acceptance:
  - Document reviewed and signed off: the three design docs linked above.

## Phase 1 – PocketBase wiring and initial schema

- Add `migratecmd.MustRegister` and anonymous import of `backend/migrations` in `backend/main.go`.
- Create initial migration `init_collections` to define base collections per data model.
- Create follow‑up migration `indexes` with unique and performance indexes.
- Acceptance:
  - Server starts, applies migrations with no errors.
  - Admin UI shows collections with correct fields.

## Phase 2 – Ingestion service skeleton

- Create `backend/ingest/` package with:
  - HTTP client for FPVTrackside with base URL from flags.
  - Minimal Go structs to parse FPV JSON (aligned to TS types where feasible).
  - Upsert utilities keyed by `(source, sourceId)`.
  - IdMap cache for relation resolution.
- Acceptance:
  - Unit tests for upsert/idempotency pass locally.

## Phase 3 – Manual ingestion endpoints (admin‑only)

- Add routes under `/ingest/*`:
  - `POST /ingest/events/{eventId}/snapshot`
  - `POST /ingest/events/{eventId}/race/{raceId}`
  - `POST /ingest/events/{eventId}/results`
- Implement ingestion order: events → rounds → pilots/channels → races → detections/laps/gamePoints → results.
- Acceptance:
  - Triggering `/snapshot` ingests event, pilots, channels, rounds.
  - Triggering race endpoint ingests race data.
  - Admin UI reflects records with relations populated.

## Phase 4 – Full event backfill

- Implement `POST /ingest/events/{eventId}/full` to orchestrate all pulls and upserts with progress logging.
- Add rate limiting and retry policy for large events.
- Acceptance:
  - A representative event fully ingests from a clean database in a single run.

## Phase 5 – Frontend read path migration (controlled)

- Add PocketBase read adapters that return the same shapes as current FPV endpoints.
- Feature flag or env toggle to switch atoms from FPV proxy to PB endpoints incrementally:
  - `eventDataAtom`, `roundsDataAtom`, `pilotsAtom`, `raceFamilyAtom`.
- Keep client transforms like `calculateProcessedLaps` unchanged for now.
- Acceptance:
  - When toggled, UI renders identically from PB data for selected screens.

## Phase 6 – Rules, auth, and access

- Configure PocketBase collection rules: read‑only public where needed; admin write for ingestion.
- Optionally generate admin token/keys for server‑only endpoints.
- Acceptance:
  - Public GET access works for read collections; POST/PUT restricted.

## Phase 7 – Performance and indexing

- Validate query performance from the frontend and Admin UI.
- Add/adjust indexes for common queries (event‑scoped rounds/races, time‑sorted detections).
- Acceptance:
  - Target queries return within acceptable latency (TBD thresholds).

## Phase 8 – Scheduling, monitoring, and resilience (optional)

- Add periodic polling for active races (short interval) and inactive (long interval) using PB job scheduling or external cron.
- Add structured logging and ingestion summaries.
- Acceptance:
  - Automatic sync keeps PB current during an event with bounded load.

### Testing strategy

- Unit tests: upsert/idempotency, relation resolution, small JSON fixtures.
- Integration tests: end‑to‑end ingestion for a small event, verifying collection counts and key fields.
- UI verification: snapshot comparisons for PB vs FPV data sources.

### Rollback and recovery

- Migration history managed via PB `migrate history-sync` during squashes.
- Safe re‑ingestion: idempotent upserts allow re‑runs without duplicates.
- Backups: use PB file/db backup before schema changes in production.

### Risks and mitigations

- Source JSON changes: guard parsers and maintain compatibility; add schema validation.
- Large events: implement paging/rate limiting, and batch writes.
- Data consistency: enforce unique constraints and relation existence checks before write.

### Milestone checklist

- Phase 1: migrations compiled and applied
- Phase 3: manual endpoints usable
- Phase 4: full backfill successful
- Phase 5: frontend reads served from PB for target views
