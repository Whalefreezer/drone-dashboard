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
