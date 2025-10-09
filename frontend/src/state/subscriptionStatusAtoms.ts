import { atom } from 'jotai';
import { pbCollectionStatusAtom, type SubscriptionStatus, type SubscriptionStatusPayload } from '../api/pb.ts';

const MONITORED_COLLECTIONS = [
	'events',
	'rounds',
	'pilots',
	'channels',
	'tracks',
	'races',
	'pilotChannels',
	'client_kv',
	'laps',
	'detections',
	'gamePoints',
	'ingest_targets',
	'server_settings',
	'control_stats',
] as const;

const statusAtoms = MONITORED_COLLECTIONS.map((collection) => ({
	collection,
	atom: pbCollectionStatusAtom(collection),
}));

export interface CollectionStatusEntry {
	collection: string;
	payload: SubscriptionStatusPayload;
}

export interface AggregatedSubscriptionStatus {
	statuses: CollectionStatusEntry[];
	worst: CollectionStatusEntry | null;
}

export const aggregatedSubscriptionStatusAtom = atom<AggregatedSubscriptionStatus>((get) => {
	const statuses = statusAtoms.map(({ collection, atom: statusAtom }) => ({
		collection,
		payload: get(statusAtom),
	}));

	const worst = statuses.reduce<CollectionStatusEntry | null>((current, next) => {
		if (!current) return next;
		return statusPriority(next.payload.status) > statusPriority(current.payload.status) ? next : current;
	}, null);

	return {
		statuses,
		worst,
	};
});

function statusPriority(status: SubscriptionStatus): number {
	switch (status) {
		case 'error':
			return 5;
		case 'reconnecting':
			return 4;
		case 'backfilling':
			return 3;
		case 'initializing':
			return 2;
		case 'idle':
			return 1;
		case 'ready':
		default:
			return 0;
	}
}

/**
 * Atom that checks if leaderboard-critical collections (laps and detections) have completed initial load.
 * Returns true once both collections move past 'idle' and 'initializing' status.
 * Will remain true during backfilling/reconnecting to avoid hiding data unnecessarily.
 */
export const leaderboardDataReadyAtom = atom<boolean>((get) => {
	const lapsStatus = get(pbCollectionStatusAtom('laps'));
	const detectionsStatus = get(pbCollectionStatusAtom('detections'));

	const lapsReady = lapsStatus.status !== 'idle' && lapsStatus.status !== 'initializing';
	const detectionsReady = detectionsStatus.status !== 'idle' && detectionsStatus.status !== 'initializing';

	return lapsReady && detectionsReady;
});
