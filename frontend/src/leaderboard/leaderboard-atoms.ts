import { atom } from 'jotai';
import { racePilotChannelsAtom } from '../race/race-atoms.ts';
import { pilotEliminatedInfoAtom, pilotRacesUntilNextAtom, previousRaceIdsAtom } from './leaderboard-context-atoms.ts';
import { sortPilotIds } from './leaderboard-sorter.ts';
import { defaultSortConfigCurrent, defaultSortConfigPrevious } from './sorting-helpers.ts';
import { leaderboardLockedEntriesAtom, leaderboardLockedPositionsAtom, pilotsAtom } from '../state/pbAtoms.ts';
import { favoritePilotIdsSetAtom } from '../state/favorites-atoms.ts';

export const leaderboardPilotIdsAtom = atom((get): string[] => {
	const pilots = get(pilotsAtom);
	const ids = pilots.map((pilot) => pilot.id);
	const sorted = sortPilotIds(ids, get, defaultSortConfigCurrent);
	const lockedPositions = get(leaderboardLockedPositionsAtom);
	const sortDoneToBottom = (orderedIds: string[]): string[] => {
		const indexById = new Map<string, number>(orderedIds.map((id, index) => [id, index]));
		return [...orderedIds].sort((a, b) => {
			const aRacesUntilNext = get(pilotRacesUntilNextAtom(a));
			const bRacesUntilNext = get(pilotRacesUntilNextAtom(b));
			const aIsEliminated = !!get(pilotEliminatedInfoAtom(a));
			const bIsEliminated = !!get(pilotEliminatedInfoAtom(b));
			const aHasLockedPosition = lockedPositions.has(a);
			const bHasLockedPosition = lockedPositions.has(b);

			const aIsDone = aRacesUntilNext === -1 && (aIsEliminated || aHasLockedPosition);
			const bIsDone = bRacesUntilNext === -1 && (bIsEliminated || bHasLockedPosition);

			if (aIsDone && !bIsDone) return 1;
			if (!aIsDone && bIsDone) return -1;
			return (indexById.get(a) ?? 0) - (indexById.get(b) ?? 0);
		});
	};

	// Apply locked position ordering if locked positions exist
	if (lockedPositions.size === 0) return sortDoneToBottom(sorted);
	const lockedEntries = get(leaderboardLockedEntriesAtom);

	// Create a map of computed positions for unlocked pilots
	const computedPositions = new Map<string, number>();
	sorted.forEach((id, idx) => {
		if (!lockedPositions.has(id)) {
			computedPositions.set(id, idx + 1);
		}
	});

	// Sort all pilots by their effective position (locked or computed)
	// `done` pilots from locked elimination rankings are always shown last.
	// When positions are tied, non-locked pilots rank above locked pilots.
	const ordered = ids.sort((a, b) => {
		const aIsDone = lockedEntries.get(a)?.isDone === true;
		const bIsDone = lockedEntries.get(b)?.isDone === true;
		if (aIsDone && !bIsDone) return 1;
		if (!aIsDone && bIsDone) return -1;

		const posA = lockedPositions.get(a) ?? computedPositions.get(a) ?? 9999;
		const posB = lockedPositions.get(b) ?? computedPositions.get(b) ?? 9999;

		// Primary sort by position
		if (posA !== posB) return posA - posB;

		// Secondary sort: non-locked before locked (when positions are equal)
		const aIsLocked = lockedPositions.has(a);
		const bIsLocked = lockedPositions.has(b);
		if (aIsLocked && !bIsLocked) return 1; // a locked, b not locked -> b comes first
		if (!aIsLocked && bIsLocked) return -1; // a not locked, b locked -> a comes first

		return 0;
	});
	return sortDoneToBottom(ordered);
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
