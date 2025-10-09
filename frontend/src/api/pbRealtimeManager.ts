import type PocketBase from 'pocketbase';
import type { RecordSubscription } from 'pocketbase';
import { batchDebounce } from '../common/utils.ts';
import type { PBBaseRecord } from './pbTypes.ts';

const envMeta = (import.meta as unknown as { env?: Record<string, unknown> }).env;
// const DEV_MODE = Boolean(envMeta?.DEV);
type DebugWindow = Window & { __PB_DEBUG_SUBSCRIPTIONS?: boolean };
const debugWindow = typeof window !== 'undefined' ? (window as DebugWindow) : undefined;
const SHOULD_LOG = Boolean(debugWindow?.__PB_DEBUG_SUBSCRIPTIONS);
const LOG_PREFIX = '[pbRealtimeManager]';

function debugLog(...args: unknown[]) {
	if (!SHOULD_LOG) return;
	try {
		console.debug(LOG_PREFIX, ...args);
	} catch {
		// ignore logging errors (e.g., console not available)
	}
}

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

type AnyRecord = PBBaseRecord & {
	lastUpdated?: string;
	updated?: string;
	created?: string;
};

interface CollectionListener<TRecord extends PBBaseRecord> {
	id: number;
	options: SubscribeOptions<TRecord>;
	callback: (snapshot: CollectionSubscriptionSnapshot<TRecord>) => void;
	debouncedNotify: ReturnType<typeof batchDebounce<[CollectionSubscriptionSnapshot<TRecord>]>>;
	lastSnapshot?: CollectionSubscriptionSnapshot<TRecord>;
}

interface StatusListener {
	id: number;
	callback: (payload: SubscriptionStatusPayload) => void;
}

interface CollectionState<TRecord extends AnyRecord> {
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

export class PBCollectionSubscriptionManager {
	private readonly collectionStates = new Map<string, CollectionState<AnyRecord>>();
	private listenerSeq = 0;
	private statusSeq = 0;
	private readonly defaultBatchMs = 25;
	private readonly fetchBatchSize = 1_000;

	constructor(private readonly pb: PocketBase) {
		const previousDisconnect = this.pb.realtime.onDisconnect;
		this.pb.realtime.onDisconnect = (activeSubscriptions) => {
			debugLog('Realtime disconnect observed', { activeSubscriptionsCount: activeSubscriptions?.length ?? 0 });
			this.handleDisconnect();
			if (typeof previousDisconnect === 'function') {
				previousDisconnect(activeSubscriptions);
			}
		};
	}

	subscribe<TRecord extends PBBaseRecord>(
		collection: string,
		options: SubscribeOptions<TRecord>,
		callback: (snapshot: CollectionSubscriptionSnapshot<TRecord>) => void,
	): { unsubscribe: () => void; initialSnapshotPromise: Promise<CollectionSubscriptionSnapshot<TRecord>> } {
		const state = this.ensureState<TRecord>(collection);

		const listenerId = ++this.listenerSeq;
		const debouncedNotify = batchDebounce<[CollectionSubscriptionSnapshot<TRecord>]>((calls) => {
			const latest = calls[calls.length - 1][0];
			listener.lastSnapshot = latest;
			callback(latest);
		}, options.batchMs ?? this.defaultBatchMs);

		const listener: CollectionListener<TRecord> = {
			id: listenerId,
			options,
			callback,
			debouncedNotify,
		};

		debugLog('subscribe()', { collection, listenerId, filter: options.filter ?? null });

		state.listeners.set(listenerId, listener as unknown as CollectionListener<AnyRecord>);

		const initialSnapshotPromise = this.startCollection(collection)
			.then(() => this.buildSnapshot(collection, options))
			.then((snapshot) => {
				listener.lastSnapshot = snapshot;
				return snapshot;
			});

		initialSnapshotPromise
			.then((snapshot) => {
				// Emit once after initial fetch to prime the consumer.
				debugLog('Initial snapshot resolved', { collection, listenerId, recordCount: snapshot.records.length });
				listener.debouncedNotify(snapshot);
			})
			.catch(() => {
				// error handling is already dispatched via status updates
			});

		return {
			unsubscribe: () => {
				if (state.listeners.delete(listenerId)) {
					debouncedNotify.cancel();
				}
			},
			initialSnapshotPromise,
		};
	}

