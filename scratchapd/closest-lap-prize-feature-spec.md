# Closest Lap Prize Feature Spec

## Goal
Add a new "Closest Lap Prize" experience that:
- shows a target lap time,
- ranks pilots by ascending absolute difference between their closest valid lap and that target,
- includes which race produced that closest lap,
- appears as a mobile tab,
- is also accessible on desktop,
- is configurable from Admin Client KV,
- is inert by default when unset.

## Research Summary (Current Code)

### Navigation and view switching
- Mobile tabs are controlled by `activePaneAtom` + `ViewSelector`:
	- `frontend/src/state/viewAtoms.ts`
	- `frontend/src/common/ViewSelector.tsx`
- Main pane rendering (mobile + desktop) is in `frontend/src/App.tsx`.
- Desktop right-pane switching currently uses `rightPaneViewAtom` with `leaderboard|brackets`.

### Existing list/grid component
- Shared table/grid primitive is `GenericTable`:
	- `frontend/src/common/GenericTable.tsx`
- Leaderboard already uses this with responsive column prefs:
	- `frontend/src/leaderboard/Leaderboard.tsx`

### Data pipeline for lap metrics
- Valid processed laps per race already exist via:
	- `frontend/src/state/pb/raceAtoms.ts` (`raceProcessedLapsAtom`)
- Reusable metric patterns already exist:
	- `frontend/src/leaderboard/metric-factory.ts`
- Race metadata needed for race label is available through:
	- `frontend/src/race/race-atoms.ts` / `allRacesAtom`
	- `frontend/src/state/pb/subscriptionAtoms.ts` / `raceRecordsAtom`

### Admin KV patterns
- KV admin page and sections:
	- `frontend/src/routes/admin/kv.tsx`
	- `frontend/src/admin/kv/*.tsx`
- Existing simple numeric save/clear flow to mirror:
	- `frontend/src/admin/kv/LeaderboardSplitSection.tsx`
- Existing derived KV parser atoms are in:
	- `frontend/src/state/pb/leaderboardAtoms.ts`

## Proposed Product Behavior

### Feature toggle behavior (required)
- `client_kv` key is unset by default.
- When unset or invalid:
	- do not show new tab/button,
	- do not change existing layout/behavior,
	- no ranking work shown in UI.

### When configured
- Show a new view labeled `Prize` (or `Closest Lap`) with:
	- a prominent target time display,
	- a pretty leaderboard-style table using `GenericTable`,
	- rows sorted by smallest absolute difference to target.

### Row definition
For each pilot with at least one non-holeshot valid lap in the current event:
- `closestLapSeconds`: the lap time minimizing `abs(lap - target)`.
- `deltaSeconds`: `abs(closestLapSeconds - targetSeconds)`.
- `raceId`: the race where that closest lap occurred.
- `raceLabel`: e.g. `R{roundNumber}-{raceNumber}`.

Suggested columns:
1. Rank
2. Pilot
3. Closest Lap
4. Delta (abs)
5. Race

Sort order:
1. `deltaSeconds` ascending
2. `closestLapSeconds` ascending
3. pilot name ascending

## KV Contract
Use `client_kv` record:
- `namespace: 'leaderboard'`
- `key: 'closestLapTargetSeconds'`
- `value: JSON number` (seconds, supports decimals)

Validation:
- must parse to finite positive number
- normalize to 3 decimals for display
- any invalid/empty payload treated as unset

Rationale:
- consistent with current leaderboard KV strategy (`splitIndex`, `nextRaceOverrides`),
- event-scoped config via existing `event` relation.

## UI Integration Plan

### Mobile
- Add pane to `DashboardPane`: `'prize'`.
- Add tab in `ViewSelector` only when target is set.
- Render new view in mobile pane switch in `App.tsx`.

### Desktop
- Extend `RightPaneView` to include `'prize'`.
- Add `Prize` button in right-pane toggle in `App.tsx`.
- Render prize view in right pane when selected.

This keeps access symmetric with existing leaderboard/brackets controls.

## Implementation Blueprint (Files)

1. State/atoms
- Update `frontend/src/state/viewAtoms.ts`
	- add `'prize'` to `DashboardPane`
	- add `'prize'` to `RightPaneView`
- Update `frontend/src/state/pb/leaderboardAtoms.ts`
	- add `closestLapTargetSecondsAtom`
	- add derived `closestLapPrizeRowsAtom`

2. Prize feature UI
- Add folder `frontend/src/prize/`
	- `ClosestLapPrize.tsx`
	- `closest-lap-columns.tsx` (if columns split preferred)
	- optional `ClosestLapPrize.css`
- Use `GenericTable` for rendering.

3. Navigation wiring
- Update `frontend/src/common/ViewSelector.tsx`
	- conditionally include new mobile/desktop selector entry based on target atom
	- guard invalid active pane fallback to `leaderboard` when target becomes unset
- Update `frontend/src/App.tsx`
	- mobile conditional render for prize pane
	- desktop right-pane toggle + render branch

4. Admin KV
- Add `frontend/src/admin/kv/ClosestLapTargetSection.tsx`
	- numeric input, Save, Clear
	- create/update/delete `client_kv` record
- Update `frontend/src/routes/admin/kv.tsx`
	- add new section card

5. Export surface
- `frontend/src/state/pbAtoms.ts` already re-exports `leaderboardAtoms.ts`; no new export file needed.

## Suggested Algorithms

### `closestLapTargetSecondsAtom`
- Find KV record where `namespace==='leaderboard' && key==='closestLapTargetSeconds'`.
- Parse JSON number.
- return `number | null`.

### `closestLapPrizeRowsAtom`
Inputs:
- `closestLapTargetSecondsAtom`
- `raceRecordsAtom`
- `lapRecordsAtom`
- `detectionRecordsAtom`
- `pilotsAtom`
- `roundsDataAtom` (for labels)

Process:
1. If target null => return empty list.
2. Build `detectionById` map, include only valid detections.
3. Walk laps; skip holeshot laps.
4. Resolve pilot and race from detection/lap.
5. For each pilot keep the lap with minimal `abs(lengthSeconds - target)`.
6. Build final rows with display fields and sort using tie-break rules.

## UX Notes for "Pretty Page"
- Reuse leaderboard visual language for consistency.
- Add a top "target badge" with large monospace time.
- Add short explanatory text: "Closest valid non-holeshot lap wins."
- Keep row hover/focus styles aligned with leaderboard table classes.

## Edge Cases
- No target set: no UI change.
- Target set but no valid laps: show empty-state message in prize view.
- Pilot has multiple equally-close laps: pick earliest by race order, then lap number.
- Race record missing for a lap: show race as `-` and keep row.
- Invalid KV payload: treat as unset.

## Test Plan

### Unit
- `closestLapTargetSecondsAtom` parsing:
	- valid number, stringified number, invalid JSON, non-number, <=0.
- `closestLapPrizeRowsAtom`:
	- ignores holeshots,
	- ranks by absolute delta,
	- includes race column,
	- deterministic tie breaks.

### Component
- `ViewSelector` shows/hides `Prize` tab based on target atom.
- `App` renders prize pane correctly on mobile and desktop.

### Integration
- Admin KV save/clear reflects immediately in prize tab visibility.

## Acceptance Criteria
- New prize view is visible on mobile as a tab when target is configured.
- New prize view is reachable on desktop from existing main layout controls.
- Prize table uses `GenericTable`.
- Table contains race column showing source race for each pilot's closest lap.
- When KV target is unset (default), no visible behavior changes anywhere.
- Target is editable/clearable in Admin Client KV page.
