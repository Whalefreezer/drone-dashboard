import { atom } from 'jotai';
import { racePilotChannelsAtom } from '../race/race-atoms.ts';
import { previousRaceIdsAtom } from './leaderboard-context-atoms.ts';
import { sortPilotIds } from './leaderboard-sorter.ts';
import { defaultSortConfigCurrent, defaultSortConfigPrevious } from './sorting-helpers.ts';
import { leaderboardLockedPositionsAtom, pilotsAtom } from '../state/pbAtoms.ts';
import { favoritePilotIdsSetAtom } from '../state/favorites-atoms.ts';

export const leaderboardPilotIdsAtom = atom((get): string[] => {
	const pilots = get(pilotsAtom);
	const ids = pilots.map((pilot) => pilot.id);
	const sorted = sortPilotIds(ids, get, defaultSortConfigCurrent);

	// Apply locked position ordering if locked positions exist
	const lockedPositions = get(leaderboardLockedPositionsAtom);
	if (lockedPositions.size === 0) return sorted;

	// Separate pilots with locked positions from those without
	const locked: string[] = [];
	const unlocked: string[] = [];

	sorted.forEach((id) => {
		if (lockedPositions.has(id)) {
			locked.push(id);
		} else {
			unlocked.push(id);
		}
	});

	// Sort locked pilots by their locked position
	locked.sort((a, b) => {
		const posA = lockedPositions.get(a) ?? 0;
		const posB = lockedPositions.get(b) ?? 0;
		return posA - posB;
	});

	// Return locked pilots first, then unlocked pilots
	return [...locked, ...unlocked];
});

export const previousLeaderboardPilotIdsAtom = atom((get): string[] => {
	const raceIds = get(previousRaceIdsAtom);
	const idSet = new Set<string>();
	raceIds.forEach((raceId) => {
		const pilotChannels = get(racePilotChannelsAtom(raceId));
		pilotChannels.forEach((pc) => idSet.add(pc.pilotId));
	});
	const ids = Array.from(idSet);
	return sortPilotIds(ids, get, defaultSortConfigPrevious);
});

export const leaderboardPilotIdsStateAtom = atom<string[]>([]);
export const previousLeaderboardPilotIdsStateAtom = atom<string[]>([]);

// Position changes map based on previous vs current ordered IDs
// When locked positions exist, use those for current positions instead of computed index
export const positionChangesAtom = atom((get): Map<string, number> => {
	const prev = get(previousLeaderboardPilotIdsStateAtom);
	const cur = get(leaderboardPilotIdsStateAtom);
	const lockedPositions = get(leaderboardLockedPositionsAtom);

	const prevIndex = new Map<string, number>();
	prev.forEach((id, idx) => prevIndex.set(id, idx + 1));

	const changes = new Map<string, number>();
	cur.forEach((id, idx) => {
		// Use locked position if available, otherwise computed position
		const currentPos = lockedPositions.get(id) ?? (idx + 1);
		const prevPos = prevIndex.get(id);
		if (prevPos !== undefined && prevPos !== currentPos) {
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
	const allPilotIds = get(leaderboardPilotIdsStateAtom);

	if (!showFavoritesOnly) {
		return allPilotIds;
	}

	const favorites = get(favoritePilotIdsSetAtom);
	return allPilotIds.filter((pilotId) => favorites.has(pilotId));
});
