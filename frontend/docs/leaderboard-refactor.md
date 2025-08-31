# Leaderboard Refactor: From LBInputRace to Atoms

This document proposes replacing the `LBInputRace` DTO and the monolithic `calculateLeaderboardData` function with a set of focused Jotai atoms and small pure helpers. The goal is to eliminate duplication, reduce recomputation, and align the leaderboard with the PB‑native atom architecture (laps/channels per race).

## Current State (Problems)

- Duplication via `LBInputRace`:
  - We assemble a bespoke array of objects from `racesAtom` + per‑race atoms on every read.
  - This mirrors state already modeled by `raceProcessedLapsAtom(raceId)` and `racePilotChannelsAtom(raceId)`.
- Monolithic `calculateLeaderboardData`:
  - Mixes concerns: per‑race metric computation, cross‑race aggregation, UI assembly, and previous/position diffing.
  - Harder to test in isolation and recomputes broadly when any input changes.
- Brittle “recency” detection:
  - Uses `(roundId, raceNumber)` pairs to identify the recent race; these can collide or reorder.
  - We already have stable `raceId`.
- Data churn:
  - Re‑maps all races into new shapes per read; limited memoization and cache locality.

## Goals

- Eliminate `LBInputRace` and consume per‑race atoms directly.
- Split responsibilities into composable derived atoms with minimal, stable inputs.
- Use `raceId` as the primary identity for “recency” and history.
- Improve testability with small pure helpers and predictable derived atoms.

## Proposed Atom Graph

Terminology: `rid` = `raceId`.

- event context
  - `eventRaceIdsAtom: string[]` — race ids for current event.
  - `allRacesAtom: PBRaceRecord[]` — already sorted by `raceOrder` (PB‑native).
  - `currentRaceAtom: PBRaceRecord | null` and `currentRaceIndexAtom: number` — existing.

- per‑race primitives (existing)
  - `raceProcessedLapsAtom(rid): ProcessedLap[]`
  - `racePilotChannelsAtom(rid): { id; pilotId; channelId }[]`

- new per‑race derived
  - `racePilotStatsAtom(rid): Map<pilotId, { 
      bestLap?: { time; lapNumber }; 
      fastestConsec?: { time; startLap } (param: consecutiveLaps); 
      holeshot?: { time }; 
      totalNTarget?: { time; lapCount } (param: race.targetLaps)
    }>`
    - Input: `raceProcessedLapsAtom(rid)`, `racePilotChannelsAtom(rid)`, `consecutiveLapsAtom` and `PBRaceRecord.targetLaps`.
    - Output: per‑pilot metrics for that race only.

- new cross‑race aggregates
  - `pilotAggregatesForIdsAtom(raceIds: string[]): Map<pilotId, { overallBestLap?, fastestConsec?, holeshot?, fastestTotalRace?, totalLaps }>`
    - Folds across the provided list of race IDs using `racePilotStatsAtom(rid)`.
    - Purely derived from inputs; no internal state or snapshotting.
  - Comparison sets (by IDs):
    - `currentRaceIdsAtom: string[]` — all race IDs for the event (includes current and the last completed).
    - `previousRaceIdsAtom: string[]` — `currentRaceIdsAtom` excluding `lastCompletedRaceAtom?.id` and `currentRaceAtom?.id`.
  - Aggregates:
    - `currentAggregatesAtom = pilotAggregatesForIdsAtom(currentRaceIdsAtom)`
    - `previousAggregatesAtom = pilotAggregatesForIdsAtom(previousRaceIdsAtom)`

- scheduling and channel context
  - `pilotScheduledSetAtom: Set<pilotId>` — derived from union of `racePilotChannelsAtom(rid)` across all `rid`.
  - `pilotNextRaceDistanceAtom(pilotId): number` — compute races‑until‑next using `allRacesAtom`, `currentRaceIndexAtom`, and `racePilotChannelsAtom(rid)` for membership.
  - `pilotPreferredChannelAtom(pilotId): PBChannelRecord | null` — choose the first channel looking forward from current, then backward (using `racePilotChannelsAtom` + `channelsDataAtom`).