	subscribeStatus(
		collection: string,
		callback: (payload: SubscriptionStatusPayload) => void,
	): { unsubscribe: () => void; initialStatus: SubscriptionStatusPayload } {
		const state = this.ensureState(collection);
		const listenerId = ++this.statusSeq;
		const listener: StatusListener = { id: listenerId, callback };
		state.statusListeners.set(listenerId, listener);

		const initialStatus = this.buildStatusPayload(state);
		callback(initialStatus);

		// // Only kick off realtime if snapshot listeners exist or a subscription is already active.
		// if (state.listeners.size > 0 || state.subscribePromise || state.initialFetchPromise) {
		// 	void this.startCollection(collection);
		// }

		return {
			unsubscribe: () => {
				state.statusListeners.delete(listenerId);
			},
			initialStatus,
		};
	}

	getCachedSnapshot<TRecord extends PBBaseRecord>(
		collection: string,
		options: SubscribeOptions<TRecord>,
	): CollectionSubscriptionSnapshot<TRecord> | undefined {
		const state = this.collectionStates.get(collection);
		if (!state) return undefined;
		if (state.status === 'idle' && state.records.size === 0) return undefined;
		return this.buildSnapshot(collection, options);
	}

	getCachedStatus(collection: string): SubscriptionStatusPayload | undefined {
		const state = this.collectionStates.get(collection);
		if (!state) return undefined;
		return this.buildStatusPayload(state);
	}

	clearCache(collection?: string) {
		if (collection) {
			const state = this.collectionStates.get(collection);
			if (state?.unsubscribe) {
				state.unsubscribe();
			}
			this.collectionStates.delete(collection);
			return;
		}
		for (const [key, state] of this.collectionStates.entries()) {
			state.unsubscribe?.();
			this.collectionStates.delete(key);
		}
	}

	async invalidate(collection: string): Promise<void> {
		const state = this.collectionStates.get(collection);
		if (!state) return;

		if (state.initialFetchPromise && state.status === 'initializing') {
			await state.initialFetchPromise;
		}

		await this.waitForBackfill(state);

		if (state.invalidatePromise) {
			await state.invalidatePromise;
			return;
		}

		debugLog('Manual invalidation requested', { collection });

		const invalidatePromise = this.runInvalidation(collection, state);
		state.invalidatePromise = invalidatePromise;
		try {
			await invalidatePromise;
		} finally {
			state.invalidatePromise = undefined;
		}
	}

	async invalidateAll(): Promise<void> {
		const collections = Array.from(this.collectionStates.keys());
		if (collections.length === 0) return;
		await Promise.all(collections.map((collection) => this.invalidate(collection)));
	}

	private async startCollection(collection: string): Promise<void> {
		const state = this.ensureState(collection);

		if (!state.subscribePromise) {
			debugLog('Creating realtime subscription', { collection });
			state.subscribePromise = this.pb.collection(collection).subscribe('*', (event) => {
				this.handleEvent(collection, event as RecordSubscription<AnyRecord>);
			});

			state.subscribePromise
				.then((unsub) => {
					state.unsubscribe = unsub;
				})
				.catch((error) => {
					state.error = this.normalizeError(error);
					this.setStatus(collection, 'error');
				});
		}

		if (!state.initialFetchPromise) {
			state.initialFetchPromise = this.fetchAndInitializeCollection(collection);
		}

		await state.initialFetchPromise;
	}

	private async fetchAndInitializeCollection(collection: string): Promise<void> {
		const state = this.ensureState(collection);
		debugLog('Initial fetch starting', { collection });
		this.setStatus(collection, 'initializing');
		try {
			await this.fetchForListeners(collection);
			this.flushPendingEvents(collection);
			state.error = null;
			state.lastSyncedAt = new Date().toISOString();
			debugLog('Initial fetch completed', { collection, recordCount: state.records.size });
			this.setStatus(collection, 'ready');
		} catch (error) {
			debugLog('Initial fetch errored', { collection, error });
			state.error = this.normalizeError(error);
			this.setStatus(collection, 'error');
			throw error;
		}
	}

