# NZO Race Order Change: Understanding and Required Updates

## Context
Organisers have provided a revised (subject-to-change) race run-order for NZO.

New stated run-order:

- `1,2,3` then `1,2,3` then `1,2,3`
- `4,5,6` then `4,5,6` then `4,5,6`
- `7,8,9` then `7,8,9` then `7,8,9`
- `10,11` then `12,10` then `11,12`
- `13,14,15` then `13,14,15`
- `16,17` then `16,17` then `16,17`
- `18,18,18`
- `19 (finals)`

Flattened sequence:
`1,2,3,1,2,3,1,2,3,4,5,6,4,5,6,4,5,6,7,8,9,7,8,9,7,8,9,10,11,12,10,11,12,13,14,15,13,14,15,16,17,16,17,16,17,18,18,18,19`

## My Understanding
1. Bracket topology (progression dependencies between races 1-19) is still the same NZO top-24 double-elim structure.
2. What changed is race call cadence/operational order, especially from Race 10 onward.
3. The biggest deltas vs our prior draft assumptions are:
- R10-R12: now effectively two passes each in interleaved order, not three simple loops.
- R13-R15: now two passes.
- R16-R17: now three passes.
- R18: now three passes.
4. Total calls implied by this sequence are `49` before completion of finals (`19`).

## What Needs To Change

### 1) Documentation updates (required now)
- Update `scratchapd/nzo-top24-double-elimination-format.md`.
- Replace the old “Round cadence” and “Race-Run Summary” with the new sequence.
- Explicitly mark this as an operational call-order overlay, separate from bracket topology.
- Update `scratchapd/nzo-format-integration-plan.md`.
- Replace any statement that assumes `R10 -> R11 -> R12` repeated three times.
- Add a note that late-stage race cadence is variable and must not be hardcoded as fixed loops.

### 2) Event configuration/process updates (required when running event)
- Ensure admin setup for `eliminationConfig` anchors is validated against the real event race records/source IDs for this revised order.
- Run a dry-run against actual race records to verify bracket nodes 1-19 resolve correctly in preview.

### 3) Code-impact checks (likely required depending on ingest shape)
No immediate topology JSON rewrite is implied if each bracket node still maps to one race result source.

Potential required code changes if ingest/race data represents each pass as separate race records:
- Current mapping is node-centric (`order 1..19`) and assumes one mapped race per node.
- If multiple records now represent one bracket race (for example multiple entries for Race 16/17/18), we will need explicit aggregation or multi-race binding per node.
- In that case, update bracket mapping/prediction logic to consume aggregated outcomes, not a single race record.

## Risk / Open Questions
1. Is “19 (finals)” a single final call, or can finals also run multiple passes/CTA rounds in this event setup?
2. For repeated calls (for example `18,18,18`), is the backend ingest producing:
- one race record with multi-heat internals, or
- multiple race records that share the same bracket race number?
3. Are advancement decisions taken after all passes in a block, or incrementally after each pass?

These answers determine whether this remains a documentation + config update, or becomes a bracket data-model/mapping change.

## Recommended Next Action
Create one short implementation ticket specifically for “NZO repeated-call mapping validation” before finalising production rollout, so we can verify real ingest shape and avoid last-minute bracket mismatches.
