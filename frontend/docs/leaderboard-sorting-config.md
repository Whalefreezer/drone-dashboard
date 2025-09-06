# Leaderboard Sorting Config (Atom-based)

Goal: keep the clarity of the declarative `defaultLeaderboardSortConfig`, but adapt it to the new atom-first design. Instead of sorting
opaque `LeaderboardEntry` objects, the sorter reads data directly from Jotai atoms for a given `pilotId` via an eager `get` function.

## Design Overview

- Sort inputs are pilot IDs (`string[]`).
- The sorter receives a Jotai `get` and reads whatever atoms it needs for each pilot.
- The config remains a tree of groups and criteria, with explicit null handling and direction.
- Conditions and criteria now take `(get, pilotId)` instead of `(entry)`.
- The same config can be reused for current and previous contexts if needed (by switching which atoms the criteria read).

## Types (sketch)

```ts
import type { Getter } from 'jotai';

export enum SortDirection {
	Ascending = 'asc',
	Descending = 'desc',
}
export enum NullHandling {
	First = 'first',
	Last = 'last',
}

export type ValueGetter = (get: Getter, pilotId: string) => number | null;
export type Condition = (get: Getter, pilotId: string) => boolean;

export interface SortCriterion {
	getValue: ValueGetter;
	direction: SortDirection;
	nullHandling: NullHandling;
}

export interface SortGroup {
	name: string;
	criteria: SortCriterion[]; // applied when this group matches
	condition?: Condition; // optional gate
	groups?: SortGroup[]; // sub-groups with more specific rules
}
```

## Helper Value/Condition Functions

Build small helpers that wrap metric atoms to keep the config readable:

```ts
import { pilotBestLapAtom, pilotConsecAtom } from '@/leaderboard/metric-factory';
import {
	pilotEliminatedInfoAtom,
	pilotPreferredChannelAtom,
	pilotRacesUntilNextAtom,
	pilotTotalLapsAtom,
} from '@/leaderboard/leaderboard-atoms';

export const hasConsecutive: Condition = (get, id) => !!get(pilotConsecAtom(id)).current;
export const hasLaps: Condition = (get, id) => (get(pilotTotalLapsAtom(id)).current ?? 0) > 0;
export const isEliminated: Condition = (get, id) => !!get(pilotEliminatedInfoAtom(id));

export const consecutiveTime: ValueGetter = (get, id) => get(pilotConsecAtom(id)).current?.time ?? null;
export const bestLapTime: ValueGetter = (get, id) => get(pilotBestLapAtom(id)).current?.time ?? null;
export const nextRaceDistance: ValueGetter = (get, id) => {
	const v = get(pilotRacesUntilNextAtom(id));
	if (v === -2) return -1000; // racing now → sort above 0
	if (v === -1) return Number.MAX_SAFE_INTEGER; // no upcoming → push to end
	return v;
};
export const channelNumber: ValueGetter = (get, id) => get(pilotPreferredChannelAtom(id))?.number ?? null;
```

You can add other getters, e.g., holeshot time or fastest total race time, as needed by your groups.

## Config Example (atom-based)

This mirrors the previous spirit but queries atoms on demand:

```ts
import { NullHandling, SortDirection, type SortGroup } from './sorting-types';
import { bestLapTime, channelNumber, consecutiveTime, hasConsecutive, hasLaps, isEliminated, nextRaceDistance } from './sorting-helpers';

export const defaultLeaderboardSortConfig: SortGroup[] = [
	{
		name: 'Active Pilots',
		criteria: [],
		groups: [
			{
				name: 'Eliminated Ordering',
				condition: isEliminated,
				criteria: [
					// Example: if you rank eliminated pilots specially within Active
				],
			},
			{
				name: 'Pilots with Laps',
				condition: hasLaps,
				criteria: [],
				groups: [
					{
						name: 'With Consecutive',
						condition: hasConsecutive,
						criteria: [
							{ getValue: consecutiveTime, direction: SortDirection.Ascending, nullHandling: NullHandling.Last },
						],
					},
					{
						name: 'Without Consecutive',
						condition: (get, id) => !hasConsecutive(get, id),
						criteria: [
							{ getValue: bestLapTime, direction: SortDirection.Ascending, nullHandling: NullHandling.Last },
						],
					},
				],
			},
			{
				name: 'No Laps Yet',
				condition: (get, id) => !hasLaps(get, id),
				criteria: [
					{ getValue: nextRaceDistance, direction: SortDirection.Ascending, nullHandling: NullHandling.Last },
					{ getValue: channelNumber, direction: SortDirection.Ascending, nullHandling: NullHandling.Last },
				],
			},
		],
	},
	{
		name: 'Fallback',
		criteria: [
			{ getValue: nextRaceDistance, direction: SortDirection.Ascending, nullHandling: NullHandling.Last },
			{ getValue: channelNumber, direction: SortDirection.Ascending, nullHandling: NullHandling.Last },
		],
	},
];
```