	private async fetchForListeners(collection: string, since?: string): Promise<void> {
		const state = this.ensureState(collection);
		const listeners = Array.from(state.listeners.values());
		const filters = listeners.length > 0
			? listeners.reduce<Map<string, SubscribeOptions<AnyRecord>>>((acc, listener) => {
				const key = listener.options.filter?.trim() ?? '';
				if (!acc.has(key)) {
					acc.set(key, listener.options as SubscribeOptions<AnyRecord>);
				}
				return acc;
			}, new Map())
			: new Map<string, SubscribeOptions<AnyRecord>>();

		// Always fetch at least once to keep cache warm even without filters/listeners.
		if (filters.size === 0) {
			filters.set('', {});
		}

		state.suspendNotifications = true;
		state.needsNotify = false;

		try {
			await Promise.all(
				Array.from(filters.entries()).map(async ([filter]) => {
					const finalFilter = this.combineFilters(filter, since ? this.cursorFilter(since) : '');
					debugLog('Fetching collection records', { collection, filter: finalFilter || null });
					const records = await this.fetchCollectionRecords(collection, finalFilter);
					this.mergeRecords(collection, records);
				}),
			);
		} finally {
			state.suspendNotifications = false;
			if (state.needsNotify) {
				state.needsNotify = false;
				this.notifyListeners(collection);
			}
		}
	}

	private async collectRecordsForListeners(
		collection: string,
		since?: string,
	): Promise<{ records: Map<string, AnyRecord>; lastCursor?: string }> {
		const state = this.ensureState(collection);
		const listeners = Array.from(state.listeners.values());
		const filters = listeners.length > 0
			? listeners.reduce<Map<string, SubscribeOptions<AnyRecord>>>((acc, listener) => {
				const key = listener.options.filter?.trim() ?? '';
				if (!acc.has(key)) {
					acc.set(key, listener.options as SubscribeOptions<AnyRecord>);
				}
				return acc;
			}, new Map())
			: new Map<string, SubscribeOptions<AnyRecord>>();

		if (filters.size === 0) {
			filters.set('', {});
		}

		const nextRecords = new Map<string, AnyRecord>();
		let nextCursor = since;
		const cursorFilter = since ? this.cursorFilter(since) : '';

		await Promise.all(
			Array.from(filters.entries()).map(async ([filter]) => {
				const finalFilter = this.combineFilters(filter, cursorFilter);
				debugLog('Collecting records for invalidation', { collection, filter: finalFilter || null });
				const records = await this.fetchCollectionRecords(collection, finalFilter);
				for (const record of records) {
					const anyRecord = record as AnyRecord;
					nextRecords.set(anyRecord.id, anyRecord);
					const ts = this.getRecordTimestamp(anyRecord);
					if (ts && (!nextCursor || ts > nextCursor)) {
						nextCursor = ts;
					}
				}
			}),
		);

		return { records: nextRecords, lastCursor: nextCursor };
	}

	private async fetchCollectionRecords<TRecord extends AnyRecord>(
		collection: string,
		filter: string,
	): Promise<TRecord[]> {
		const query = filter.trim().length > 0 ? { filter } : undefined;
		return await this.pb.collection(collection).getFullList<TRecord>(this.fetchBatchSize, query);
	}

	private mergeRecords<TRecord extends AnyRecord>(
		collection: string,
		records: TRecord[],
	) {
		debugLog('Merging records', { collection, count: records.length });
		const state = this.ensureState<TRecord>(collection);
		for (const record of records) {
			state.records.set(record.id, record);
			const ts = this.getRecordTimestamp(record);
			if (ts && (!state.lastCursor || ts > state.lastCursor)) {
				state.lastCursor = ts;
			}
		}
		state.lastSyncedAt = new Date().toISOString();
		if (state.suspendNotifications) {
			state.needsNotify = true;
		} else {
			this.notifyListeners(collection);
		}
	}

