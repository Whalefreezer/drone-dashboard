import { eagerAtom } from 'jotai-eager';
import { racePilotChannelsAtom } from '../race/race-atoms.ts';
import { currentRaceIdsAtom, previousRaceIdsAtom } from './leaderboard-context-atoms.ts';
import { sortPilotIds } from './leaderboard-sorter.ts';
import { defaultSortConfigCurrent, defaultSortConfigPrevious } from './sorting-helpers.ts';

export const leaderboardPilotIdsAtom = eagerAtom((get): string[] => {
    const raceIds = get(currentRaceIdsAtom);
    const idSet = new Set<string>();
    raceIds.forEach((raceId) => {
        const pilotChannels = get(racePilotChannelsAtom(raceId));
        pilotChannels.forEach((pc) => idSet.add(pc.pilotId));
    });
    const ids = Array.from(idSet);
    return sortPilotIds(ids, get, defaultSortConfigCurrent);
});

export const previousLeaderboardPilotIdsAtom = eagerAtom((get): string[] => {
    const raceIds = get(previousRaceIdsAtom);
    const idSet = new Set<string>();
    raceIds.forEach((raceId) => {
        const pilotChannels = get(racePilotChannelsAtom(raceId));
        pilotChannels.forEach((pc) => idSet.add(pc.pilotId));
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
