# Deprecate DbObject Types and Minimize sourceId Usage

This document formalizes the cleanup work after completing the PocketBase records migration. We will remove legacy interfaces that extend `DbObject` and significantly reduce reliance on `sourceId` across the frontend. It complements and follows the direction in [pb-records-migration-plan.md](mdc:frontend/docs/pb-records-migration-plan.md).

## Goals

- Replace legacy domain interfaces extending `DbObject` with PB record types from `src/api/pbTypes.ts`.
- Use PB IDs (`record.id`) for relations and in component props/logic.
- Restrict `sourceId` usage to interoperability/display only; avoid using it for joins, lookups, or component contracts.
- Remove dead/legacy exports from `src/types/*` once consumers are migrated.

## Ground Truth Types

- PB record types live in [`src/api/pbTypes.ts`](mdc:frontend/src/api/pbTypes.ts) and mirror backend migration fields.
- They include: `PBEventRecord`, `PBRoundRecord`, `PBPilotRecord`, `PBChannelRecord`, `PBRaceRecord`, `PBLapRecord`, `PBDetectionRecord`, `PBGamePointRecord`, `PBPilotChannelRecord`, `PBTrackRecord`, `PBResultRecord`.
- Joins use PB relations by `id` (e.g., `race.round` → `rounds.id`, `pilotChannel.channel` → `channels.id`).

## What to Remove (after migration)

- Legacy domain shapes under [`src/types/*`](mdc:frontend/src/types/index.ts) that extend `DbObject`, e.g.:
  - [`types/channels.ts`](mdc:frontend/src/types/channels.ts)
  - [`types/pilots.ts`](mdc:frontend/src/types/pilots.ts)
  - [`types/race.ts`](mdc:frontend/src/types/race.ts)
  - [`types/results.ts`](mdc:frontend/src/types/results.ts)
  - [`types/rounds.ts`](mdc:frontend/src/types/rounds.ts)
  - [`types/event.ts`](mdc:frontend/src/types/event.ts)
- Keep or relocate shared enums as needed (e.g., `PrimaryTimingSystemLocation`, `ValidityType` in [`types/common.ts`](mdc:frontend/src/types/common.ts)) until consumers are updated. Prefer moving such enums into a PB-oriented location later if they are still useful.

## Identifier Policy

- **DO: Join and store relations using PB IDs** (`id`), not `sourceId`.
- **DO: Type component props and function parameters with PB record types or PB IDs.**
- **DON'T: Depend on `sourceId` for lookups, props, or joins.**
- **ONLY** use `sourceId` for:
  - Displaying the external GUID when needed (e.g., debug).
  - Interoperability at system boundaries (ingestion, URLs that must carry external IDs during transition). Avoid adding new dependencies.

## Phases

### Phase 1: Discovery and Type Realignment (No Behavior Changes)

- Inventory legacy areas:
  - Find interfaces that `extends DbObject`.
  - Find imports from `src/types/*` used as domain shapes.
  - Find `.sourceId` usage that participates in lookups/joins/props.
- Introduce PB types alongside legacy ones where convenient (types-only edits):
  - Update local variables and function generics to PB types where trivial.
  - Keep adapters if needed; do not remove legacy exports yet.
- Acceptance criteria:
  - Build passes with no runtime changes.
  - A list of files earmarked for Phase 2 updates is captured.

### Phase 2: Join and Prop Contract Migration (Functional Switch to PB IDs)

- Replace lookups/joins to use PB IDs and relation fields:
  - `find((p) => p.id === pilotChannel.pilot)` instead of using `sourceId`.
  - Components accept PB IDs/records in props rather than legacy GUIDs.
- Update component and hook signatures to PB-friendly contracts:
  - Props use PB IDs or specific PB record types.
  - Remove `.sourceId` from join logic. Keep only for display/debug.
- Update tests and fixtures to PB shapes.
- Acceptance criteria:
  - All affected components render correctly using PB IDs.
  - No joins/lookups depend on `sourceId`.

### Phase 3: Legacy Type Removal and Barrel Cleanup

- Delete legacy `DbObject`-extending interfaces in `src/types/*` once no references remain.
- Stop re-exporting legacy types from `src/types/index.ts`.
- Replace remaining shared enums with PB-centric locations if appropriate.
- Acceptance criteria:
  - No code references `DbObject` or legacy domain interfaces.
  - Imports from `src/types/*` are removed or limited to enums slated for relocation.

### Phase 4: Optional Normalization and Docs

- Normalize URLs and external interfaces to PB IDs where possible.
- Relocate shared enums (e.g., `PrimaryTimingSystemLocation`, `ValidityType`) to a PB-oriented module if still needed.
- Update this document and [pb-records-migration-plan.md](mdc:frontend/docs/pb-records-migration-plan.md) with completed scope and follow-ups.
- Acceptance criteria:
  - Documentation reflects the new contracts.
  - No new code introduces `sourceId`-based joins/props.