This config is illustrative; tailor groups/criteria to match your old semantics exactly.

## Sorting Engine (IDs → IDs)

Implement a pure sorter that walks the config for each pilot and returns an array of criteria “keys”, then compares:

```ts
export function sortPilotIds(ids: string[], get: Getter, config: SortGroup[]): string[] {
	function groupPath(id: string, groups: SortGroup[]): SortGroup[] {
		const path: SortGroup[] = [];
		function dfs(gs: SortGroup[]): boolean {
			for (const g of gs) {
				if (!g.condition || g.condition(get, id)) {
					path.push(g);
					if (g.groups && g.groups.length > 0) {
						if (dfs(g.groups)) return true;
					}
					return true;
				}
			}
			path.pop();
			return false;
		}
		dfs(groups);
		return path;
	}

	function compare(a: string, b: string): number {
		// Build group path for both
		const pathA = groupPath(a, config);
		const pathB = groupPath(b, config);

		// Compare group order first
		const minDepth = Math.min(pathA.length, pathB.length);
		for (let i = 0; i < minDepth; i++) {
			const parent = i === 0 ? config : (pathA[i - 1]?.groups ?? []);
			const ia = parent.findIndex((g) => g === pathA[i]);
			const ib = parent.findIndex((g) => g === pathB[i]);
			if (ia !== ib) return ia - ib;
		}
		if (pathA.length !== pathB.length) return pathA.length - pathB.length;

		// If same path, apply criteria of the most specific group
		const g = pathA[pathA.length - 1];
		if (!g) return 0;
		for (const c of g.criteria) {
			const va = c.getValue(get, a);
			const vb = c.getValue(get, b);
			if (va == null && vb == null) continue;
			if (va == null) return c.nullHandling === NullHandling.First ? -1 : 1;
			if (vb == null) return c.nullHandling === NullHandling.First ? 1 : -1;
			const diff = va - vb;
			if (diff !== 0) return c.direction === SortDirection.Ascending ? diff : -diff;
		}
		return 0;
	}

	return [...ids].sort(compare);
}
```

## Wiring in Atoms

`leaderboardPilotIdsAtom` can switch to:

```ts
import { eagerAtom } from 'jotai-eager';
import { currentRaceIdsAtom } from '@/leaderboard/leaderboard-atoms';
import { racePilotChannelsAtom } from '@/race/race-atoms';
import { defaultLeaderboardSortConfig } from '@/leaderboard/leaderboard-logic-new';
import { sortPilotIds } from '@/leaderboard/leaderboard-sorter';

export const leaderboardPilotIdsAtom = eagerAtom((get) => {
	const idSet = new Set<string>();
	get(currentRaceIdsAtom).forEach((rid) => {
		get(racePilotChannelsAtom(rid)).forEach((pc) => idSet.add(pc.pilotId));
	});
	const ids = Array.from(idSet);
	return sortPilotIds(ids, get, defaultLeaderboardSortConfig);
});
```

You can define separate configs for “previous” by pointing value getters at `.previous` values from the metric atoms if needed.

## Migration Plan

1. Port the old config to the new signatures (get + pilotId), using small atom-backed getters and conditions.
2. Implement `sortPilotIds` (pure, no state) and replace custom sorts in `leaderboardPilotIdsAtom` and `previousLeaderboardPilotIdsAtom`.
3. Remove the old `leaderboard-logic.ts` once the config parity is verified.
4. Add unit tests for the sorter + config with mocked getters that return synthetic metric values.

## Benefits

- Keeps the declarative clarity of the old config.
- Avoids heavyweight entry objects; reads atoms lazily per pilot.
- Reusable across contexts (current vs previous) by swapping which metric values you read inside getters.
