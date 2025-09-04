# Race Order + Pointer: Simple Range Queries for Prev/Current/Next N

This design reduces moving parts by denormalizing a stable `raceOrder` onto each
`races` row and tracking the current order value via a tiny pointer or a generic
client key/value record. Clients then query the existing `races` collection by
`raceOrder` ranges to get previous/current/next-N.

## Goals

- Let clients fetch the race window using only `races` with a simple numeric
  range.
- Avoid a separate window record with arrays; keep relationships simple.
- Keep ordering consistent with current logic (round order, then raceNumber).

## Schema Changes

- Add to `races`:
  - `raceOrder` (Number): 1-based position within the event schedule, computed
    as `ORDER BY rounds.order ASC, races.raceNumber ASC`.
- New generic collection `client_kv` (extensible client-facing state):
  - `namespace` (Text, max 64): logical grouping (e.g., `race`)
  - `key` (Text, max 128, Presentable): variable name (e.g., `currentOrder`)
  - `value` (Text, up to ~8KB): JSON-encoded value (e.g.,
    `{ "order": 17, "raceId": "..." }`)
  - `event` (Relation → `events`, MaxSelect: 1, optional): scope to an event
  - `expiresAt` (Number, optional): epoch ms TTL for ephemeral values
  - Unique index on `(namespace, event, key)`

Usage example (replacing `race_order_pointers`):

- Write one row per current event with `namespace = "race"`,
  `key = "currentOrder"`, `value = { order: <int>, raceId?: <string> }`.
  - Clients read it and then query `races` by `raceOrder` range.

## Computing and Maintaining `raceOrder`

We already know the canonical ordering from `findCurrentRace`:

- Sort by `round.order` (Number field on `rounds`) ascending.
- Then by `races.raceNumber` ascending.

Two options:

1. Single SQL query (no in-memory loop)

- SQLite supports CTEs and window functions (PocketBase ships with modern
  SQLite). We can update all `raceOrder` values for an event in one shot:

```
WITH ordered AS (
  SELECT r.id, ROW_NUMBER() OVER (
    ORDER BY round."order" ASC, r.raceNumber ASC
  ) AS pos
  FROM races r
  LEFT JOIN rounds round ON r.round = round.id
  WHERE r.event = {:eventId}
)
UPDATE races
SET raceOrder = (
  SELECT pos FROM ordered WHERE ordered.id = races.id
)
WHERE event = {:eventId};
```

Notes:

- This relies on SQLite window functions (≥ 3.25). If targeting older SQLite,
  see option 2.
- Efficient and atomic; no row-by-row roundtrip.

2. In-memory mapping (current approach)

- Query ordered `(id, pos)` pairs with the same CTE, load into memory, then
  update rows where `raceOrder != pos`.
- Pros: straightforward to implement with PocketBase’s record APIs; easier to
  add conditional updates and logging per row.
- Cons: more roundtrips; slightly more code; not atomic.

When to run the recalculation (both options):

- After discovery reconciles races for the current event
- After `round.order` changes (hook on `rounds` updates) or a race’s
  `raceNumber` changes (hook on `races` updates)
- Optionally at app start for the current event

This keeps updates small and idempotent; events typically have tens/hundreds of
races.

## Current Order Publication (Pointer vs Generic KV)

Extend `findCurrentRace` to also return `race_order`, then publish it via
either:

Option A — Generic KV (recommended)

- `findCurrentRaceWithOrder(eventId) (id string, order int)`; write to
  `client_kv` with:
  - `namespace = "race"`, `key = "currentOrder"`, `event = <eventPBID>`
  - `value = { "order": <int>, "raceId": "<id>" }`
  - `computedAt = now`
- Pros: generic facility for future client-facing state; supports JSON payloads;
  scoping by event; optional TTL.
- Cons: requires clients to parse JSON for the integer.

Option B — Dedicated pointer collection

- Keep the earlier `race_order_pointers` design with `currentOrder` as a numeric
  field.
- Pros: simpler consumer; numeric filtering/sorting on the field.
- Cons: single-purpose collection; less flexible long-term.

Either option is written from `ensureActiveRacePriority()` after determining the
current race.

