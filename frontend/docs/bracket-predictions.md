# Bracket Prediction Integration

This document explains the current prediction system for the double-elimination bracket and how to extend it. Follow these steps exactly—do
not assume additional wiring exists.

## Data Flow Overview

1. `frontend/src/bracket/eliminationState.ts` computes the bracket view-model via `bracketDiagramAtom`.
2. Active bracket format + anchors are read from `client_kv` with `namespace=bracket`, `key=eliminationConfig`.
3. `formatId` selects the bracket definition (for example `double-elim-6p-v1` or `nzo-top24-de-v1`), `anchors` map race order to bracket
   order, and optional `runSequence` maps multiple Trackside heats to one logical bracket race.
4. After nodes load real race data, `applyPredictedAssignments` injects prediction slots. A prediction is created when:
   - The source node’s status is `completed`.
   - The slot has a `pilotId`.
   - The bracket edge type determines whether to advance winners (`isWinner`) or eliminated pilots (`isEliminated`).
5. Predicted slots get the `isPredicted` flag, empty channel, no finish position, and a synthetic `id`. Real slots keep their live data.
6. `raceBracketSlotsAtom` exposes the resolved slot list for any race (actual or predicted) so UI components reuse a single source of truth.
7. For multi-heat nodes, slots now expose `heatPoints[]` and `totalPoints` using elimination scoring (`10,7,4,3,2,1` for positions `1..6`).

## Slot Shape

All consumers must respect these fields:

- `pilotId`: may be `null` for open spots; never assume it exists.
- `channelLabel` and `channelId`: real races retain the assigned channel; predictions default to `'—'` and `null`.
- `isPredicted`: drives the visual treatment; check it before rendering as “final”.
- `position`: only set for confirmed race results; predictions leave it `null`.

## Styling Contract

Components must use the `data-predicted='true'` attribute to trigger the lighter color and italic rules:

- Bracket nodes: `frontend/src/bracket/EliminationDiagram.css`.
- Next race cards: `frontend/src/race/NextRaceCompact.css`.

Do **not** reimplement styles per component—extend the existing selectors instead.

## Adding Predictions to a Component

1. Import `raceBracketSlotsAtom` when you need slots keyed by `raceId`.
2. Read both the live pilot/channel data and the bracket slots. Fallback to the live data only if every bracket slot is empty.
3. Render slot rows in order:
   - Use the predicted slot’s `name`.
   - Keep channel UI hidden when `channelId` is `null`.
   - Apply `data-predicted` on the container element.
4. Avoid mutations. Clone data if you need to merge predictions with existing arrays.

### Example: `NextRaceCompact`

Upgrades in `frontend/src/race/NextRaceCompact.tsx` follow this pattern:

```ts
const bracketSlots = useAtomValue(raceBracketSlotsAtom(entry.raceId));
const filtered = bracketSlots.filter((slot) => slot.pilotId != null);
const slots = filtered.length > 0 ? filtered : fallbackFromPilotChannels();
```

Then each `slot` drives the markup, adding `data-predicted` so CSS handles the look.

## Testing Expectations

- Unit: `frontend/src/bracket/eliminationState.test.ts` verifies `applyPredictedAssignments`. Extend this test when changing prediction
  rules.
- Integration: Run `deno task -c e2e/deno.json preflight` for lint/format/check coverage after any prediction-related change.

## Extending the System

### Current Race View

When wiring predictions into `LapsView` or other current-race displays:

1. Pull `raceBracketSlotsAtom(raceId)` in addition to the per-race atoms already used.
2. Keep lap timing tables sourced exclusively from live telemetry (`raceProcessedLapsAtom`, etc.); predictions should surface alongside, not
   overwrite, real-time data.
3. For the participant header/list:
   - Read `racePilotChannelsAtom(raceId)` to form the canonical order.
   - For each slot, attempt to match a live pilot via `pilotId`. If absent:
     - fallback to the predicted slot returned by `raceBracketSlotsAtom`.
     - add `data-predicted='true'` to the rendered element.
     - render name + italic style, but leave lap counts/time blank (they do not exist yet).
4. Expose a tooltip or subtitle such as “(predicted)” to avoid confusion in broadcast overlays.
5. Gate any mutation calls (e.g., channel reassignment) on `isPredicted === false`; predicted entries are read-only hints.

