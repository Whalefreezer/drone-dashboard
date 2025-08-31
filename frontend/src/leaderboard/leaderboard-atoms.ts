import { Atom, atom, Getter } from 'jotai';
import { eagerAtom } from 'jotai-eager';
import { atomFamily } from 'jotai/utils';
import { allRacesAtom, currentRaceAtom, lastCompletedRaceAtom, racePilotChannelsAtom } from '../race/race-atoms.ts';
import { channelsDataAtom, bracketsDataAtom, pilotsAtom } from '../state/pbAtoms.ts';
import type { PBChannelRecord, PBRaceRecord } from '../api/pbTypes.ts';
import { pilotConsecAtom, pilotBestLapAtom } from './metric-factory.ts';

// Race ID sets
export const currentRaceIdsAtom = eagerAtom((get): string[] => {
    const races = get(allRacesAtom);
    return races.map((r) => r.id);
});

export const previousRaceIdsAtom = eagerAtom((get): string[] => {
    const ids = get(currentRaceIdsAtom);
    const current = get(currentRaceAtom)?.id;
    const lastCompleted = get(lastCompletedRaceAtom)?.id;
    return ids.filter((id) => id !== current && id !== lastCompleted);
});


// Scheduling/context atoms
export const pilotRacesUntilNextAtom = atomFamily((pilotId: string) =>
    eagerAtom((get): number => {
        const races = get(allRacesAtom);
        // Find current race index
        const current = get(currentRaceAtom);
        const currentIndex = current ? races.findIndex((r) => r.id === current.id) : -1;
        if (currentIndex === -1) return -1;
        // In current?
        const inCurrent = get(racePilotChannelsAtom(races[currentIndex].id)).some((pc) => pc.pilotId === pilotId);
        if (inCurrent) return -2;
        // Search forward
        let count = 0;
        for (let i = currentIndex + 1; i < races.length; i++) {
            const pcs = get(racePilotChannelsAtom(races[i].id));
            if (pcs.some((pc) => pc.pilotId === pilotId)) return count;
            count++;
        }
        return -1;
    })
);

export const pilotPreferredChannelAtom = atomFamily((pilotId: string) =>
    eagerAtom((get): PBChannelRecord | null => {
        const races = get(allRacesAtom);
        const channels = get(channelsDataAtom);
        const current = get(currentRaceAtom);
        const currentIndex = current ? races.findIndex((r) => r.id === current.id) : 0;
        const order: PBRaceRecord[] = [
            ...races.slice(currentIndex),
            ...races.slice(0, currentIndex).reverse(),
        ];
        for (const race of order) {
            const pcs = get(racePilotChannelsAtom(race.id));
            const pc = pcs.find((p) => p.pilotId === pilotId);
            if (pc) {
                return channels.find((c) => c.id === pc.channelId) ?? null;
            }
        }
        return null;
    })
);

export const pilotEliminatedInfoAtom = atomFamily((pilotId: string) =>
    eagerAtom((get) => {
        const brackets = get(bracketsDataAtom)?.data ?? [];
        const pilots = get(pilotsAtom);
        const pilot = pilots.find((p) => p.id === pilotId);
        if (!pilot) return null;
        const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '');
        for (const bracket of brackets) {
            const match = bracket.pilots.find((bp: any) => norm(bp.name) === norm(pilot.name));
            if (match) return { bracket: bracket.name, position: 0, points: match.points };
        }
        return null;
    })
);

type EagerGetter = <Value>(atom: Atom<Value>) => Awaited<Value>;

// Sorting helpers and IDs
function channelNumberOf(get: EagerGetter, pilotId: string): number {
    const ch = get(pilotPreferredChannelAtom(pilotId));
    return ch?.number ?? Number.MAX_SAFE_INTEGER;
}

export const leaderboardPilotIdsAtom = eagerAtom((get): string[] => {
    // Candidates: union of scheduled pilots across current race IDs
    const rids = get(currentRaceIdsAtom);
    const idSet = new Set<string>();
    rids.forEach((rid) => {
        const pcs = get(racePilotChannelsAtom(rid));
        pcs.forEach((pc) => idSet.add(pc.pilotId));
    });
    const ids = Array.from(idSet);

    // Sort by: fastest consecutive (current) → best lap (current) → racesUntilNext → channel
    return ids.sort((a, b) => {
        const aCon = get(pilotConsecAtom(a)).current?.time ?? Number.POSITIVE_INFINITY;
        const bCon = get(pilotConsecAtom(b)).current?.time ?? Number.POSITIVE_INFINITY;
        if (aCon !== bCon) return aCon - bCon;

        const aLap = get(pilotBestLapAtom(a)).current?.time ?? Number.POSITIVE_INFINITY;
        const bLap = get(pilotBestLapAtom(b)).current?.time ?? Number.POSITIVE_INFINITY;
        if (aLap !== bLap) return aLap - bLap;

        const aNext = get(pilotRacesUntilNextAtom(a));
        const bNext = get(pilotRacesUntilNextAtom(b));
        const normalizeNext = (n: number) => (n === -2 ? -1000 : n === -1 ? Number.MAX_SAFE_INTEGER : n);
        const aNN = normalizeNext(aNext);
        const bNN = normalizeNext(bNext);
        if (aNN !== bNN) return aNN - bNN;

        const aCh = channelNumberOf(get, a);
        const bCh = channelNumberOf(get, b);
        return aCh - bCh;
    });
});

export const previousLeaderboardPilotIdsAtom = eagerAtom((get): string[] => {
    const rids = get(previousRaceIdsAtom);
    const idSet = new Set<string>();
    rids.forEach((rid) => {
        const pcs = get(racePilotChannelsAtom(rid));
        pcs.forEach((pc) => idSet.add(pc.pilotId));
    });
    const ids = Array.from(idSet);
    return ids.sort((a, b) => {
        const aCon = get(pilotConsecAtom(a)).previous?.time ?? Number.POSITIVE_INFINITY;
        const bCon = get(pilotConsecAtom(b)).previous?.time ?? Number.POSITIVE_INFINITY;
        if (aCon !== bCon) return aCon - bCon;
        const aLap = get(pilotBestLapAtom(a)).previous?.time ?? Number.POSITIVE_INFINITY;
        const bLap = get(pilotBestLapAtom(b)).previous?.time ?? Number.POSITIVE_INFINITY;
        if (aLap !== bLap) return aLap - bLap;
        const aCh = channelNumberOf(get, a);
        const bCh = channelNumberOf(get, b);
        return aCh - bCh;
    });
});

// Position changes map based on previous vs current ordered IDs
export const positionChangesAtom = eagerAtom((get): Map<string, number> => {
    const prev = get(previousLeaderboardPilotIdsAtom);
    const cur = get(leaderboardPilotIdsAtom);
    const prevIndex = new Map<string, number>();
    prev.forEach((id, idx) => prevIndex.set(id, idx + 1));

    const changes = new Map<string, number>();
    cur.forEach((id, idx) => {
        const prevPos = prevIndex.get(id);
        if (prevPos !== undefined && prevPos !== idx + 1) {
            changes.set(id, prevPos);
        }
    });
    return changes;
});
