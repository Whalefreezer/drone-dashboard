import type { PBBaseRecord } from './pbTypes.ts';
import type { CollectionSubscriptionSnapshot, SubscribeOptions, SubscriptionStatusPayload } from './pbRealtimeTypes.ts';
import type { AnyRecord, CollectionState } from './pbCollectionRuntime.state.ts';

export function recordsForOptions<TRecord extends PBBaseRecord>(
	state: CollectionState<AnyRecord>,
	options: SubscribeOptions<TRecord>,
): TRecord[] {
	const allRecords = Array.from(state.records.values()) as TRecord[];
	if (!options.recordFilter) {
		return allRecords;
	}
	return allRecords.filter((record) => {
		try {
			return options.recordFilter?.(record) ?? true;
		} catch {
			return false;
		}
	});
}

export function buildSnapshot<TRecord extends PBBaseRecord>(
	state: CollectionState<AnyRecord>,
	options: SubscribeOptions<TRecord>,
): CollectionSubscriptionSnapshot<TRecord> {
	const records = recordsForOptions(state, options);
	return {
		records,
		status: state.status,
		error: state.error,
		lastSyncedAt: state.lastSyncedAt,
	};
}

export function buildStatusPayload(
	state: CollectionState<AnyRecord>,
): SubscriptionStatusPayload {
	return {
		status: state.status,
		error: state.error,
		lastSyncedAt: state.lastSyncedAt,
	};
}
