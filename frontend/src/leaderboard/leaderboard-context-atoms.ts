import { Atom } from 'jotai';
import { eagerAtom } from 'jotai-eager';
import { atomFamily } from 'jotai/utils';
import { allRacesAtom, currentRaceAtom, lastCompletedRaceAtom, racePilotChannelsAtom } from '../race/race-atoms.ts';
import { bracketsDataAtom, channelsDataAtom, pilotsAtom } from '../state/pbAtoms.ts';
import type { BracketPilot } from '../bracket/bracket-types.ts';
import type { PBChannelRecord, PBRaceRecord } from '../api/pbTypes.ts';

// Race ID sets shared across leaderboard and metric selectors
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
            const match = bracket.pilots.find((bp: BracketPilot) => norm(bp.name) === norm(pilot.name));
            if (match) return { bracket: bracket.name, position: 0, points: match.points };
        }
        return null;
    })
);

export type EagerGetter = <Value>(atom: Atom<Value>) => Awaited<Value>;
