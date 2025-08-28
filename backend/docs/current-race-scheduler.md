# Current Race Scheduling and Polling

This document explains how the backend determines the current race, how it prioritizes polling for that race, observed inefficiencies, and concrete improvement ideas.

## Overview

- Two long‑running loops:
  - Discovery: reconciles `ingest_targets` for the active event (what to poll, how often).
  - Worker: executes due targets and reschedules them.
- Active race prioritization is applied on startup, after discovery, and on DB hooks for key collections.
- Settings live in `server_settings`; targets live in `ingest_targets`.

Key code:
- `backend/scheduler/manager.go` (discovery, worker, prioritization)
- `backend/migrations/1700000002_scheduler_collections.go` (collections)

## Current Behavior

### Discovery (`Manager.runDiscovery`)

1. Fetch current event source id and event data from FPVTrackside.
2. Ingest event meta; resolve PocketBase event id.
3. Seed/update targets for `event`, `pilots`, `channels`, `rounds` at the full interval, and `results` at a shorter interval.
4. Seed one `race` target per race id at the idle interval.
5. Prune orphan `race` targets no longer present upstream.
6. Call `ensureActiveRacePriority()`.

### Worker (`Manager.drainOnce`)

- Every `workerIntervalMs` (~200ms), loads all `ingest_targets`, filters due and enabled, sorts by `(nextDueAt ASC, priority DESC)`, and processes up to `burst` items (default 2).
- Each run calls the relevant ingest function and then `reschedule()`:
  - On success: set `lastStatus=ok`, `lastFetchedAt=now`, `nextDueAt = now + interval + jitter`.
  - On error: set `lastStatus=error`, `nextDueAt` to a small backoff (capped to `4*interval`).

### Current Race Detection and Ordering

- `recalculateRaceOrder(eventId)`: single SQL `UPDATE` sets `races.raceOrder = ROW_NUMBER() OVER (ORDER BY rounds.order, races.raceNumber)`.
- `findCurrentRaceWithOrder(eventId)`: SQL CTE selects the current race using:
  - Active (valid + started + not ended), else
  - Next after last completed, else
  - First race.

### Prioritization (`ensureActiveRacePriority`)

1. Resolve current event PB id; recalc `raceOrder` for that event.
2. Find `(currentRaceId, currentOrder)`.
3. Bulk `UPDATE ingest_targets` for that event’s `race` targets:
   - Current race: `intervalMs = raceActiveMs` (default 200), `priority=100`, `nextDueAt=now`.
   - Others: `intervalMs = raceIdleMs` (default 5000), priority unchanged.
4. Ensure a `race` target exists for `currentRaceId` (create if missing).
5. Publish `client_kv(namespace='race', key='currentOrder')` with `{ order, raceId, computedAt }`.

### Triggers

- On startup (after loading config): call `ensureActiveRacePriority()`.
- After each discovery pass: call `ensureActiveRacePriority()`.
- DB hooks:
  - On update to `races` or `rounds` belonging to the current event: call `ensureActiveRacePriority()`.
  - On updates in `events` (e.g., `isCurrent` flip): call `ensureActiveRacePriority()`.

### Default Cadence (from `server_settings`)

- `scheduler.workerIntervalMs=200`
- `scheduler.raceActiveMs=200`
- `scheduler.raceIdleMs=5000`
- `scheduler.resultsMs=2000`
- `scheduler.burst=2`, `scheduler.jitterMs=150`

## Inefficiencies and Clunkiness

- Broad scans in worker: loads all `ingest_targets` every 200ms and filters in memory; inefficient at scale.
- Heavy‑handed priority updates: bulk `UPDATE` across all race targets even when the current race hasn’t changed; creates write‑amplification.
- KV churn: writes `client_kv` on every run, even if `(raceId, order)` is unchanged; unnecessary DB writes and realtime noise.
- Jitter sizing: fixed `jitterMs=150` is a large fraction of 200ms, degrading the “~200ms” active cadence.
- Unused knobs:
  - `ActiveCheck` configured but no periodic loop uses it; relies only on hooks/discovery.
  - `Concurrency` configured but worker processes items serially.
- Duplicate triggers: startup + discovery + hooks can fire `ensureActiveRacePriority()` repeatedly with no change.
- Discovery over‑fetch: always fetches event and reseeds targets even if nothing changed.
- Sorting cost: sorts due targets each tick; okay for small sets, adds overhead as targets grow.

## Improvements (Proposed)

1. Query only due targets
   - Replace fetch‑all with: `enabled=1 AND nextDueAt <= now` ordered by `(nextDueAt ASC, priority DESC)` with `LIMIT burst`.
2. Skip no‑op writes
   - Cache last current `(raceId, order)` per event; only run bulk `UPDATE` and KV publish when it changes.
3. Scale jitter by interval
   - Use `jitter = min(150ms, interval/10)`; for active 200ms, jitter 10–20ms; for idle 5000ms, up to 150ms.
4. Honor `concurrency`
   - Process due targets via a small goroutine pool (`Cfg.Concurrency`) to overlap network I/O.
5. Add active‑check ticker
   - Every `ActiveCheck`, re‑run `ensureActiveRacePriority()` to self‑heal if hooks are missed; throttle to avoid churn.
6. Reduce discovery pressure
   - Compare existing/remote race ids; only upsert/prune when changed or when counts drift.
7. Targeted updates
   - Update only the rows that must change (previous current and new current) instead of all race rows.

## Implementation Notes

- Worker due‑only query: `SELECT ... FROM ingest_targets WHERE enabled=1 AND nextDueAt <= :now ORDER BY nextDueAt ASC, priority DESC LIMIT :burst`.
- No‑op guards: Keep a small in‑memory map `[eventId] => {raceId, order}`; optionally mirror to `server_settings` for resilience.
- KV guard: Read existing `client_kv` value and compare before writing.
- Jitter: derive from per‑target interval in `reschedule()`.
- Concurrency: bound with a semaphore/channel; preserve `burst` as the max taken per tick.
- Targeted updates: reduce `UPDATE ingest_targets` to two row updates where possible.

These changes keep the existing architecture but remove unnecessary DB load and improve active polling fidelity.

