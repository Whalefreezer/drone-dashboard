# Admin KV: Leaderboard Split Configuration

This document describes how to add a small, admin‑controlled configuration (stored in PocketBase `client_kv`) that instructs all clients to
draw a visible divider in the main leaderboard after a given position.

## Goal

- Let admin set a split index (e.g., `8`) so the main leaderboard visually separates positions `1..8` from `9..N`.
- Configuration lives in `client_kv` so every client updates live via subscriptions.
- Non‑destructive: if unset or invalid, no divider is shown.

## Storage Contract (client_kv)

- `namespace`: `"leaderboard"`
- `key`: `"splitIndex"`
- `value`: JSON number (e.g., `8`); nullable/absent → disabled
- `event`: set to current event id (so it’s event‑scoped)
- `expiresAt`: optional; not required here

Example record

```json
{
	"namespace": "leaderboard",
	"key": "splitIndex",
	"value": "8", // JSON-encoded number
	"event": "<current_event_id>"
}
```

Notes

- Use a JSON number so `JSON.parse` yields a `number`. We’ll coerce to a positive integer in the client.
- Semantics:
  - `null`, `undefined`, empty `value`, or non‑positive number → no split line.
  - `value` greater than rows → no visible effect (falls off the bottom).

## Client Read Atom

Add a focused atom in `pbAtoms.ts` to expose the current split index.

```ts
// pbAtoms.ts (near other focused atoms)
export const leaderboardSplitAtom = eagerAtom((get) => {
	const ev = get(currentEventAtom);
	if (!ev) return null as number | null;
	const kv = get(clientKVRecordsAtom);
	const rec = kv.find(
		(r) => r.namespace === 'leaderboard' && r.key === 'splitIndex' && r.event === ev.id,
	);
	if (!rec || !rec.value) return null;
	try {
		const raw = JSON.parse(rec.value);
		const n = Number(raw);
		if (!Number.isFinite(n)) return null;
		const v = Math.floor(n);
		return v > 0 ? v : null; // 1-based position; index calculation is handled in UI
	} catch {
		return null;
	}
});
```

## Leaderboard Rendering

Use `GenericTable`’s `getRowClassName` to add a class on the row where the divider should appear above it. If positions are 1‑based, and
`splitIndex=8`, we want the divider between rows 8 and 9 → apply a top border to row at zero‑based index `8`.

```tsx
// Leaderboard.tsx
import { useAtomValue } from 'jotai';
import { leaderboardSplitAtom } from '../state/pbAtoms.ts';

export function Leaderboard() {
	// ...existing code
	const splitIndex = useAtomValue(leaderboardSplitAtom); // number | null (1-based position)

	return (
		<GenericTable
			// ...existing props
			getRowClassName={(_, idx) => {
				if (!splitIndex) return undefined;
				// splitIndex is 1-based position; divider above the row whose idx === splitIndex
				return idx === splitIndex ? 'split-after' : undefined;
			}}
		/>
	);
}
```

Styling (in `Leaderboard.css` or admin table CSS as appropriate):

```css
/* Draw a thicker divider line above the split row */
.leaderboard-table .gt-row.split-after {
	border-top: 2px solid #6b7280; /* slate-500 */
	position: relative;
}
```

If you prefer the line “below the Nth position” strictly on the Nth row, you may instead add a `split-before` class to the row at
`idx === splitIndex - 1` and style with `border-bottom`.

## Admin UI (Client KV)

Add a small editor to the Client KV page to create/update the record:

- Placement: top of `/admin/kv` page above the table.
- Controls: number input (min 0), two buttons: Save / Clear.
- Behavior:
  - Save: upsert a `client_kv` record with the contract above.
  - Clear: delete the record (or set `value` to empty) to disable the divider.
- Validation: coerce to integer; 0 or negative clears/does nothing.

Sketch

```tsx
// kv.tsx (top toolbar section)
function LeaderboardSplitEditor() {
	const [val, setVal] = useState<string>('');
	const ev = useAtomValue(currentEventAtom);
	const kv = useAtomValue(clientKVRecordsAtom);

	const existing = useMemo(() => (
		ev ? kv.find((r) => r.namespace === 'leaderboard' && r.key === 'splitIndex' && r.event === ev.id) ?? null : null
	), [kv, ev]);

	async function save() {
		if (!ev) return;
		const n = Math.max(0, Math.floor(Number(val)));
		const payload = n > 0 ? JSON.stringify(n) : '';
		const col = pb.collection('client_kv');
		if (existing) {
			await col.update(existing.id, { value: payload });
		} else {
			await col.create({ namespace: 'leaderboard', key: 'splitIndex', value: payload, event: ev.id });
		}
	}

	async function clear() {
		if (!existing) return;
		await pb.collection('client_kv').delete(existing.id);
		setVal('');
	}

	// render input + buttons
}
```

Because we subscribe live to `client_kv`, other clients will reflect changes immediately without reloads.

## Edge Cases

- No current event: atom returns `null`; no divider is drawn.
- Invalid JSON or non‑numeric value: atom yields `null` (defensive parse).
- Split greater than row count: no visible effect.
- Live updates during a race: CSS update is cheap; no re‑layout concerns.

## Testing

- Unit: atom parsing and coercion (numbers, strings, invalid JSON, negative values).
- UI: quick manual checks with 0, 1, 8, large number; ensure border appears at expected place.
- Snapshot: ensure no divider when unset.

## Rollout Plan

1. Add `leaderboardSplitAtom` and styling.
2. Add the small editor on `/admin/kv` (create/update/delete the KV record).
3. Verify live propagation across two clients.
4. Optional: display a small tag on the leaderboard header when a split is active (e.g., “Split at 8”).

## Future Extensions

- Multiple splits (e.g., `[8, 16]`): store `value` as JSON array and render multiple dividers.
- Named splits with labels: `{ positions: [8], labels: { 8: 'Top 8' } }`.
- Persist UI presets per event.
- Role‑gated editing and audit trail (PB rules + logs).
