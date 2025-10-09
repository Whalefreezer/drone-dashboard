import type { PBBaseRecord } from './pbTypes.ts';

export type SubscriptionStatus =
	| 'idle'
	| 'initializing'
	| 'ready'
	| 'reconnecting'
	| 'backfilling'
	| 'error';

export interface SubscribeOptions<TRecord extends PBBaseRecord> {
	/**
	 * Optional PocketBase filter string applied during REST fetches.
	 */
	filter?: string;
	/**
	 * Predicate used to decide whether a record should be emitted to a listener.
	 * Strongly recommended when `filter` is provided because realtime events are delivered for the entire collection.
	 */
	recordFilter?: (record: TRecord) => boolean;
	/**
	 * Batch delay (ms) before notifying listeners. Defaults to 25ms.
	 */
	batchMs?: number;
	/**
	 * Stable key used to cache snapshot atoms when different subscribers share the same collection.
	 * Required when using inline `recordFilter` functions to avoid collisions.
	 */
	key?: string;
}

export interface CollectionSubscriptionSnapshot<TRecord extends PBBaseRecord> {
	records: TRecord[];
	status: SubscriptionStatus;
	error: Error | null;
	lastSyncedAt?: string;
}

export interface SubscriptionStatusPayload {
	status: SubscriptionStatus;
	error: Error | null;
	lastSyncedAt?: string;
}
