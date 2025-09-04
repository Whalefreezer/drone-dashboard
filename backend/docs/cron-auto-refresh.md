# Auto-Refresh (No Cron)

This document proposes a robust, flexible auto-refresh subsystem that does NOT
rely on PocketBase’s `app.Cron()` (minute‑granularity). Instead, it runs
in-process goroutine tickers to achieve sub-second scheduling (e.g., 200ms),
while keeping full admin control via PocketBase collections.

Goals

- Evenly refresh everything that `/ingest/full` discovers approximately every 10
  seconds without spiking the upstream.
- Pull immediately when new or changed data is detected (or confidently known).
- During an active race, poll that race aggressively (target: every ~200ms).
- Make polling frequency configurable per object type and conditional on DB
  state.

Key Ideas

- Run a small in-process scheduler with time.Ticker-based loops to support
  200ms+ cadences.
- Maintain a DB-backed set of “targets” to poll, each with its own interval,
  next-due time, and jitter/stagger.
- Separate discovery from work: a slower discovery loop reconciles the target
  set; a fast worker loop drains a few due targets per tick.
- Derive “active race” from PocketBase records (mirroring the frontend logic)
  and dynamically adjust that race’s interval to ~200ms.

High-Level Architecture

- Discovery loop (Ticker ~10s): Reconciles targets based on upstream state and
  current event.
  - Adds/updates targets for event snapshot (pilots, channels, rounds), races,
    and results.
  - Applies a hash-based phase offset so that target next-due times are
    staggered across the 10s window.
- Worker loop (Ticker ~200ms): Selects a small number of due targets (ordered by
  `nextDueAt`, then priority) and runs the relevant ingestion operation.
  - Updates each target’s `nextDueAt` = now + current interval (interval may be
    dynamic).
  - Enforces soft concurrency = 1 or small N to keep upstream load even.
- Immediate triggers: Record hooks and admin actions promote targets to “due
  now” when something likely changed (no reliance on upstream ETag/IMS).
- Active race acceleration: A separate calc loop (Ticker ~1s) detects the active
  race and temporarily sets its interval to ~200ms.

Collections and State To keep the scheduler robust across restarts and
observable/controllable via the Admin UI, store scheduling state in PocketBase
collections. An external admin app can modify these records to stop polling,
increase frequency, etc.

- `ingest_targets` (new)
  - `type` (text enum): `event_snapshot` | `race` | `results` | `rounds` |
    `pilots` | `channels`
  - `sourceId` (text): upstream ID for the target (e.g., race ID; for
    snapshot‐scoped items, the event ID)
  - `intervalMs` (number): base interval in milliseconds
  - `nextDueAt` (date): next time this target should be polled
  - `priority` (number): optional boost for important targets (e.g., the active
    race)
  - `enabled` (bool, default true): allows an admin to pause a target
  - `etag` (text, optional): last seen ETag/hash (to support conditional
    fetches)
  - `lastFetchedAt` (date, optional)
  - `lastStatus` (text, optional): e.g., `ok`, `error: <msg>`

- Generic settings table (name TBD, e.g., `server_settings`)
  - `key` (text, unique): e.g., `scheduler.enabled`, `scheduler.concurrency`,
    `scheduler.burst`, `scheduler.fullIntervalMs`, `scheduler.raceActiveMs`,
    `scheduler.raceIdleMs`, `scheduler.resultsMs`, `scheduler.jitterMs`
  - `value` (text or JSON): value for the key; parsed at read time

You can implement these collections via migrations and provide an index on
`ingest_targets(nextDueAt, priority)`.

Scheduler Loops (No Cron) Start these loops from `app.OnServe()` (or immediately
after wiring routes) and stop them on app shutdown with a context cancellation:

1. Discovery loop (Ticker ~10s)

- Determine current event ID: `ingestService.Client.FetchEventId()`.
- Fetch event to list races: `ingestService.Client.FetchEvent(eventId)`.
- Upsert `ingest_targets` rows for:
  - `event_snapshot` (pilots/channels/rounds): `intervalMs ~= 10000`.
  - One `race` per event race ID: default `intervalMs` for non-active races
    (e.g., 2000–10000ms).
  - `results`: `intervalMs ~= 2000–5000ms`.
- Compute and apply a phase offset per target, e.g.
  `offset = hash(sourceId) % intervalMs`, so `nextDueAt = now + offset`.
- Remove orphaned targets for absent items.

-
  2. Worker loop (Ticker ~200ms)
- Select up to `N` enabled, due targets ordered by
  `(nextDueAt asc, priority desc)`.
- For each target type, call the appropriate ingestion method:
  - `event` → `IngestEventMeta(eventId)` (Event.json)
  - `pilots` → `IngestPilots(eventId)` (Pilots.json)
  - `channels` → `IngestChannels(eventId)` (Channels.json)
  - `rounds` → `IngestRounds(eventId)` (Rounds.json)
  - `race` → `IngestRace(eventId, raceId)`
  - `results` → `IngestResults(eventId)`
- On success, set `lastFetchedAt=now`, recompute interval (see Active Race), and
  set `nextDueAt=now+interval` (+ small jitter 0–150ms).
- On error, set `lastStatus` and push `nextDueAt` out with backoff (e.g., +1s,
  +2s, +4s … capped).

3. Active race loop (Ticker ~1s)

- Determine current event (events collection: `isCurrent==true`).
- Load races for the event and apply the frontend’s logic:
  - Active = race.valid && race.start set && race.end not set.
  - Else, find last completed and the next one as “current” (but not active).
- If an active race exists, upsert its `ingest_targets` row with
  `intervalMs=200` and `priority` high; otherwise revert to `idle` interval
  (configurable).

