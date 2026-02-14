# NZO: Required Changes To Make 3-Heat Bracket + Predicted Future Races Work

## Goal
Make NZO elimination behavior correct when:

- one logical bracket race maps to 3 Trackside race records (heats),
- upcoming/predicted races can be shown before Trackside creates those records,
- event call order is operationally defined in advance.

## Intended Behavior (Source of Truth)

- Mains progression is logical bracket races `R1..R18`.
- Each mains bracket race runs as `3` heats in Trackside.
- Therefore mains execution is `54` Trackside race records (`18 x 3`).
- Bracket progression/predictions are based on logical bracket outcomes, not raw heat record IDs.
- UI may show synthetic upcoming entries for future bracket nodes when no Trackside record exists yet.

## Operational Run Sequence (Known In Advance)

Use this sequence as the assignment plan for mains heat calls:

- `1,2,3` then `1,2,3` then `1,2,3`
- `4,5,6` then `4,5,6` then `4,5,6`
- `7,8,9` then `7,8,9` then `7,8,9`
- `10,11` then `12,10` then `11,12`
- `13,14,15` then `13,14,15`
- `16,17` then `16,17` then `16,17`
- `18,18,18`

This sequence is the key input. We should not require pre-known `raceSourceId` per heat.

## Current Gaps In Code

1. `frontend/src/bracket/eliminationState.ts` mapping is effectively `1 bracket node -> 1 race record`.
2. `frontend/src/race/next-race-entries.ts` gates predictions with `node.definition.order > currentOrder`, where `currentOrder` is physical Trackside order.
3. Predicted entries are sorted by bracket order, not by operational run sequence.
4. No runtime assignment model exists to bind incoming heat records to bracket race numbers using the known sequence.

## Required Changes

### 1) Replace Pre-Binding With Sequence-Derived Runtime Assignment
Do not require admin to pre-map `raceSourceId` values.

Required model:

- Store an event `runSequence` of bracket race numbers (the list above flattened).
- As new Trackside race records appear in physical order, assign each to the next sequence item.
- Result: each Trackside record gets a derived `logicalBracketOrder`.

Optional recovery feature:

- keep manual anchor overrides for correction/re-sync only, not as primary setup.

### 2) Keep Physical Order And Logical Order Separate
Track both values explicitly:

- `physicalCurrentOrder`: current Trackside heat index/order.
- `logicalCurrentBracketOrder`: current resolved bracket race in sequence terms.

Prediction gating and upcoming logic must use logical state.

### 3) Update Bracket Node Resolution For Multi-Heat Nodes
Refactor `frontend/src/bracket/eliminationState.ts` so each node can consume all assigned heats for its bracket order.

Required behavior:

- node status reflects grouped heats,
- advancement uses node-level aggregate/final outcome,
- no arbitrary "first matching race" behavior.

### 3.1) Update Bracket Viewer For Multi-Heat Race Details
Update bracket UI/view-model so each bracket race can show heat-by-heat scoring and totals.

Required behavior in bracket viewer:

- show each assigned heat for the bracket race (`H1`, `H2`, `H3`),
- for each pilot, show points earned in each heat,
- show cumulative points sum across completed heats for that bracket race,
- keep standings stable when some heats are incomplete (missing heats display as pending/blank).

Points model (must be applied consistently in UI and tests):

- `1st = 10`
- `2nd = 7`
- `3rd = 4`
- `4th = 3`
- `5th = 2`
- `6th = 1`

Implementation impact:

- extend bracket slot/view types to carry `heatPoints[]` and `totalPoints`,
- add deterministic sorting/tie handling rules for display when totals are equal,
- ensure prediction rows remain clearly marked and do not display fake points.

### 4) Make Predicted Next Races Sequence-Aware
Update `frontend/src/race/next-race-entries.ts` to order/gate predicted races by remaining items in `runSequence`, not simple numeric bracket order.

### 5) Preserve Synthetic Future Races As View-Layer Only
Keep `predicted-race-<order>` entries UI-only:

- never persisted to Trackside/PocketBase,
- never treated as confirmed results,
- mutation actions remain disabled.

### 6) Admin UX: Configure Sequence, Not Heat IDs
Update `frontend/src/admin/kv/BracketAnchorsSection.tsx` (or successor) so operators can:

- select format,
- edit/validate `runSequence`,
- preview derived heat-to-bracket assignment behavior,
- apply optional override anchors only when needed.

### 7) Backend/State Publication
`backend/scheduler/race.go` currently publishes physical `race/currentOrder`.

Required additions:

- publish derived logical progression based on sequence assignment,
- or publish enough assignment metadata for frontend to derive it deterministically.

## Testing Required

### Unit

- `frontend/src/bracket/eliminationState.test.ts`: grouped heat mapping + node outcome aggregation.
- `frontend/src/race/next-race-entries.test.ts`: sequence-driven prediction order and gating.
- bracket viewer tests: per-heat points mapping + cumulative sum rendering.

### Integration

- fixture where 54 Trackside races arrive over time,
- verify assignment follows run sequence,
- verify predicted entries appear before real records and are replaced correctly.

### Repo Verification

- run `deno task -c e2e/deno.json preflight` after code changes.

## File-Level Impact (Expected)

- `frontend/src/bracket/eliminationState.ts`
- `frontend/src/bracket/eliminationState.test.ts`
- `frontend/src/bracket/BracketView.tsx`
- bracket UI modules/CSS used to render node details (for heat columns + totals)
- `frontend/src/race/next-race-entries.ts`
- `frontend/src/race/next-race-entries.test.ts`
- `frontend/src/admin/kv/BracketAnchorsSection.tsx`
- `frontend/docs/bracket-predictions.md`
- `backend/scheduler/race.go`
- `docs/ARCHITECTURE.md`

## Acceptance Criteria

1. NZO mains works with 18 logical bracket races represented by 54 Trackside heat records without pre-known `raceSourceId` mappings.
2. Incoming heats are assigned to bracket races from the configured run sequence.
3. Progression and predictions use logical bracket state, not raw physical heat order.
4. Predicted future races appear in planned sequence order.
5. Synthetic entries remain read-only and never become persistence source-of-truth.
6. Bracket viewer shows per-heat points and cumulative points per pilot using `10,7,4,3,2,1` for positions `1..6`.
