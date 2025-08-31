# Phase 1 Inventory – Deprecate DbObject and minimize sourceId

This document captures Phase 1 discovery and safe type-only realignment for the migration to PocketBase record types, per
[deprecate-dbobject-and-sourceid.md](mdc:frontend/docs/deprecate-dbobject-and-sourceid.md).

## Legacy interfaces extending DbObject

- [types/common.ts → DbObject](mdc:frontend/src/types/common.ts)
  - Also extends DbObject: `Track`, `PilotChannel`, `Detection`
- [types/channels.ts → Channel](mdc:frontend/src/types/channels.ts)
- [types/pilots.ts → Pilot](mdc:frontend/src/types/pilots.ts)
- [types/rounds.ts → Round](mdc:frontend/src/types/rounds.ts)
- [types/race.ts → Race](mdc:frontend/src/types/race.ts)
- [types/event.ts → RaceEvent](mdc:frontend/src/types/event.ts)
- [types/results.ts → ResultJson](mdc:frontend/src/types/results.ts)

## Imports from src/types used as domain shapes

- [race/LapsView.tsx](mdc:frontend/src/race/LapsView.tsx)
  - Imports `PilotChannel` from `../types/index.ts`.
  - Status: updated to a types-only import to avoid runtime coupling.
- Tests import legacy types for fixtures (kept for now):
  - [pilot/PilotChannelView.test.tsx](mdc:frontend/src/pilot/PilotChannelView.test.tsx)
- Enums (kept temporarily):
  - `PrimaryTimingSystemLocation`, `ValidityType` from [types/common.ts](mdc:frontend/src/types/common.ts) used in
    [state/pbAtoms.ts](mdc:frontend/src/state/pbAtoms.ts)

## sourceId usages in joins/lookups/props

- [state/pbAtoms.ts](mdc:frontend/src/state/pbAtoms.ts)
  - `eventIdAtom` exposes `ev?.sourceId` (interop/display OK in Phase 1)
  - `eventRaceIdsAtom` maps `r.sourceId` for downstream compatibility
  - `raceFamilyAtom` builds computed legacy view with `ID: raceRec.sourceId`, and maps nested collections using `sourceId`
- [race/LapsView.tsx](mdc:frontend/src/race/LapsView.tsx)
  - `roundData.find((r) => r.sourceId === race.Round)`
  - Join pilot/channel via `p.sourceId === pc.Pilot` and `c.sourceId === pc.Channel`
- [bracket/BracketsView.tsx](mdc:frontend/src/bracket/BracketsView.tsx)
  - Pilot-name set built via `pilots.find((p) => p.sourceId === pc.Pilot)`
- [leaderboard/leaderboard-logic.ts](mdc:frontend/src/leaderboard/leaderboard-logic.ts)
  - `findChannelById` uses `channels.find((c) => c.sourceId === channelId)`
  - Race lookups use `pc.Pilot`/`pc.Channel` (legacy GUIDs)
- [leaderboard/Leaderboard.tsx](mdc:frontend/src/leaderboard/Leaderboard.tsx)
  - `ChannelDisplayCell` displays `ChannelSquare` with `channel.sourceId` (display only)

## PB record types available

- Ground truth PB types live in [api/pbTypes.ts](mdc:frontend/src/api/pbTypes.ts):
  - `PBPilotRecord`, `PBChannelRecord`, `PBRoundRecord`, `PBRaceRecord`, `PBLapRecord`, `PBDetectionRecord`, `PBGamePointRecord`,
    `PBPilotChannelRecord`, `PBEventRecord`, `PBResultRecord`

## Phase 2 targets (functional switch to PB IDs)

- Replace legacy joins/props using `sourceId` with PB relations/IDs:
  - [race/LapsView.tsx](mdc:frontend/src/race/LapsView.tsx)
    - Join `round` via PB `id` and `race.round`, pilot/channel via PB `id` and `PBPilotChannelRecord`.
  - [bracket/BracketsView.tsx](mdc:frontend/src/bracket/BracketsView.tsx)
    - Build pilot-name set using PB `id` joins rather than `sourceId`.
  - [leaderboard/leaderboard-logic.ts](mdc:frontend/src/leaderboard/leaderboard-logic.ts)
    - `findChannelById` by PB `id`; update `getPilotChannelIdInRace` to return PB channel `id`.
  - [state/pbAtoms.ts](mdc:frontend/src/state/pbAtoms.ts)
    - Shift derived atoms and computed view to prefer PB `id`; keep adapters at boundaries.

## Edits applied in Phase 1 (no behavior changes)

- Updated type-only import to avoid runtime usage of legacy domains:
  - [race/LapsView.tsx](mdc:frontend/src/race/LapsView.tsx)

## Notes

- Keep using `sourceId` strictly for display/interop during transition.
- Do not remove legacy `src/types/*` exports until all consumers are migrated in Phase 2.

## Quick commands

```bash
# Find legacy interfaces
rg "extends\s+DbObject" frontend/src

# Find risky sourceId usages
rg "\.sourceId\b" frontend/src
```