Immediate Refresh Triggers You want “pull immediately” when we detect a change.
Introduce these signals (without changing the upstream service):

- PocketBase hooks: In `backend/main.go` (or a `scheduler` package), subscribe
  to record changes that imply derived data should refresh:
  - `OnRecordAfterUpdate("races")`: if `start` changes from zero to non-zero
    while `end` is zero → promote that race target to 200ms interval and
    `nextDueAt=now`.
  - `OnRecordAfterUpdate("races")`: if `end` changes from zero to non-zero →
    demote interval to idle.
  - `OnRecordAfterCreate("rounds")`, `OnRecordAfterCreate("pilots")`, etc., if
    the admin edits data → mark snapshot and results due.
- Manual trigger endpoint: Keep `/ingest/*` routes for admin. When called, they
  can also update relevant targets to `nextDueAt=now` so the worker absorbs them
  immediately.

Configuration Expose flags in `backend/main.go` so operators can tune behavior
without rebuilds:

- `-ingest-full-interval=10s`: Base cadence for discovery/snapshot additions.
- `-ingest-race-active=200ms`: Polling interval for the active race.
- `-ingest-race-idle=5s`: Interval for idle races.
- `-ingest-results-interval=2s`: Results refresh.
- `-ingest-concurrency=1`: Max worker parallelism (start with 1 for even
  upstream load).
- `-ingest-burst=2`: Max due targets drained per tick.

Runtime Control

- Enabled by CLI flag: pass `-ingest-enabled=false` to fully disable background
  fetching; otherwise loops run.
- Per-target control via DB: set `ingest_targets.enabled=false` to pause
  specific items; adjust `intervalMs` and `priority` as needed.
- Future admin UI: a generic key/value settings collection (e.g.,
  `server_settings`) exists to support broader runtime config later, but is not
  required for enabling/disabling the scheduler.

Implementation Steps

1. Create `ingest_targets` collection via migration with the schema above; index
   `(nextDueAt, priority)`.
2. (Optional for future) Create a generic key/value settings collection (name
   TBD, e.g., `server_settings`) with `key` and `value` fields to support richer
   admin UI later.
3. Add a `scheduler` package under `backend/scheduler`:
   - `Manager` struct with references to `core.App`, `ingest.Service` and
     configuration.
   - Methods:
     - `Start(app core.App)` to initialize dependencies.
     - `StartLoops(ctx)` to launch discovery/worker/active-race tickers in
       goroutines and listen for shutdown.
     - `ReconcileTargets(eventId)` to seed/adjust targets list based on upstream
       discoveries.
     - `DrainOnce()` to select and execute due targets.
     - `Promote(type, sourceId)` to set `nextDueAt=now` and optionally bump
       `priority`.
     - `SetRaceInterval(raceId, intervalMs)` to switch active/idle cadence.
4. Wire into `main.go`:
   - Add a CLI flag `-ingest-enabled` (default true). If true, instantiate
     `scheduler.Manager` and call `StartLoops(ctx)` from OnServe; if false, skip
     starting loops.
   - Register `app.OnRecordAfterUpdate("races")` hooks that call
     `SetRaceInterval` and/or `Promote` accordingly.

Active Race Logic (mirrors frontend) The frontend’s `currentRaceAtom` and
`RaceTime.tsx` imply the following:

- Active race condition: valid, started (start not zero/empty), and not ended
  (end empty/zero‐like).
- If no active race, pick the next race after the last completed as “current”
  (but not active). Poll it at the idle cadence.
- When a race becomes active, switch to `-ingest-race-active` (default 200ms).
  When it ends, revert to idle.

API Surface Used by Scheduler

- `ingest.Service.Snapshot(eventId)`
- `ingest.Service.IngestRace(eventId, raceId)`
- `ingest.Service.IngestResults(eventId)`
- `ingest.Service.FullAuto()` is still available for manual/admin backfills; the
  scheduler deconstructs its components to preserve pacing.

Load Balancing and Staggering

- For each target, compute `phase = fnv64(sourceId) % intervalMs` and set
  `nextDueAt = now + phase` initially.
- Apply a small random jitter (0–150ms) at each reschedule to break alignment.
- Keep worker concurrency at 1 (or very low) to avoid spikes; increase
  `-ingest-burst` only if upstream can handle it.

Observability

- Log at `info` level when targets are created/updated and when the worker runs
  a target.
- Store `lastStatus` and `lastFetchedAt` on targets.
- Optionally add a `/admin/scheduler/targets` route (admin-only) to list due
  targets and their next runs.

Testing Plan

- Unit test `scheduler.Manager` methods (target reconciliation, due selection,
  backoff, promotion).
- In dev, set short intervals (e.g., `-ingest-full-interval=3s`,
  `-ingest-race-active=100ms`) and watch logs to verify pacing.
- Verify that declaring a race active flips its interval to 200ms and that
  ending the race reverts to idle.
- Validate that a single due target executes per tick and that immediate
  promotions preempt the schedule.

Security Notes

- Keep `/ingest/*` endpoints admin-only (current code already enforces
  superuser).

Future Enhancements

- Add a small in-memory rate limiter to cap bytes/sec to the upstream if needed.
- Persist a per-target failure counter; if a target flaps, extend backoff
  automatically.
- Add a lightweight webhook receiver if the upstream can notify changes, to
  promote targets without polling.

Summary By splitting discovery from work, using DB-backed targets with staggered
`nextDueAt`, and dynamically accelerating the active race, this design achieves
even upstream load, fast race updates (~200ms), and immediate refresh on
suspected changes, all without relying on PocketBase Cron. Admins can fully
control and observe the process via PocketBase collections or an external admin
app.
