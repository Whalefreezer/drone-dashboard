import { atom } from 'jotai';
import { atomFamily, atomWithStorage } from 'jotai/utils';
import { pilotsAtom } from './pbAtoms.ts';
import type { PBPilotRecord } from '../api/pbTypes.ts';

const STORAGE_KEY = 'drone-dashboard:favorites';

type PilotCollection = PBPilotRecord[] | Promise<PBPilotRecord[]>;

const asPilotArray = (value: PilotCollection): PBPilotRecord[] => (Array.isArray(value) ? value : []);

export const favoritePilotIdsAtom = atomWithStorage<string[]>(
	STORAGE_KEY,
	[],
	undefined,
	{ getOnInit: true },
);

export const favoritePilotSourceIdsSetAtom = atom((get) => {
	const stored = get(favoritePilotIdsAtom);
	return new Set(stored);
});

export const favoritePilotIdsSetAtom = atom((get) => {
	const sourceIds = get(favoritePilotSourceIdsSetAtom);
	const pilots = asPilotArray(get(pilotsAtom) as PilotCollection);
	const pocketbaseIds = new Set<string>();
	for (const pilot of pilots) {
		if (sourceIds.has(pilot.sourceId)) {
			pocketbaseIds.add(pilot.id);
		}
	}
	return pocketbaseIds;
});

export const isPilotFavoriteAtom = atomFamily((pilotSourceId: string) =>
	atom((get) => get(favoritePilotSourceIdsSetAtom).has(pilotSourceId))
);

export const favoritePilotsAtom = atom((get) => {
	const sourceIds = get(favoritePilotSourceIdsSetAtom);
	const pilots = asPilotArray(get(pilotsAtom) as PilotCollection);
	return pilots.filter((pilot) => sourceIds.has(pilot.sourceId));
});

const commitFavorites = (
	set: (atom: typeof favoritePilotIdsAtom, value: string[]) => void,
	favorites: Set<string>,
) => {
	set(favoritePilotIdsAtom, Array.from(favorites).sort());
};

export const togglePilotFavoriteAtom = atom(
	null,
	(get, set, pilotSourceId: string) => {
		const favorites = new Set(get(favoritePilotIdsAtom));
		if (favorites.has(pilotSourceId)) {
			favorites.delete(pilotSourceId);
		} else {
			favorites.add(pilotSourceId);
		}
		commitFavorites(set, favorites);
	},
);

export const addPilotFavoriteAtom = atom(
	null,
	(get, set, pilotSourceId: string) => {
		const favorites = new Set(get(favoritePilotIdsAtom));
		if (!favorites.has(pilotSourceId)) {
			favorites.add(pilotSourceId);
			commitFavorites(set, favorites);
		}
	},
);

export const removePilotFavoriteAtom = atom(
	null,
	(get, set, pilotSourceId: string) => {
		const favorites = new Set(get(favoritePilotIdsAtom));
		if (favorites.delete(pilotSourceId)) {
			commitFavorites(set, favorites);
		}
	},
);

export const clearFavoritesAtom = atom(
	null,
	(_get, set) => {
		set(favoritePilotIdsAtom, []);
	},
);

export const favoriteCountAtom = atom((get) => get(favoritePilotSourceIdsSetAtom).size);