### Future “Next Races” Without PB Records

To surface predicted nodes even before RaceReady creates them:

1. Inspect `BRACKET_NODES` for entries where `mapping.get(order)` returns `null`.
2. When predicted slots exist for such a node, synthesize a minimal view entry with the `definition` metadata plus a generated
   `predicted-race-${order}` id.
3. Keep `nextRacesAtom` untouched—layer predictions in a derived selector so we never mutate PocketBase data.
4. Feed the proxy `raceId` into `raceBracketSlotsAtom` to reuse the same slot data.

Document any new atoms in this file before landing the change.

#### Implementation Steps to Show Future Races in the UI

1. Use `buildNextRaceEntries` in `frontend/src/race/next-race-entries.ts` to merge live races with predicted nodes pulled from the bracket
   diagram.
2. Expose the result through `nextRaceEntriesAtom` so containers receive `[ { raceId, race, definition, isPredicted } ]`.
3. Update `RacesContainer` to read `nextRaceEntriesAtom` and call `<NextRaceCompact entry={entry} />`.
4. Inside `NextRaceCompact`, rely on `entry.definition` when `entry.race` is null, and set `data-predicted-race` for styling.
5. Keep the base atoms immutable; prediction entries exist only in the derived view layer.

## Worked Example: Filling Predictions into Current Race

1. **Read prediction data**
   ```ts
   const bracketSlots = useAtomValue(raceBracketSlotsAtom(raceId));
   const predictedByPilot = new Map(bracketSlots.filter((slot) => slot.isPredicted && slot.pilotId).map((slot) => [slot.pilotId!, slot]));
   ```
2. **Augment participant list**
   ```ts
   const entries = pilotChannels.map((pc) => {
   	const pilot = pilots.find((p) => p.id === pc.pilotId);
   	return {
   		pilot,
   		channelId: pc.channelId,
   		isPredicted: false,
   	};
   });
   const missing = bracketSlots.filter((slot) =>
   	slot.isPredicted && slot.pilotId && !entries.some((entry) => entry.pilot?.id === slot.pilotId)
   );
   entries.push(...missing.map((slot) => ({
   	pilot: { id: slot.pilotId, name: slot.name },
   	channelId: slot.channelId,
   	isPredicted: true,
   })));
   ```
3. **Render with style**
   ```tsx
   {
   	entries.map((entry) => (
   		<li key={entry.id} data-predicted={entry.isPredicted ? 'true' : 'false'}>
   			{entry.pilot?.name ?? 'Awaiting assignment'}
   		</li>
   	));
   }
   ```
4. **Leave timing tables untouched**—they rely on actual race participants only.

## Worked Example: Showing Future Races in Next Races

1. **Build the derived list**
   ```ts
   export const nextRaceEntriesAtom = atom((get) => {
   	const next = get(nextRacesAtom);
   	const diagram = get(bracketDiagramAtom);
   	const currentOrder = get(currentOrderKVAtom)?.order ?? 0;
   	return buildNextRaceEntries(next, diagram, currentOrder);
   });
   ```
2. **Update the container**
   ```tsx
   const nextRaces = useAtomValue(nextRaceEntriesAtom);
   ```
3. **Style predicted races**\
   In `NextRaceCompact`, add:
   ```tsx
   <div className='next-race-card' data-predicted-race={entry.isPredicted ? 'true' : 'false'}>
   ```
4. **CSS hint**\
   Add rules in `NextRaceCompact.css`:
   ```css
   .next-race-card[data-predicted-race='true'] {
   	border-style: dashed;
   	opacity: 0.85;
   }
   ```
5. **Testing**
   - Extend `eliminationState.test.ts` to cover synthetic race creation.
   - Snapshot predicted card rendering in any relevant frontend tests/stories.

## Change Management Checklist

- Update this document whenever you alter prediction rules or introduce new consumers.
- Run `deno fmt` before committing—markdown linting rides along.
- Mention prediction impacts in PR descriptions so reviewers know to regression-test both Brackets and Next Race views.

With these steps another agent can safely extend or reuse the prediction system without guessing at implicit behavior.***
