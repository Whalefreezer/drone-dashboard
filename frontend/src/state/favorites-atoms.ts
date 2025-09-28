import { atom } from 'jotai';
import { atomFamily } from 'jotai/utils';
import { atomWithStorage } from 'jotai/utils';
import { eagerAtom } from 'jotai-eager';
import { pilotsAtom } from './pbAtoms.ts';
import type { PBPilotRecord } from '../api/pbTypes.ts';

// Storage key for favorites
const STORAGE_KEY = 'drone-dashboard:favorites';

/**
 * Raw favorites atom - stores array of pilot IDs in localStorage
 */
export const favoritePilotIdsAtom = atomWithStorage<string[]>(
	STORAGE_KEY,
	[],
	undefined,
	{
		getOnInit: true,
	},
);

/**
 * Derived atom that returns favorite pilots as a Set for O(1) lookups
 */
export const favoritePilotIdsSetAtom = eagerAtom((get) => {
	return new Set(get(favoritePilotIdsAtom));
});

/**
 * Family atom to check if a specific pilot is favorited
 */
export const isPilotFavoriteAtom = atomFamily((pilotId: string) =>
	eagerAtom((get) => {
		const favorites = get(favoritePilotIdsSetAtom);
		return favorites.has(pilotId);
	})
);

/**
 * Derived atom that returns only favorited pilots from the current pilots list
 */
export const favoritePilotsAtom = eagerAtom((get) => {
	const pilots = get(pilotsAtom);
	const favorites = get(favoritePilotIdsSetAtom);

	return pilots.filter((pilot) => favorites.has(pilot.id));
});

/**
 * Action atom to toggle a pilot's favorite status
 */
export const togglePilotFavoriteAtom = atom(
	null,
	(get, set, pilotId: string) => {
		const currentFavorites = get(favoritePilotIdsAtom);
		const favoritesSet = new Set(currentFavorites);

		if (favoritesSet.has(pilotId)) {
			favoritesSet.delete(pilotId);
		} else {
			favoritesSet.add(pilotId);
		}

		const newFavorites = Array.from(favoritesSet).sort();
		set(favoritePilotIdsAtom, newFavorites);
	},
);

/**
 * Action atom to add a pilot to favorites
 */
export const addPilotFavoriteAtom = atom(
	null,
	(get, set, pilotId: string) => {
		const currentFavorites = get(favoritePilotIdsAtom);
		if (!currentFavorites.includes(pilotId)) {
			const newFavorites = [...currentFavorites, pilotId].sort();
			set(favoritePilotIdsAtom, newFavorites);
		}
	},
);

/**
 * Action atom to remove a pilot from favorites
 */
export const removePilotFavoriteAtom = atom(
	null,
	(get, set, pilotId: string) => {
		const currentFavorites = get(favoritePilotIdsAtom);
		if (currentFavorites.includes(pilotId)) {
			const newFavorites = currentFavorites.filter((id: string) => id !== pilotId);
			set(favoritePilotIdsAtom, newFavorites);
		}
	},
);

/**
 * Action atom to clear all favorites
 */
export const clearFavoritesAtom = atom(
	null,
	(get, set) => {
		set(favoritePilotIdsAtom, []);
	},
);

/**
 * Atom for the count of favorited pilots
 */
export const favoriteCountAtom = eagerAtom((get) => {
	return get(favoritePilotIdsAtom).length;
});
