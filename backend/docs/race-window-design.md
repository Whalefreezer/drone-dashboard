# Race Window: Current, Previous, and Next N Races

This document proposes a small, DB-backed “race window” that the backend maintains so clients can quickly fetch:
- the current race (as determined by `findCurrentRace` in `scheduler/manager.go`),
- the previous race (if any), and
- the next N races.

It leverages PocketBase so the client can read a single record via the standard `/api` and optionally `expand` related records.

## Goals
- Single place to read current/prev/next-N races per event.
- Updated proactively as races change or become active/complete.
- Cheap to query from the client; no complex ordering logic in the frontend.
- Tunable N via a server setting.

## Proposed Collection: `race_windows`
One record per event.

Fields (PocketBase types):
- `event` (Relation → `events`, MaxSelect: 1, unique per collection)
- `current` (Relation → `races`, MaxSelect: 1)
- `previous` (Relation → `races`, MaxSelect: 1, optional)
- `next` (Relation → `races`, MaxSelect: 20, optional; holds up to N items)
- `currentOrder` (Number): 1-based position in the event’s ordered schedule
- `windowSize` (Number): how many “next” races were requested (N)
- `computedAt` (Number): epoch ms for freshness/debug

Indexes/rules:
- Unique index on `(event)` to ensure a single window per event.
- List/view rules open like other base collections (consistent with current project) unless we decide to restrict later.

Notes:
- Using relation fields allows the client to request expanded data in one call (e.g. `?expand=current,previous,next`), keeping duplication low.
- If we later want denormalized details (e.g., round names), we can add an optional JSON field (e.g., `summary`) but start with relations only.

## Ordering Logic (mirrors `findCurrentRace`)
We already compute the current race with a SQL CTE in `Manager.findCurrentRace(eventId)`. We can reuse the same ordered list to compute previous and next N.

Sketch (SQLite/DBX style):
```
WITH ordered_races AS (
  SELECT r.id,
         ROW_NUMBER() OVER (ORDER BY round."order" ASC, r.raceNumber ASC) AS race_order
  FROM races r
  LEFT JOIN rounds round ON r.round = round.id
  WHERE r.event = {:eventId}
),
current AS (
  SELECT id, race_order FROM ordered_races WHERE id = {:currentId}
),
prev AS (
  SELECT id FROM ordered_races, current WHERE ordered_races.race_order = current.race_order - 1
),
next AS (
  SELECT id FROM ordered_races, current 
  WHERE ordered_races.race_order > current.race_order
  ORDER BY ordered_races.race_order ASC
  LIMIT {:N}
)
SELECT ...
```
We only need the IDs to set relations in `race_windows`.

## Update Strategy
Update the window in the same places we already determine/promote the active race priority:

- Active race loop (`ensureActiveRacePriority`):
  - After computing `currentRaceId`, compute `previous` and `next[0..N-1]` and upsert the `race_windows` record for the current event.
  - Set `currentOrder`, `windowSize`, `computedAt`.

- Hooks (already registered):
  - `OnRecordAfterUpdateSuccess("races")` and `OnRecordAfterUpdateSuccess("rounds")` currently trigger `ensureActiveRacePriority()` when the record belongs to the current event. That will indirectly refresh the window as well.

- Discovery loop:
  - When races are added/removed, `ensureActiveRacePriority()` will run on the next tick; the window will be refreshed with the new schedule.

## Configurability
Add a server setting to control N:
- `server_settings.key = "scheduler.raceWindowNextN"`
- Default: `3`
- Read alongside existing scheduler settings in `loadConfigFromDB()` (add an `int` field on `Config`, e.g., `RaceWindowNextN`).

This keeps the window small and cheap to recompute; clients that need more can either increase N or query the full races list.

## Client Access Patterns
- Fetch current event ID: `events` where `isCurrent = true`.
- Fetch window: `GET /api/collections/race_windows/records?filter=event="<eventPBID>"&expand=current,previous,next`
- Realtime: The client may subscribe to `race_windows` changes for the current event to get immediate updates.

This is a single, cheap query instead of re-implementing ordering in the frontend.

## Migration Sketch
Add a new migration (e.g., `1700000003_race_windows.go`):
```go
raceWindows := core.NewBaseCollection("race_windows")
raceWindows.Fields.Add(
  &core.RelationField{Name: "event", CollectionId: events.Id, MaxSelect: 1},
  &core.RelationField{Name: "current", CollectionId: races.Id, MaxSelect: 1},
  &core.RelationField{Name: "previous", CollectionId: races.Id, MaxSelect: 1},
  &core.RelationField{Name: "next", CollectionId: races.Id, MaxSelect: 20},
  &core.NumberField{Name: "currentOrder"},
  &core.NumberField{Name: "windowSize"},
  &core.NumberField{Name: "computedAt"},
)
raceWindows.AddIndex("ux_race_windows_event", true, "event", "")
raceWindows.ListRule = types.Pointer("")
raceWindows.ViewRule = types.Pointer("")
if err := app.Save(raceWindows); err != nil { return err }
```
Down migration: drop `race_windows` if exists.

## Implementation Steps
1) Add `RaceWindowNextN int` to `scheduler.Config`; read from `server_settings` with default 3.
2) Add `updateRaceWindow(eventPBID string)` in `scheduler.Manager`:
   - Call `findCurrentRace(eventPBID)`; if empty, clear/skip.
   - Compute previous and next N via a query using the same `ordered_races` CTE.
   - Upsert into `race_windows` (find by `event` relation, create if missing).
3) Call `updateRaceWindow(eventPBID)` at the end of `ensureActiveRacePriority()` when current race is known.
4) Optional: also call in discovery after seeding/pruning races to reduce window staleness before the next active tick.
5) Add minimal logs for observability.

## Edge Cases
- No races: leave `race_windows.current` empty; `previous` and `next` empty arrays; set `computedAt`.
- Current is first race: `previous` stays empty.
- Less than N next races: `next` contains fewer items.
- Event switch: when `isCurrent` changes, `ensureActiveRacePriority()` will refresh and upsert the new event’s window.

## Alternatives Considered
- Compute-only API route: Implement a custom HTTP endpoint that computes on demand. Simpler in DB, but moves logic out of PocketBase and loses easy `expand` and realtime subscriptions. We can still add this later if needed.
- Separate items table (`race_window_items`) with one row per window position (prev/current/next[i]). More flexible but heavier to query/write for the current use case.

## Summary
Create a lightweight `race_windows` collection that is updated wherever we already determine the current race. This keeps client logic simple, exposes a single record to read/subscribe to, and reuses the same robust ordering logic we already maintain in the scheduler.

