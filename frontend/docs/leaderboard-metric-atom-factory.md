# Leaderboard Metric Atom Factory

This document outlines a pattern to build metric-specific, lazy leaderboard atoms via a small factory — without relying on an intermediate
`racePilotStatsAtom`. The factory works directly from per‑race laps and gives selectors access to Jotai's `get` so they can read whatever
context they need. The aim is to:

- Split by feature (fastest consecutive, best lap, holeshot, fastest total race, total laps) rather than mixing types.
- Avoid a monolithic aggregator and compute only what a column asks for.
- Support “previous vs current” by aggregating over two explicit race ID sets (no snapshotting).

## Core Idea

Provide a factory that, given a metric aggregator, returns a per-pilot atomFamily that exposes `{ current, previous }` values derived from:

- `currentRaceIdsAtom` — all race IDs for the current event (includes current and last completed)
- `previousRaceIdsAtom` — the same list excluding the current and last completed race
- `raceProcessedLapsAtom(raceId)` — raw processed laps per race; the factory’s selector computes a per‑race metric from these laps on
  demand.

Columns read only the atoms they need; unused metrics are never computed.

## Factory API (TypeScript-ish)

```ts
// Input laps for a given pilot and raceId → a metric value (or null if not present)
export type PerRaceSelector<T> = (args: {
    get: <V>(anAtom: any) => V; // jotai get
    laps: ProcessedLap[]; // already filtered for pilotId
    raceId: string;
    pilotId: string;
}) => T | null;

// Reduce a stream of T to a single T (e.g., pick best by time, or accumulate a sum)
export type Fold<T> = (acc: T | null, value: T) => T; // acc=null for first
// Common fold helpers
export const minBy = <T>(sel: (t: T) => number): Fold<T> => (acc, v) => (acc == null || sel(v) < sel(acc) ? v : (acc as T));
export const maxBy = <T>(sel: (t: T) => number): Fold<T> => (acc, v) => (acc == null || sel(v) > sel(acc) ? v : (acc as T));
export const sum: Fold<number> = (acc, v) => (acc == null ? v : acc + v);
export const minFoldTime: Fold<{ time: number }> = (acc, v) => (acc == null || v.time < acc.time ? v : acc);

// Optional finalize to post-process the folded value
export type Finalize<T, R = T> = (value: T | null) => R | null;

export interface MakePilotMetricOptions<T, R = T> {
    key: string; // metric id for debugging
    selectPerRace: PerRaceSelector<T>;
    fold: Fold<T>; // how to combine per-race values into one
    finalize?: Finalize<T, R>; // optional post-processing
}

// Returns: atomFamily(pilotId) => { current: R | null; previous: R | null }
export function makePilotMetricAtom<T, R = T>(
    opts: MakePilotMetricOptions<T, R>,
): AtomFamily<string, { current: R | null; previous: R | null }>;
```

### Semantics

- Laziness: The resulting atomFamily only computes when read by a column or sorting atom.
- Determinism: Given the same `selectPerRace` and `fold`, both current/previous apply identical logic to different race-ID sets.
- Flexibility: `fold` can implement “pick best” (min time), “sum” (total laps), or any feature-specific aggregation.

## Reference Implementation (sketch)

```ts
import { eagerAtom } from 'jotai-eager';
import { atomFamily } from 'jotai/utils';
import { raceProcessedLapsAtom } from '@/state/pbAtoms';
import { currentRaceIdsAtom, previousRaceIdsAtom } from '@/leaderboard/leaderboard-atoms';

// (No metric helpers needed here; selectors compute directly from laps and can read atoms via `get`.)

export function makePilotMetricAtom<T, R = T>({ key, selectPerRace, fold, finalize }: MakePilotMetricOptions<T, R>) {
    function foldForIds(get: any, pilotId: string, ids: string[]): R | null {
        let acc: T | null = null;
        for (const rid of ids) {
            const allLaps = get(raceProcessedLapsAtom(rid));
            const pilotLaps = allLaps.filter((l) => l.pilotId === pilotId);
            const val = selectPerRace({ get, laps: pilotLaps, raceId: rid, pilotId });
            if (val != null) acc = fold(acc, val);
        }
        return (finalize ? finalize(acc) : (acc as unknown as R | null));
    }

    return atomFamily((pilotId: string) =>
        eagerAtom((get) => ({
            current: foldForIds(get, pilotId, get(currentRaceIdsAtom)),
            previous: foldForIds(get, pilotId, get(previousRaceIdsAtom)),
        }))
    );
}
```

## Examples

Assume we already have:

- `currentRaceIdsAtom`, `previousRaceIdsAtom`
- `raceProcessedLapsAtom(raceId)` returning `ProcessedLap[]`

### 1) Fastest Consecutive (min time)