	private flushPendingEvents(collection: string, suppressNotify = false) {
		const state = this.ensureState(collection);
		if (state.pendingEvents.length === 0) return;

		const events = state.pendingEvents.splice(0);
		debugLog('Flushing pending realtime events', { collection, count: events.length });
		state.suspendNotifications = true;
		const previousNeedsNotify = state.needsNotify;
		state.needsNotify = false;
		try {
			for (const event of events) {
				this.applyRealtimeEvent(collection, event);
			}
		} finally {
			state.suspendNotifications = false;
			if (suppressNotify) {
				state.needsNotify = state.needsNotify || previousNeedsNotify;
			} else if (state.needsNotify || previousNeedsNotify) {
				state.needsNotify = false;
				this.notifyListeners(collection);
			}
		}
	}

	private async runInvalidation(collection: string, state: CollectionState<AnyRecord>): Promise<void> {
		state.suspendNotifications = true;
		state.needsNotify = false;
		try {
			this.setStatus(collection, 'initializing');

			const { records: nextRecords, lastCursor } = await this.collectRecordsForListeners(collection);

			state.records.clear();
			for (const [id, record] of nextRecords.entries()) {
				state.records.set(id, record);
			}
			state.lastCursor = lastCursor;
			state.lastSyncedAt = new Date().toISOString();
			state.awaitingBackfill = false;
			state.error = null;

			if (state.pendingEvents.length > 0) {
				this.flushPendingEvents(collection, true);
				state.suspendNotifications = true;
			}

			state.lastSyncedAt = new Date().toISOString();
			this.setStatus(collection, 'ready');
			debugLog('Manual invalidation completed', { collection, recordCount: state.records.size });
		} catch (error) {
			const normalized = this.normalizeError(error);
			state.error = normalized;
			this.setStatus(collection, 'error');
			debugLog('Manual invalidation failed', { collection, error: normalized.message });
			throw normalized;
		} finally {
			state.suspendNotifications = false;
			state.needsNotify = false;
			this.notifyListeners(collection);
		}
	}

	private async waitForBackfill(state: CollectionState<AnyRecord>): Promise<void> {
		if (!state.isBackfilling) return;
		await new Promise<void>((resolve) => {
			const poll = () => {
				if (!state.isBackfilling) {
					resolve();
					return;
				}
				setTimeout(poll, 10);
			};
			poll();
		});
	}

	private handleDisconnect() {
		for (const [collection, stateRaw] of this.collectionStates.entries()) {
			const state = stateRaw as CollectionState<AnyRecord>;
			if (state.status === 'initializing') continue;
			debugLog('Marking collection as reconnecting', { collection, previousStatus: state.status });
			state.awaitingBackfill = true;
			this.setStatus(collection, 'reconnecting');
		}
	}

	private async handleEvent(collection: string, event: RecordSubscription<AnyRecord>) {
		const state = this.ensureState(collection);
		debugLog('Realtime event received', { collection, action: event.action });

		if (event.action === 'PB_CONNECT') {
			if (state.awaitingBackfill && state.lastCursor) {
				state.awaitingBackfill = false;
				state.isBackfilling = true;
				this.setStatus(collection, 'backfilling');
				try {
					await this.fetchForListeners(collection, state.lastCursor);
					this.flushPendingEvents(collection);
					state.error = null;
					state.lastSyncedAt = new Date().toISOString();
					this.setStatus(collection, 'ready');
				} catch (error) {
					state.error = this.normalizeError(error);
					this.setStatus(collection, 'error');
				} finally {
					state.isBackfilling = false;
				}
			} else if (state.status === 'reconnecting') {
				state.awaitingBackfill = false;
				this.setStatus(collection, 'ready');
			}
			return;
		}

		if (event.action === 'PB_ERROR') {
			const messageSource = event.record as unknown as Record<string, unknown> | undefined;
			const message = typeof messageSource?.message === 'string' ? String(messageSource.message) : undefined;
			state.error = this.normalizeError(message ?? 'Realtime error');
			this.setStatus(collection, 'error');
			return;
		}

		if (state.status === 'initializing' || state.isBackfilling) {
			state.pendingEvents.push(event);
			return;
		}

		this.applyRealtimeEvent(collection, event);
	}

