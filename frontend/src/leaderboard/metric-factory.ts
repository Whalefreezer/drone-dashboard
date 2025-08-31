import { eagerAtom } from 'jotai-eager';
import { atomFamily } from 'jotai/utils';
import { raceProcessedLapsAtom, consecutiveLapsAtom } from '../state/pbAtoms.ts';
import { currentRaceIdsAtom, previousRaceIdsAtom } from './leaderboard-context-atoms.ts';
import { raceDataAtom } from '../race/race-atoms.ts';
import type { ProcessedLap } from '../state/atoms.ts';
import { Atom } from 'jotai';

// Reduce a stream of T to a single T (e.g., pick best by time, or accumulate a sum)
export type Fold<T> = (acc: T | null, value: T) => T; // acc=null for first

// Common fold helpers
export const minBy = <T>(sel: (t: T) => number): Fold<T> =>(acc, v) => (acc == null || sel(v) < sel(acc) ? v : (acc as T));
export const maxBy = <T>(sel: (t: T) => number): Fold<T> =>(acc, v) => (acc == null || sel(v) > sel(acc) ? v : (acc as T));
export const sum: Fold<number> = (acc, v) => (acc == null ? v : acc + v);
export const minFoldTime: Fold<{ time: number }> = (acc, v) =>(acc == null || v.time < acc.time ? v : acc);

// Optional finalize to post-process the folded value
export type Finalize<T, R = T> = (value: T | null) => R | null;

// Input laps for a given pilot and raceId → a metric value (or null if not present)
export type PerRaceSelector<T> = (args: {
    get: EagerGetter;
    laps: ProcessedLap[]; // already filtered for pilotId
    raceId: string;
    pilotId: string;
}) => T | null;

export interface MakePilotMetricOptions<T, R = T> {
    key: string; // metric id for debugging
    selectPerRace: PerRaceSelector<T>;
    fold: Fold<T>; // how to combine per-race values into one
    finalize?: Finalize<T, R>; // optional post-processing
}
type EagerGetter = <Value>(atom: Atom<Value>) => Awaited<Value>;

// Returns: atomFamily(pilotId) => { current: R | null; previous: R | null }
export function makePilotMetricAtom<T, R = T>({ key, selectPerRace, fold, finalize }: MakePilotMetricOptions<T, R>) {
    function foldForIds(get: EagerGetter, pilotId: string, ids: string[]): R | null {
        let acc: T | null = null;
        for (const rid of ids) {
            const allLaps = get(raceProcessedLapsAtom(rid));
            const pilotLaps = allLaps.filter((l: ProcessedLap) => l.pilotId === pilotId);
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

// ===== Metric atoms built via the factory =====

// 1) Fastest Consecutive (min time)
export type ConsecMetric = { time: number; raceId: string; startLap: number };
export const pilotConsecAtom = makePilotMetricAtom<ConsecMetric, ConsecMetric>({
    key: 'fastestConsec',
    selectPerRace: ({ get, laps, raceId }) => {
        const n = get(consecutiveLapsAtom);
        const racing = laps.filter((l) => !l.isHoleshot);
        if (n <= 0 || racing.length < n) return null;
        let best: { time: number; startLap: number } | null = null;
        for (let i = 0; i <= racing.length - n; i++) {
            const time = racing.slice(i, i + n).reduce((s, l) => s + l.lengthSeconds, 0);
            if (!best || time < best.time) best = { time, startLap: racing[i].lapNumber };
        }
        return best ? { time: best.time, raceId, startLap: best.startLap } : null;
    },
    fold: minBy((x) => x.time),
});

// 2) Best Lap (min time)
export type BestLapMetric = { time: number; raceId: string; lapNumber: number };
export const pilotBestLapAtom = makePilotMetricAtom<BestLapMetric, BestLapMetric>({
    key: 'bestLap',
    selectPerRace: ({ laps, raceId }) => {
        const racing = laps.filter((l) => !l.isHoleshot);
        if (racing.length === 0) return null;
        const fastest = racing.reduce((f, l) => (l.lengthSeconds < f.lengthSeconds ? l : f));
        return { time: fastest.lengthSeconds, raceId, lapNumber: fastest.lapNumber };
    },
    fold: minBy((x) => x.time),
});

// 3) Fastest Total Race (holeshot + N laps)
export type TotalRaceMetric = { time: number; raceId: string; lapCount: number };
export const pilotFastestTotalRaceAtom = makePilotMetricAtom<TotalRaceMetric, TotalRaceMetric>({
    key: 'fastestTotalRace',
    selectPerRace: ({ get, laps, raceId }) => {
        const race = get(raceDataAtom(raceId));
        const n = (race?.targetLaps ?? 0);
        const hs = laps.find((l) => l.isHoleshot);
        const r = laps.filter((l) => !l.isHoleshot);
        if (!hs || n <= 0 || r.length < n) return null;
        const time = hs.lengthSeconds + r.slice(0, n).reduce((s, l) => s + l.lengthSeconds, 0);
        return { time, raceId, lapCount: n };
    },
    fold: minBy((x) => x.time),
});

// 4) Holeshot (min time)
export type HoleshotMetric = { time: number; raceId: string };
export const pilotHoleshotAtom = makePilotMetricAtom<HoleshotMetric, HoleshotMetric>({
    key: 'holeshot',
    selectPerRace: ({ laps, raceId }) => {
        const hs = laps.find((l) => l.isHoleshot);
        return hs ? { time: hs.lengthSeconds, raceId } : null;
    },
    fold: minBy((x) => x.time),
});

// 5) Total Laps (sum, current-only for display by consumers)
export const pilotTotalLapsAtom = makePilotMetricAtom<number, number>({
    key: 'totalLaps',
    selectPerRace: ({ laps }) => laps.filter((l) => !l.isHoleshot).length,
    fold: sum,
    finalize: (v) => (v ?? 0),
});