- leaderboard ordering and per‑pilot data
  - `leaderboardPilotIdsAtom: string[]` — pilot IDs in sorted order only, computed using `currentAggregatesAtom` (centralizes filtering + sorting via a pure helper and aggregate maps).
  - `pilotLeaderboardAtom(pilotId): { 
      current: { bestLap?, consecutiveLaps?, holeshot?, fastestTotalRaceTime? };
      previous: { bestLap?, consecutiveLaps?, holeshot?, fastestTotalRaceTime? };
      totalLaps: number;
      racesUntilNext: number;
      channel: PBChannelRecord | null;
      eliminatedInfo: { bracket: string; position: number; points: number } | null;
    }` — pairs the per‑pilot metrics from `currentAggregatesAtom` and `previousAggregatesAtom`.
  - Columns read only what they need (e.g., show time and diff if `current` vs `previous` differ).

- position deltas (previous vs current)
  - `leaderboardSnapshotAtom: { raceId: string | null; previousIds: string[]; currentIds: string[] }`
    - Update `previousIds` when `currentRaceAtom.id` changes or when a race completes.
  - `positionChangesAtom: Map<pilotId, number>` — computed diff between `previousIds` and `currentIds`.

## UI Wiring

- Table renders rows by mapping over `leaderboardPilotIdsAtom` to get pilot IDs.
- Each column pulls minimal fields from `pilotLeaderboardAtom(pilotId)` (or other small atoms) rather than a large `entries` object.
- Cells compute deltas by comparing `previous` vs `current` metric values — no persistence of last calculated values.
- Recency highlighting uses `currentRaceIndexAtom` and aggregates keyed by `raceId`.

## API Changes (Public Surface)

- Remove `LBInputRace` export; not needed.
- Keep pure helpers for times:
  - `computeBestLapForPilot(laps)`, `computeFastestConsecutive(laps, n)`, `computeTotalNFromHoleshot(laps, n)`.
  - These are shared by `racePilotStatsAtom` and remain testable without Jotai.

## Migration Plan (Incremental)

1) Introduce metrics helpers and `racePilotStatsAtom(rid)`
- Implement pure helpers for best lap, fastest consecutive, holeshot, and total N‑lap time.
- Implement `racePilotStatsAtom(rid)` using existing per‑race atoms + helpers.
- Unit test helpers; basic atom tests with fixture laps.

2) Add `pilotAggregatesAtom` and `pilotScheduledSetAtom`
- Fold across `eventRaceIdsAtom` and `racePilotStatsAtom(rid)`.
- Derive the scheduled set from pilotChannels across races.

3) Replace LBInputRace in leaderboard state
- Introduce comparison race ID sets: `currentRaceIdsAtom` and `previousRaceIdsAtom`.
- Add `currentAggregatesAtom` and `previousAggregatesAtom` using a shared aggregator.
- Introduce `leaderboardPilotIdsAtom` (sorted IDs) and `pilotLeaderboardAtom(pilotId)` that pairs `current` and `previous` per‑pilot metrics.
- Swap leaderboard to use these atoms instead of building `entries` arrays.
- Remove `LBInputRace` type and mapping.

4) Recency and diff by raceId
- Update cells that compute “recent” to use `raceId` from aggregates/stats instead of `(roundId, raceNumber)`.
- Add `leaderboardSnapshotAtom` and `positionChangesAtom` to manage prev/current.

5) Clean‑up and tests
- Remove `calculateLeaderboardData` or reduce to pure helpers that sorting atoms call.
- Verify UI parity; add tests for sort/group logic, per‑pilot atom fields, and deltas.

## Performance Considerations

- Atom granularity keeps recomputation bounded:
  - Changing laps for one race only invalidates `racePilotStatsAtom(rid)` for that `rid` and downstream aggregates.
- Avoid large array remaps per read; fold over `eventRaceIdsAtom` with memoized per‑race stats.
- Prefer `raceId` in aggregates for quick lookup and minimal joins.

## Open Questions

- When to roll `previous` snapshot? On race completion only, or also on lap changes within a race?
- How to handle ties or identical times across races in aggregates?
- Should “scheduled pilots” include those with no laps in any race yet? (Currently yes.)
- Do we need per‑event caching of aggregates for historical view modes?

## Acceptance Criteria

- No `LBInputRace` in codebase; leaderboard builds from atoms.
- Recency and position deltas operate by `raceId`.
- Refactor yields no functional regressions in leaderboard ordering and display.
- Unit tests cover:
  - Per‑race metrics helpers
  - Aggregation logic
  - Position diffing rules
