import { Atom } from 'jotai';
import { eagerAtom } from 'jotai-eager';
import { racePilotChannelsAtom } from '../race/race-atoms.ts';
import { currentRaceIdsAtom, previousRaceIdsAtom } from './leaderboard-context-atoms.ts';
// metric atoms imported by sorter helpers, not directly here
import { sortPilotIds } from './leaderboard-sorter.ts';
import { defaultSortConfigCurrent, defaultSortConfigPrevious } from './sorting-helpers.ts';

// Race IDs and context atoms are defined in leaderboard-context-atoms.ts

type EagerGetter = <Value>(atom: Atom<Value>) => Awaited<Value>;

export const leaderboardPilotIdsAtom = eagerAtom((get): string[] => {
    // Candidates: union of scheduled pilots across current race IDs
    const rids = get(currentRaceIdsAtom);
    const idSet = new Set<string>();
    rids.forEach((rid) => {
        const pcs = get(racePilotChannelsAtom(rid));
        pcs.forEach((pc) => idSet.add(pc.pilotId));
    });
    const ids = Array.from(idSet);
    return sortPilotIds(ids, get, defaultSortConfigCurrent);
});

export const previousLeaderboardPilotIdsAtom = eagerAtom((get): string[] => {
    const rids = get(previousRaceIdsAtom);
    const idSet = new Set<string>();
    rids.forEach((rid) => {
        const pcs = get(racePilotChannelsAtom(rid));
        pcs.forEach((pc) => idSet.add(pc.pilotId));
    });
    const ids = Array.from(idSet);
    return sortPilotIds(ids, get, defaultSortConfigPrevious);
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
