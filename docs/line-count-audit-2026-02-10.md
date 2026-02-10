# Line Count Audit (2026-02-10)

## Method

Counted all git-tracked files and sorted descending by line count.

```bash
git ls-files -z \
  | while IFS= read -r -d '' f; do [ -f "$f" ] || continue; printf '%s\t%s\n' "$(wc -l < "$f")" "$f"; done \
  | sort -nr
```

Snapshot totals:
- Files counted: 280
- Total lines: 57,081

## Largest Files (All Tracked Files)

| Lines | File |
|---:|---|
| 10,623 | `snapshots/test1.json` |
| 5,525 | `snapshots/96-pilots.json` |
| 3,271 | `frontend/public/scenarios/test-1.json` |
| 2,401 | `frontend/deno.lock` |
| 763 | `e2e/generate-snapshot.ts` |
| 691 | `frontend/src/pilot/PilotAnalyticsTab.tsx` |
| 648 | `frontend/src/api/pbCollectionRuntime.ts` |
| 603 | `frontend/src/state/pbAtoms.ts` |
| 568 | `frontend/src/admin/admin.css` |
| 563 | `frontend/src/bracket/doubleElimDefinition.ts` |
| 522 | `backend/main.go` |
| 508 | `frontend/src/routes/admin/tools.tsx` |
| 503 | `frontend/src/pilot/PilotPage.css` |
| 503 | `frontend/src/bracket/EliminationDiagram.tsx` |
| 473 | `.windsurfrules` |

## Largest Source Files (Code-Focused)

Excluded obvious fixture/data/lock artifacts for refactor targeting.

| Lines | File |
|---:|---|
| 763 | `e2e/generate-snapshot.ts` |
| 691 | `frontend/src/pilot/PilotAnalyticsTab.tsx` |
| 648 | `frontend/src/api/pbCollectionRuntime.ts` |
| 603 | `frontend/src/state/pbAtoms.ts` |
| 568 | `frontend/src/admin/admin.css` |
| 563 | `frontend/src/bracket/doubleElimDefinition.ts` |
| 522 | `backend/main.go` |
| 508 | `frontend/src/routes/admin/tools.tsx` |
| 503 | `frontend/src/pilot/PilotPage.css` |
| 503 | `frontend/src/bracket/EliminationDiagram.tsx` |
| 440 | `frontend/src/App.css` |
| 439 | `frontend/src/race/race-atoms.ts` |
| 415 | `frontend/src/admin/kv/LockedEliminationRankingsSection.tsx` |
| 392 | `frontend/src/bracket/eliminationState.ts` |
| 379 | `backend/control/hub.go` |

## Worst Offenders and What To Do

### 1) `frontend/src/state/pbAtoms.ts` (603)
Problem:
- Too many responsibilities in one module: event selection, per-collection subscriptions, and derived race/pilot atoms.
- High coupling makes changes risky and increases rebuild/merge friction.

Actions:
- Split by domain:
  - `state/pb/eventAtoms.ts`
  - `state/pb/subscriptionAtoms.ts`
  - `state/pb/pilotAtoms.ts`
  - `state/pb/raceAtoms.ts`
  - `state/pb/adminAtoms.ts`
- Keep `pbAtoms.ts` as a small export surface (barrel) only.
- Move repeated `atomFamily(...pbSubscribeCollection...)` patterns into a small factory helper.

Target:
- Keep each module under ~250 lines.

### 2) `frontend/src/api/pbCollectionRuntime.ts` (648)
Problem:
- Contains lifecycle management, buffering, backfill/invalidation, event reduction, and listener fanout in one class.
- Hard to test failure/reconnect paths in isolation.

Actions:
- Extract internals into composable units:
  - `collectionRuntimeState.ts` (state model + transitions)
  - `collectionEventReducer.ts` (apply create/update/delete/backfill)
  - `collectionNotifier.ts` (debounced listener + status fanout)
  - `collectionBackfill.ts` (cursor/backfill/invalidate flow)
- Add targeted tests around reducer semantics and reconnect/backfill race conditions.

Target:
- Runtime coordinator under ~250 lines plus focused unit tests for each extracted unit.

### 3) `frontend/src/pilot/PilotAnalyticsTab.tsx` (691)
Problem:
- UI rendering, analytics calculations, chart-slot transforms, overlay toggles, and chart option construction are combined.

Actions:
- Extract compute-heavy logic into hooks:
  - `usePilotLapSeries.ts`
  - `usePilotOverlaySeries.ts`
  - `usePilotChartOptions.ts`
- Keep component focused on state wiring + rendering controls.
- Move formatting helpers (`formatDelta`, seconds labels, not-null guards) to `pilot/analytics-format.ts`.

Target:
- Main component under ~300 lines.

### 4) `backend/main.go` (522)
Problem:
- Entry point currently mixes flag parsing, mode selection, service wiring, route registration, and startup concerns.

Actions:
- Split bootstrap concerns into internal packages:
  - `backend/bootstrap/config` (flags/env/help)
  - `backend/bootstrap/mode` (standalone/cloud/pits wiring)
  - `backend/bootstrap/server` (route registration + static setup)
- Keep `main.go` as orchestration only.

Target:
- `main.go` under ~200 lines.

### 5) `frontend/src/routes/admin/tools.tsx` (508)
Problem:
- Multiple workflows (purge, sync, find unused, delete unused) and repeated pilot-id collection logic in one route component.

Actions:
- Extract reusable helper:
  - `admin/tools/pilotReferenceIndex.ts` (collect IDs from detections/gamePoints/pilotChannels)
- Split UI into feature components/hooks:
  - `usePurgeCacheAction`
  - `useSyncEventPilotsAction`
  - `useUnusedPilotsAction`
- Route file should compose these units and display results.

Target:
- Route component under ~220 lines.

### 6) `frontend/src/bracket/doubleElimDefinition.ts` (563)
Problem:
- Large static bracket definition embedded as TS object literals; difficult to review and maintain.

Actions:
- Move data to `frontend/src/bracket/definitions/double-elim.json`.
- Add schema/type validation and parser on load.
- Keep TS file for types + validation + lookup helpers only.

Target:
- TS logic under ~180 lines; static data in JSON.

## Non-Code Large Files (Different Strategy)

### `snapshots/test1.json`, `snapshots/96-pilots.json`, `frontend/public/scenarios/test-1.json`
Actions:
- Keep only minimal fixtures in-repo; archive larger snapshots outside main tree or use compressed fixtures.
- If full snapshots are required in git history, use Git LFS.
- Add a script to generate test fixtures from a compact source, so large JSON is reproducible.

### `frontend/deno.lock`
Actions:
- Do not refactor for line count; lockfile size is expected.

## Suggested Execution Order

1. Split `pbAtoms.ts` by domain and add barrel exports.
2. Break `pbCollectionRuntime.ts` into reducer/notifier/backfill units with tests.
3. Refactor `PilotAnalyticsTab.tsx` into hooks + chart option builder.
4. Decompose `admin/tools.tsx` by action.
5. Move bracket static definition into JSON + schema validation.
6. Simplify `backend/main.go` bootstrap composition.

## Success Criteria

- No single source file above ~400 lines except explicit static definitions.
- At least 20% line reduction in each top-5 offender file.
- Existing tests pass and behavior remains unchanged.