## Client Usage

- Get current event PBID: `events` where `isCurrent = true`.
- Read current order via one of:
  - Generic KV: `client_kv` where
    `namespace="race" && key="currentOrder" && event="<eventPBID>"` (parse JSON
    value)
  - Pointer collection: `race_order_pointers` where `event="<eventPBID>"` (read
    numeric field)
- Query `races` by range:
  - `filter=event="<eventId>" && raceOrder >= <currentOrder>-1 && raceOrder <= <currentOrder>+<N>`
  - `sort=raceOrder`

This yields a single list from the `races` collection — no extra window record
required.

## Migration Sketch

Add field to `races` and a generic KV collection (or pointer collection),
numbers illustrative:

```go
// up
races := mustFind(app, "races")
races.Fields.Add(&core.NumberField{Name: "raceOrder"})
if err := app.Save(races); err != nil { return err }

clientKV := core.NewBaseCollection("client_kv")
ev, _ := app.FindCollectionByNameOrId("events")
clientKV.Fields.Add(
  &core.TextField{Name: "namespace", Required: true, Max: 64},
  &core.TextField{Name: "key", Required: true, Max: 128, Presentable: true},
  &core.TextField{Name: "value", Max: 8192}, // JSON payload
  &core.RelationField{Name: "event", CollectionId: ev.Id, MaxSelect: 1},
  &core.NumberField{Name: "expiresAt"},
)
clientKV.AddIndex("ux_client_kv_scope", true, "namespace, event, key", "")
clientKV.ListRule = types.Pointer("")
clientKV.ViewRule = types.Pointer("")
if err := app.Save(clientKV); err != nil { return err }

// down
_ = app.DeleteTable("client_kv")
// (we typically keep additive fields; if needed: remove raceOrder field from races)
```

## Scheduler Wiring (Minimal)

- `Manager` additions:
  - `recalculateRaceOrder(eventId string)`: recompute and write `raceOrder`
    using either the single-query CTE update or the in-memory mapping.
  - `findCurrentRaceWithOrder(eventId string) (id string, order int)`: same CTE,
    return both.
  - `publishCurrentOrderKV(eventId string, raceId string, order int)`: upsert
    into `client_kv` under `namespace="race"`, `key="currentOrder"` with JSON
    value.
  - (Alternative) `updateRaceOrderPointer(eventId string)`: upsert to a
    dedicated pointer collection if we go that route.
- Call sites:
  - End of `ensureActiveRacePriority()`: after current race resolved,
    `recalculateRaceOrder(eventId)` then publish current order (KV or pointer).
  - Hooks for `rounds` (order changed) and `races` (raceNumber changed): trigger
    recalculation and republish when affecting current event.
  - Discovery loop after seeding/pruning races for the current event.

## Edge Cases

- No races: leave `currentOrder` unset or 0; client should handle empty window.
- Missing `round.order`: treat as nulls ordered last (SQLite does this by
  default for ASC); still deterministic.
- Ties: if two races have the same `(round.order, raceNumber)`, their relative
  order is undefined; upstream data should avoid ties.
- Event switch: pointer is per event; when `isCurrent` changes, the next tick
  will refresh the pointer for the new event.

## Pros / Cons

Single-query CTE update vs. in-memory mapping

- Single-query: atomic, minimal app involvement, fastest. Requires SQLite window
  functions; harder to log per-row changes.
- In-memory: flexible, easy per-row diffs/logging; more roundtrips; not atomic.

Versus `race_windows` Pros

- Simpler reads: only `races`; easy range filters and sorting.
- Less duplication: ordering data lives with `races`.
- Publication via generic KV is reusable for other client-facing small state.

Cons

- Requires maintaining a denormalized `raceOrder` on updates.
- A few extra writes when seeding or when ordering fields change.
- If using generic KV, clients must parse JSON; if using pointer collection, you
  add a purpose-specific table.

## Summary

Add `raceOrder` to `races` and a tiny `race_order_pointers` collection holding
only the current order per event. Keep `raceOrder` in sync based on round
ordering and `raceNumber`. The client can then pull prev/current/next-N by a
single range query against `races`.
