import type { RecordSubscription } from 'pocketbase';
import type { PBBaseRecord } from './pbTypes.ts';
import type { CollectionSubscriptionSnapshot, SubscribeOptions, SubscriptionStatus, SubscriptionStatusPayload } from './pbRealtimeTypes.ts';

export type AnyRecord = PBBaseRecord & {
	lastUpdated?: string;
	updated?: string;
	created?: string;
};

export interface CollectionListener<TRecord extends PBBaseRecord> {
	id: number;
	options: SubscribeOptions<TRecord>;
	callback: (snapshot: CollectionSubscriptionSnapshot<TRecord>) => void;
	debouncedNotify: {
		(snapshot: CollectionSubscriptionSnapshot<TRecord>): void;
		cancel: () => void;
	};
	lastSnapshot?: CollectionSubscriptionSnapshot<TRecord>;
}

export interface StatusListener {
	id: number;
	callback: (payload: SubscriptionStatusPayload) => void;
}

export interface CollectionState<TRecord extends AnyRecord> {
	records: Map<string, TRecord>;
	status: SubscriptionStatus;
	error: Error | null;
	lastCursor?: string;
	lastSyncedAt?: string;
	listeners: Map<number, CollectionListener<AnyRecord>>;
	statusListeners: Map<number, StatusListener>;
	subscribePromise?: Promise<() => void>;
	unsubscribe?: () => void;
	initialFetchPromise?: Promise<void>;
	pendingEvents: Array<RecordSubscription<AnyRecord>>;
	suspendNotifications: boolean;
	needsNotify: boolean;
	awaitingBackfill: boolean;
	isBackfilling: boolean;
	invalidatePromise?: Promise<void>;
}

export interface RuntimeConfig {
	defaultBatchMs: number;
	fetchBatchSize: number;
	debugLog: (...args: unknown[]) => void;
}

export function createInitialState(): CollectionState<AnyRecord> {
	return {
		records: new Map<string, AnyRecord>(),
		status: 'idle',
		error: null,
		lastCursor: undefined,
		lastSyncedAt: undefined,
		listeners: new Map(),
		statusListeners: new Map(),
		subscribePromise: undefined,
		unsubscribe: undefined,
		initialFetchPromise: undefined,
		pendingEvents: [],
		suspendNotifications: false,
		needsNotify: false,
		awaitingBackfill: false,
		isBackfilling: false,
		invalidatePromise: undefined,
	};
}

export function resetRuntimeState(state: CollectionState<AnyRecord>) {
	for (const listener of state.listeners.values()) {
		listener.debouncedNotify.cancel();
	}
	state.records.clear();
	state.status = 'idle';
	state.error = null;
	state.lastCursor = undefined;
	state.lastSyncedAt = undefined;
	state.listeners.clear();
	state.statusListeners.clear();
	state.subscribePromise = undefined;
	state.unsubscribe = undefined;
	state.initialFetchPromise = undefined;
	state.pendingEvents = [];
	state.suspendNotifications = false;
	state.needsNotify = false;
	state.awaitingBackfill = false;
	state.isBackfilling = false;
	state.invalidatePromise = undefined;
}

export function normalizeRuntimeError(error: unknown): Error {
	if (error instanceof Error) return error;
	return new Error(typeof error === 'string' ? error : 'Unknown PocketBase error');
}

export function getRecordTimestamp(record: AnyRecord): string | undefined {
	return record.lastUpdated ?? record.updated ?? record.created ?? undefined;
}
