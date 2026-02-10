import type { RecordSubscription } from 'pocketbase';
import type { AnyRecord, CollectionState } from './pbCollectionRuntime.state.ts';
import { getRecordTimestamp } from './pbCollectionRuntime.state.ts';

interface ReducerContext {
	collection: string;
	debugLog: (...args: unknown[]) => void;
	notifyListeners: () => void;
}

export function mergeRecordsIntoState<TRecord extends AnyRecord>(
	state: CollectionState<AnyRecord>,
	records: TRecord[],
	context: ReducerContext,
) {
	context.debugLog('Merging records', { collection: context.collection, count: records.length });
	for (const record of records) {
		state.records.set(record.id, record);
		const ts = getRecordTimestamp(record);
		if (ts && (!state.lastCursor || ts > state.lastCursor)) {
			state.lastCursor = ts;
		}
	}
	state.lastSyncedAt = new Date().toISOString();
	if (state.suspendNotifications) {
		state.needsNotify = true;
	} else {
		context.notifyListeners();
	}
}

export function applyRealtimeEventToState(
	state: CollectionState<AnyRecord>,
	event: RecordSubscription<AnyRecord>,
	context: ReducerContext,
) {
	switch (event.action) {
		case 'create':
		case 'update': {
			context.debugLog('Applying record upsert', {
				collection: context.collection,
				id: event.record.id,
				action: event.action,
			});
			const record = event.record as AnyRecord;
			state.records.set(record.id, record);
			const ts = getRecordTimestamp(record);
			if (ts && (!state.lastCursor || ts > state.lastCursor)) {
				state.lastCursor = ts;
			}
			state.lastSyncedAt = new Date().toISOString();
			break;
		}
		case 'delete': {
			context.debugLog('Applying record delete', { collection: context.collection, id: event.record.id });
			state.records.delete(event.record.id);
			state.lastSyncedAt = new Date().toISOString();
			break;
		}
		default:
			return;
	}

	if (state.suspendNotifications) {
		state.needsNotify = true;
	} else {
		context.notifyListeners();
	}
}