	private applyRealtimeEvent(collection: string, event: RecordSubscription<AnyRecord>) {
		const state = this.ensureState(collection);
		switch (event.action) {
			case 'create':
			case 'update': {
				debugLog('Applying record upsert', { collection, id: event.record.id, action: event.action });
				const record = event.record as AnyRecord;
				state.records.set(record.id, record);
				const ts = this.getRecordTimestamp(record);
				if (ts && (!state.lastCursor || ts > state.lastCursor)) {
					state.lastCursor = ts;
				}
				state.lastSyncedAt = new Date().toISOString();
				break;
			}
			case 'delete': {
				debugLog('Applying record delete', { collection, id: event.record.id });
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
			this.notifyListeners(collection);
		}
	}

	private notifyListeners(collection: string) {
		const state = this.ensureState(collection);
		for (const listener of state.listeners.values()) {
			const snapshot = this.buildSnapshot(collection, listener.options as SubscribeOptions<AnyRecord>);
			listener.debouncedNotify(snapshot as CollectionSubscriptionSnapshot<PBBaseRecord>);
		}
		this.notifyStatusWatchers(collection);
	}

	private notifyStatusWatchers(collection: string) {
		const state = this.ensureState(collection);
		const payload = this.buildStatusPayload(state);
		debugLog('Status updated', { collection, status: payload.status, error: payload.error?.message ?? null });
		for (const listener of state.statusListeners.values()) {
			listener.callback(payload);
		}
	}

	private buildSnapshot<TRecord extends PBBaseRecord>(
		collection: string,
		options: SubscribeOptions<TRecord>,
	): CollectionSubscriptionSnapshot<TRecord> {
		const state = this.ensureState(collection);
		const records = this.recordsForOptions(state, options) as TRecord[];
		return {
			records,
			status: state.status,
			error: state.error,
			lastSyncedAt: state.lastSyncedAt,
		};
	}

	private buildStatusPayload(state: CollectionState<AnyRecord>): SubscriptionStatusPayload {
		return {
			status: state.status,
			error: state.error,
			lastSyncedAt: state.lastSyncedAt,
		};
	}

	private recordsForOptions<TRecord extends PBBaseRecord>(
		state: CollectionState<AnyRecord>,
		options: SubscribeOptions<TRecord>,
	): TRecord[] {
		const allRecords = Array.from(state.records.values()) as TRecord[];
		if (options.recordFilter) {
			return allRecords.filter((record) => {
				try {
					return options.recordFilter?.(record) ?? true;
				} catch {
					return false;
				}
			});
		}
		return allRecords;
	}

	private ensureState<TRecord extends AnyRecord>(collection: string): CollectionState<TRecord> {
		const existing = this.collectionStates.get(collection);
		if (existing) return existing as unknown as CollectionState<TRecord>;
		const created: CollectionState<AnyRecord> = {
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
		};
		this.collectionStates.set(collection, created);
		return created as unknown as CollectionState<TRecord>;
	}

	private setStatus(collection: string, status: SubscriptionStatus) {
		const state = this.ensureState(collection);
		if (state.status === status) return;
		state.status = status;
		this.notifyStatusWatchers(collection);
		// propagate status change to data listeners as well
		if (!state.suspendNotifications) {
			this.notifyListeners(collection);
		} else {
			state.needsNotify = true;
		}
	}

	private combineFilters(a: string, b: string): string {
		const parts = [a?.trim(), b?.trim()].filter((part) => part && part.length > 0) as string[];
		if (parts.length === 0) return '';
		if (parts.length === 1) return parts[0]!;
		return `(${parts.join(') && (')})`;
	}

	private cursorFilter(since: string): string {
		const escaped = since.replace(/"/g, '\\"');
		return `lastUpdated >= "${escaped}"`;
	}

	private getRecordTimestamp(record: AnyRecord): string | undefined {
		return record.lastUpdated ?? record.updated ?? record.created ?? undefined;
	}

	private normalizeError(error: unknown): Error {
		if (error instanceof Error) return error;
		return new Error(typeof error === 'string' ? error : 'Unknown PocketBase error');
	}
}
