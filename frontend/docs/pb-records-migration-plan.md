# PocketBase Records Migration Plan

This document describes how to migrate the frontend state and components to use PocketBase record types that extend `PBBaseRecord` (from `frontend/src/api/pbTypes.ts`) and to rely exclusively on live subscriptions via `pbSubscribeCollection` and `pbSubscribeByID`. The end goal is a clean, forward-looking codebase that is PocketBase‑centric, with no polling and no legacy domain interfaces extending `DbObject`.

## Goals

- Use live subscriptions only: `pbSubscribeCollection` and `pbSubscribeByID`.
- Replace legacy domain interfaces (`DbObject` + `RaceEvent`, `Pilot`, `Round`, `Channel`, etc.) with PB record types from `pbTypes.ts`.
- Remove polling helpers (`pbList`, `pbFirst`, `pbGetById`, and `pbFetch*`).
- Keep race processing logic working while we migrate, then align it to PB types.

## Scope

- Frontend state: atoms under `frontend/src/state/`.
- UI components that read pilots, channels, rounds, event, and race data.
- Shared utilities that reference legacy shapes.

## Current State (high level)

- `pbAtoms.ts` now powers most state with PB subscriptions and provides domain‑mapped outputs for compatibility.
- `raceFamilyAtom` builds a `RaceWithProcessedLaps` from live PB collections (races, laps, detections, gamePoints).
- Consumers still use domain shapes (e.g., `ID`, `Name`, `RoundNumber`).
- `frontend/src/api/pb.ts` still contains unused polling helpers (`pbList`, `pbFirst`, `pbGetById`, `pbFetch*`).

## Target State

- All atoms expose PB record types directly (extending `PBBaseRecord`).
- UI components read PB fields (e.g., `sourceId`, `name`, `number`, `roundNumber`).
- Race computations either:
  - accept PB record inputs directly, or
  - use a small adapter at the boundary to produce the computed view.
- Remove legacy domain interfaces and their exports from `frontend/src/types/*`.
- Remove polling helpers and dead code in `frontend/src/api/pb.ts`.

## Field Mapping Guidelines

- ID mapping: `ID` → `sourceId`
- Common renames:
  - `Name` → `name`
  - `Number` → `number`
  - `Band` → `band`
  - `ShortBand` → `shortBand`
  - `ChannelPrefix` → `channelPrefix`
  - `Frequency` → `frequency`
  - `DisplayName` → `displayName`
  - `RoundNumber` → `roundNumber`
  - `EventType` → `eventType`
  - `RoundType` → `roundType`
  - `Valid` → `valid`
  - `Order` → `order`

Note: PB relations use PB IDs (`id`), not `sourceId`. Always join collections using PB IDs (`id`). Convert to `sourceId` only when needed for legacy boundaries (to be removed).

## Migration Phases

### Phase 1: Expose PB Records (Minimal Blast Radius)

Atom changes (live, no polling):
- `pilotsAtom`: expose `PBPilotRecord[]` (from `pbTypes.ts`).
- `channelsDataAtom`: expose `PBChannelRecord[]`.
- `roundsDataAtom`: expose `PBRoundRecord[]` scoped by current PB event.
- `currentEventAtom`: expose `PBEventRecord | null` (selected by `isCurrent`).
- `eventIdAtom`: expose `string | null` = currentEvent.sourceId (fallback: env).

Consumer changes:
- Update usages of `ID`, `Name`, etc., to PB fields:
  - `pilot.ID` → `pilot.sourceId`, `pilot.Name` → `pilot.name`.
  - `channel.ID` → `channel.sourceId`, `channel.Number` → `channel.number`, etc.
  - `round.ID` → `round.sourceId`, `round.RoundNumber` → `round.roundNumber`, etc.
- `eventDataAtom` consumers that only need basic event info can read `currentEventAtom` directly, or we keep a minimal derived `eventDataAtom` (PB‑backed) while we migrate race logic.

Outcomes:
- Components use PB types everywhere for pilots, channels, rounds, and current event.
- Race view remains temporarily adapted to domain shape via `raceFamilyAtom`.

### Phase 2: Race View and Calculations

- Update `raceFamilyAtom` to return a PB‑native computed shape or keep a thin adapter:
  - Input sources: `races`, `laps`, `detections`, `gamePoints` (all live via subscriptions).
  - Continue using PB IDs to join collections; map to computed values as needed.
- Update `calculateProcessedLaps` and any dependent utilities to accept PB‑friendly inputs or to be isolated behind a tiny adapter.
- Update all race consumers to the new PB‑centric shape.

### Phase 3: Cleanup

- Remove legacy domain types under `frontend/src/types/*` that extend `DbObject`.
- Update `frontend/src/types/index.ts` to stop exporting removed domains or replace with PB exports if a central index helps.
- Remove unused helpers in `frontend/src/api/pb.ts` (`pbList`, `pbFirst`, `pbGetById`, `pbFetch*`).

## Affected Areas and Files

- State
  - `frontend/src/state/pbAtoms.ts` (atoms and mappings)
  - `frontend/src/state/hooks.ts` (may need minor type tweaks)
- UI
  - `frontend/src/leaderboard/*`
  - `frontend/src/pilot/*`
  - `frontend/src/race/*`
  - `frontend/src/common/*`
- Types
  - `frontend/src/api/pbTypes.ts` (authoritative PB types)
  - Remove legacy `frontend/src/types/*.ts` domain shapes
- API helpers
  - `frontend/src/api/pb.ts` (delete polling helpers and dead code)

## Testing and Verification

- Build and typecheck after each phase to surface field rename issues.
- Verify live updates by modifying records in PocketBase Admin UI:
  - pilots/channels/rounds appear and update without refresh
  - races update in real time (laps, detections, gamePoints)
- Run existing unit tests; update tests to use PB shapes where necessary.

## Rollout Notes

- Prefer small PRs per phase (and per area) to reduce merge pain.
- When converting a component, do the minimal mapping at the edge if required, then remove it immediately after the parent atoms are migrated.

## Out of Scope (for now)

- Expanding schema or adding computed collections in PB.
- Backfilling event‑level `Channels` and `ChannelColors` arrays; components should gracefully handle absence.

## Follow‑ups

- After Phase 3, consider deleting the `types/` folder entirely if all consumers are using `pbTypes.ts` and utility enums.
- Consider creating a small “computed race view” type colocated with race atoms for clarity and testability.