```ts
type Consec = { time: number; raceId: string; startLap: number };

export const pilotConsecAtom = makePilotMetricAtom<Consec, Consec>({
    key: 'fastestConsec',
    selectPerRace: ({ get, laps, raceId }) => {
        const n = get(consecutiveLapsAtom); // from pbAtoms
        const racing = laps.filter((l) => !l.isHoleshot);
        if (n <= 0 || racing.length < n) return null;
        let best: { time: number; startLap: number } | null = null;
        for (let i = 0; i <= racing.length - n; i++) {
            const time = racing.slice(i, i + n).reduce((s, l) => s + l.lengthSeconds, 0);
            if (!best || time < best.time) best = { time, startLap: racing[i].lapNumber };
        }
        return best ? { time: best.time, raceId, startLap: best.startLap } : null;
    },
    fold: (acc, v) => (acc == null || v.time < acc.time ? v : acc),
});
```

### 2) Best Lap (min time)

```ts
type BestLap = { time: number; raceId: string; lapNumber: number };

export const pilotBestLapAtom = makePilotMetricAtom<BestLap, BestLap>({
    key: 'bestLap',
    selectPerRace: ({ laps, raceId }) => {
        const racing = laps.filter((l) => !l.isHoleshot);
        if (racing.length === 0) return null;
        const fastest = racing.reduce((f, l) => (l.lengthSeconds < f.lengthSeconds ? l : f));
        return { time: fastest.lengthSeconds, raceId, lapNumber: fastest.lapNumber };
    },
    fold: (acc, v) => (acc == null || v.time < acc.time ? v : acc),
});
```

### 3) Fastest Total Race (holeshot + N laps)

```ts
type TotalRace = { time: number; raceId: string; lapCount: number };

export const pilotFastestTotalRaceAtom = makePilotMetricAtom<TotalRace, TotalRace>({
    key: 'fastestTotalRace',
    selectPerRace: ({ get, laps, raceId }) => {
        const race = get(raceDataAtom(raceId));
        const n = race?.targetLaps ?? 0;
        const hs = laps.find((l) => l.isHoleshot);
        const r = laps.filter((l) => !l.isHoleshot);
        if (!hs || n <= 0 || r.length < n) return null;
        const time = hs.lengthSeconds + r.slice(0, n).reduce((s, l) => s + l.lengthSeconds, 0);
        return { time, raceId, lapCount: n };
    },
    fold: (acc, v) => (acc == null || v.time < acc.time ? v : acc),
});
```

### 4) Holeshot (min time)

```ts
type Holeshot = { time: number; raceId: string };

export const pilotHoleshotAtom = makePilotMetricAtom<Holeshot, Holeshot>({
    key: 'holeshot',
    selectPerRace: ({ laps, raceId }) => {
        const hs = laps.find((l) => l.isHoleshot);
        return hs ? { time: hs.lengthSeconds, raceId } : null;
    },
    fold: (acc, v) => (acc == null || v.time < acc.time ? v : acc),
});
```

### 5) Total Laps (sum, current-only for display)

```ts
export const pilotTotalLapsAtom = makePilotMetricAtom<number, number>({
    key: 'totalLaps',
    selectPerRace: ({ laps }) => laps.filter((l) => !l.isHoleshot).length,
    fold: (acc, v) => (acc == null ? v : acc + v),
    finalize: (v) => (v ?? 0),
});
// Consumers can ignore `.previous` for this metric and read only `.current`.
```

## Using in Columns

- Position/ordering: `leaderboardPilotIdsAtom` can read only the metrics it needs (e.g., `pilotConsecAtom(pId).current`,
  `pilotBestLapAtom(pId).current`) during sorting.
- Cells: For a row with `pilotId`, a column can do:

```tsx
const { current, previous } = useAtomValue(pilotConsecAtom(pilotId));
const showDiff = current && previous && current.time !== previous.time;
```

- Total laps: `useAtomValue(pilotTotalLapsAtom(pilotId)).current`.

## Performance Notes

- Laps are read from `raceProcessedLapsAtom(rid)`; selectors compute on demand and only for pilots/metrics that are actually read.
- Laziness: Only columns and sorters that read a metric trigger its computation for visible pilots.
- Stability: Tie-breaking is controlled by the `fold` function; if needed, extend with a `compare(a,b)` to keep ordering consistent.

## Testing Strategy

- Unit test each metric’s `selectPerRace` and `fold` with synthetic per-race stats.
- Test the factory end-to-end with small sets of raceIds and pilots to verify current vs previous logic.
- Include tie and missing-data scenarios.

## Migration Plan

1. Land the factory and rewrite the existing metric atoms using it (consec, best lap, holeshot, fastest total race, total laps).
2. Update sorting to consume only the metrics required (via the new atoms) and keep the current ordering semantics.
3. Incrementally switch columns to the new atoms; verify diffs reflect “previous vs current race sets”.
4. Remove any ad-hoc aggregators once all columns are migrated.
