import { atom } from 'jotai';
import { racePilotChannelsAtom } from '../race/race-atoms.ts';
import { currentRaceIdsAtom, previousRaceIdsAtom } from './leaderboard-context-atoms.ts';
import { sortPilotIds } from './leaderboard-sorter.ts';
import { defaultSortConfigCurrent, defaultSortConfigPrevious } from './sorting-helpers.ts';
import { pilotsAtom } from '../state/pbAtoms.ts';
import { favoritePilotIdsSetAtom } from '../state/favorites-atoms.ts';
import { withCompare } from '../state/jotai-utils.ts';

export const leaderboardPilotIdsAtom = atom((get): string[] => {
	console.log('leaderboardPilotIdsAtom recalculated');
	const pilots = get(pilotsAtom);
	const ids = pilots.map((pilot) => pilot.id);
	return sortPilotIds(ids, get, defaultSortConfigCurrent);
});

export const previousLeaderboardPilotIdsAtom = atom((get): string[] => {
	console.log('previousLeaderboardPilotIdsAtom recalculated');
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
export const positionChangesAtom = atom((get): Map<string, number> => {
	console.log('positionChangesAtom recalculated');
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

// Atom for controlling favorites filter state
export const showFavoritesOnlyAtom = atom(false);

// Filtered leaderboard pilot IDs based on favorites filter
export const filteredLeaderboardPilotIdsAtom = atom((get): string[] => {
	const showFavoritesOnly = get(showFavoritesOnlyAtom);
	const allPilotIds = get(leaderboardPilotIdsAtom);

	if (!showFavoritesOnly) {
		return allPilotIds;
	}

	const favorites = get(favoritePilotIdsSetAtom);
	return allPilotIds.filter((pilotId) => favorites.has(pilotId));
});
