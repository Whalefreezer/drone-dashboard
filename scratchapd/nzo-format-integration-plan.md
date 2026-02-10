# NZO + Existing Bracket Format Integration Plan

## Goal
Support two elimination formats in the app:
- Existing format (`double-elim-6p-v1`)
- New NZO format (`nzo-top24-de-v1`)

Constraint:
- Exactly **one** bracket format can be active per event at a time.

## Current State (What Exists Today)
- Bracket logic is hard-wired to a single format in `frontend/src/bracket/eliminationState.ts`.
- Static definition imports are tied to `frontend/src/bracket/doubleElimDefinition.ts` -> `frontend/src/bracket/definitions/double-elim.json`.
- Bracket enablement is inferred from presence of KV record:
	- `namespace=bracket`
	- `key=doubleElimAnchors`
- Admin bracket UI (`frontend/src/admin/kv/BracketAnchorsSection.tsx`) is also hard-wired to that same key and bracket ID.
- Slot counts are effectively fixed to 6 in elimination state (`while (slots.length < 6)` and empty slot creation).

## Target Design

### 1) Event-Level Active Format Record
Use one canonical per-event config record in `client_kv`:
- `namespace=bracket`
- `key=eliminationConfig`
- `value` JSON:

```json
{
	"formatId": "double-elim-6p-v1",
	"anchors": [
		{ "bracketOrder": 1, "raceOrder": 120 }
	],
	"notes": "optional"
}
```

Rules:
- `formatId` is required.
- Only one `eliminationConfig` record per event.
- `bracketEnabled` becomes `true` when valid `eliminationConfig` exists.
- No format-specific enable keys.

### 2) Format Registry
Add a registry so bracket code is format-driven, not hard-coded.

Proposed files:
- `frontend/src/bracket/formats/types.ts`
- `frontend/src/bracket/formats/registry.ts`
- `frontend/src/bracket/formats/double-elim-6p-v1.ts`
- `frontend/src/bracket/formats/nzo-top24-de-v1.ts`

Each format definition should provide:
- `id`
- `label`
- `nodes`
- `rounds`
- `edges`
- `diagramDimensions`
- `minSlots` and/or per-node `slotCount`
- optional finals metadata (if used later)

### 3) Generic Bracket State
Refactor `eliminationState.ts` to resolve definitions from `formatId`.

Core changes:
- Replace imports of `BRACKET_NODES/ROUNDS/EDGES` with `activeFormatDefinitionAtom`.
- Parse `eliminationConfig` instead of `doubleElimAnchors`.
- Update mapping and prediction functions to accept active format nodes/edges.
- Remove fixed `6` slot assumption.

Implementation direction:
- Add `slotCount` to node definition schema.
- For legacy format, set `slotCount: 6` on every node.
- For NZO, set early rounds to `slotCount: 4`, later races to `slotCount: 6`.

### 4) Admin UX for Single Active Format
Update `BracketAnchorsSection` to edit one event-scoped config.

UI behavior:
- Format selector (dropdown): Existing format or NZO format.
- One shared anchor editor bound to selected format.
- Preview mapping rendered from currently selected format definition.
- Save writes only `eliminationConfig`.
- Changing format replaces prior active format for that event (single active format enforced).

### 5) NZO Format Definition
Add new JSON definition:
- `frontend/src/bracket/definitions/nzo-top24-de-v1.json`

It should encode:
- Race progression/order mapping for R1-R19 per your provided bracket.
- Correct winners/drop routes.
- 3-heat operational note is scheduling behavior, not node topology.

Important:
- Heat count should remain race data-driven (existing race records/results).
- Do not duplicate heat logic in bracket topology; bracket topology should represent progression only.

## Migration Plan (No Long-Term Compat Shim)

### One-Time Migration
Perform a one-time data migration to move existing events from:
- `key=doubleElimAnchors`

To:
- `key=eliminationConfig`
- `formatId="double-elim-6p-v1"`
- same anchors payload

Then delete old `doubleElimAnchors` records.

Why this matches repo rule:
- Keeps support for existing format.
- Avoids permanent back-compat branching/shims.

## Testing Plan

### Unit Tests
Update/add tests in:
- `frontend/src/bracket/eliminationState.test.ts`

Cover:
- Config parsing for `eliminationConfig`.
- Active format resolution.
- Mapping behavior with anchors for each format.
- Prediction flow with variable `slotCount` nodes.

### UI/Integration
- `frontend/src/admin/kv/BracketAnchorsSection.tsx` tests for format switching and save payload.
- `frontend/src/race/next-race-entries.test.ts` for predicted race entries under both formats.

### Repo Verification
- Run `deno task -c e2e/deno.json preflight`.

## File-Level Change List
- `frontend/src/bracket/eliminationState.ts`
- `frontend/src/bracket/doubleElimDefinition.ts` (or replaced by format registry access)
- `frontend/src/bracket/definitions/double-elim.json` (add `slotCount` if needed)
- `frontend/src/bracket/definitions/nzo-top24-de-v1.json` (new)
- `frontend/src/admin/kv/BracketAnchorsSection.tsx`
- `frontend/src/bracket/eliminationState.test.ts`
- `frontend/src/race/next-race-entries.test.ts` (if behavior differs)
- Optional migration script under `scripts/` or admin tool path

## Acceptance Criteria
- Existing format still works when `formatId=double-elim-6p-v1`.
- NZO bracket works when `formatId=nzo-top24-de-v1`.
- Exactly one active format per event, represented by one `eliminationConfig` KV record.
- Anchor mapping and predictions operate correctly for both formats.
- No dependency on legacy `doubleElimAnchors` key after migration.