## Common Transformations

### Pilot/Channel lookup

```typescript
// BEFORE (legacy shapes)
const pilot = pilots.find((p) => p.sourceId === pilotChannel.Pilot)!;
const channel = channels.find((c) => c.sourceId === pilotChannel.Channel)!;
```

```typescript
// AFTER (PB relations)
// pilotChannel is a PBPilotChannelRecord
const pilot = pilots.find((p) => p.id === pilotChannel.pilot)!;
const channel = channels.find((c) => c.id === pilotChannel.channel)!;
```

### Component props

```typescript
// BEFORE (legacy prop contract)
import type { PilotChannel } from '../types/index.ts';
export interface PilotChannelViewProps { pilotChannel: PilotChannel; }
```

```typescript
// AFTER (PB-friendly contract)
import type { PBPilotChannelRecord } from '../api/pbTypes.ts';
export interface PilotChannelViewProps { pilotChannel: PBPilotChannelRecord; }
// Alternative: keep props minimal and explicit
export interface PilotChannelViewProps { pilotId: string; channelId: string; }
```

### Channel color example

```typescript
// BEFORE (array from legacy event data)
const colorIndex = eventData?.[0]?.Channels?.indexOf(channelID);
const color = (eventData?.[0]?.ChannelColors && colorIndex !== undefined && colorIndex > -1)
  ? eventData[0].ChannelColors[colorIndex]
  : '#888';
```

```typescript
// AFTER (PB record field from channels)
const channels = useAtomValue(channelsDataAtom);
const channel = channels.find((c) => c.sourceId === channelID /* interim */);
const color = channel?.channelColor ?? '#888';
// Preferred end-state: use PB id
// const channel = channels.find((c) => c.id === channelIdFromProps);
```

## Migration Steps

1. Update imports and types
   - Switch consumers to PB record types from `src/api/pbTypes.ts`.
   - Replace prop and function signatures to accept PB records or PB IDs (not `sourceId`).

2. Replace lookups and joins
   - Joins: use `id` fields and PB relation fields (e.g., `race.round`, `detection.race`, `pilotChannel.channel`).
   - Remove `sourceId`-based searches; keep them only where external interop is unavoidable.

3. Remove legacy domain types
   - Delete `DbObject`-extending interfaces once no references remain.
   - Stop re-exporting legacy types from [`types/index.ts`](mdc:frontend/src/types/index.ts).

4. Optional cleanups
   - If shared enums in `types/common.ts` remain useful, consider relocating to a PB-centric module (e.g., `src/common/enums.ts`) and adjust imports.

## Search/Replace Checklist

- Find usages to migrate:
  - `extends DbObject`
  - `.sourceId` in lookups/joins/props
  - Legacy fields: `Name`, `Number`, `RoundNumber`, `Valid`, etc.
- Apply mappings from [pb-records-migration-plan.md → Field Mapping Guidelines](mdc:frontend/docs/pb-records-migration-plan.md):
  - `ID` → `sourceId` (display only; use PB `id` for joins)
  - `Name` → `name`, `Number` → `number`, `RoundNumber` → `roundNumber`, `Valid` → `valid`, etc.

### Quick commands (examples)

```bash
# Find legacy interfaces
rg "extends\s+DbObject" frontend/src

# Find risky sourceId usages
rg "\.sourceId\b" frontend/src
```

## Testing & Verification

- Build and typecheck after each batch of changes to surface field rename issues.
- Validate live behavior by toggling PB Admin values:
  - Pilot/channel/round/event changes reflect without refresh.
  - Race joins continue to work using PB IDs.
- Update unit tests to match PB shapes where necessary.

## Rollout Notes

- Prefer small, incremental edits by feature area (e.g., pilot, race, leaderboard).
- Use minimal adapters only as temporary bridges; remove them promptly.
- Once all consumers in an area are PB-native, delete the corresponding legacy types.

## DO/DON'T Summary

```typescript
// ✅ DO: Use PB IDs for joins and props
function Example({ pilotId, channelId }: { pilotId: string; channelId: string }) { /* ... */ }

// ✅ DO: Use PB record types from pbTypes
import type { PBPilotRecord, PBChannelRecord } from '../api/pbTypes.ts';

// ❌ DON'T: Depend on sourceId for joins or prop contracts
const pilot = pilots.find((p) => p.sourceId === pilotIdFromProps);

// ❌ DON'T: Add new code using interfaces that extend DbObject
interface Pilot extends DbObject { /* ... */ }
```

---

- Related:
  - [pb-records-migration-plan.md](mdc:frontend/docs/pb-records-migration-plan.md)
  - [pocketbase-data-model.md](mdc:frontend/docs/pocketbase-data-model.md)
  - [pocketbase-ingestion-and-api.md](mdc:frontend/docs/pocketbase-ingestion-and-api.md)
