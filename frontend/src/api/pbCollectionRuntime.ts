import type PocketBase from 'pocketbase';
import type { RecordSubscription } from 'pocketbase';
import { batchDebounce } from '../common/utils.ts';
import type { PBBaseRecord } from './pbTypes.ts';
import type { CollectionSubscriptionSnapshot, SubscribeOptions, SubscriptionStatus, SubscriptionStatusPayload } from './pbRealtimeTypes.ts';
import { buildFilterMap, combineFilters, cursorFilter } from './pbCollectionRuntime.filters.ts';
import { applyRealtimeEventToState, mergeRecordsIntoState } from './pbCollectionRuntime.reducer.ts';
import {
	type AnyRecord,
	type CollectionListener,
	type CollectionState,
	createInitialState,
	getRecordTimestamp,
	normalizeRuntimeError,
	resetRuntimeState,
	type RuntimeConfig,
	type StatusListener,
} from './pbCollectionRuntime.state.ts';
import { buildSnapshot, buildStatusPayload } from './pbCollectionRuntime.snapshots.ts';

export class PBCollectionRuntime {
	private readonly state: CollectionState<AnyRecord> = createInitialState();
	private listenerSeq = 0;
	private statusSeq = 0;

	constructor(
		private readonly pb: PocketBase,
		private readonly collection: string,
		private readonly config: RuntimeConfig,
	) {}

	subscribe<TRecord extends PBBaseRecord>(
		options: SubscribeOptions<TRecord>,
		callback: (snapshot: CollectionSubscriptionSnapshot<TRecord>) => void,
	): { unsubscribe: () => void; initialSnapshotPromise: Promise<CollectionSubscriptionSnapshot<TRecord>> } {
		const listenerId = ++this.listenerSeq;
		const debouncedNotify = batchDebounce<[CollectionSubscriptionSnapshot<TRecord>]>((calls) => {
			const latest = calls[calls.length - 1][0];
			listener.lastSnapshot = latest;
			callback(latest);
		}, options.batchMs ?? this.config.defaultBatchMs);

		const listener: CollectionListener<TRecord> = {
			id: listenerId,
			options,
			callback,
			debouncedNotify,
		};

		this.config.debugLog('subscribe()', { collection: this.collection, listenerId, filter: options.filter ?? null });

		this.state.listeners.set(listenerId, listener as unknown as CollectionListener<AnyRecord>);

		const initialSnapshotPromise = this.start()
			.then(() => buildSnapshot(this.state, options))
			.then((snapshot) => {
				listener.lastSnapshot = snapshot;
				return snapshot;
			});

		initialSnapshotPromise
			.then((snapshot) => {
				this.config.debugLog('Initial snapshot resolved', {
					collection: this.collection,
					listenerId,
					recordCount: snapshot.records.length,
				});
				listener.debouncedNotify(snapshot);
			})
			.catch(() => {
				// errors are surfaced through status listeners
			});

		return {
			unsubscribe: () => {
				if (this.state.listeners.delete(listenerId)) {
					debouncedNotify.cancel();
				}
			},
			initialSnapshotPromise,
		};
	}

	subscribeStatus(
		callback: (payload: SubscriptionStatusPayload) => void,
	): { unsubscribe: () => void; initialStatus: SubscriptionStatusPayload } {
		const listenerId = ++this.statusSeq;
		const listener: StatusListener = { id: listenerId, callback };
		this.state.statusListeners.set(listenerId, listener);

		const initialStatus = buildStatusPayload(this.state);
		callback(initialStatus);

		return {
			unsubscribe: () => {
				this.state.statusListeners.delete(listenerId);
			},
			initialStatus,
		};
	}

	getCachedSnapshot<TRecord extends PBBaseRecord>(
		options: SubscribeOptions<TRecord>,
	): CollectionSubscriptionSnapshot<TRecord> | undefined {
		if (this.state.status === 'idle' && this.state.records.size === 0) return undefined;
		return buildSnapshot(this.state, options);
	}

	getCachedStatus(): SubscriptionStatusPayload {
		return buildStatusPayload(this.state);
	}

	async invalidate(): Promise<void> {
		if (this.state.initialFetchPromise && this.state.status === 'initializing') {
			await this.state.initialFetchPromise;
		}

		await this.waitForBackfill();

		if (this.state.invalidatePromise) {
			await this.state.invalidatePromise;
			return;
		}

		this.config.debugLog('Manual invalidation requested', { collection: this.collection });

		const invalidatePromise = this.runInvalidation();
		this.state.invalidatePromise = invalidatePromise;
		try {
			await invalidatePromise;
		} finally {
			this.state.invalidatePromise = undefined;
		}
	}

	clear() {
		this.state.unsubscribe?.();
		resetRuntimeState(this.state);
		this.listenerSeq = 0;
		this.statusSeq = 0;
	}

	handleDisconnect() {
		if (!this.state.subscribePromise && this.state.listeners.size === 0) {
			this.config.debugLog('Ignoring disconnect for unsubscribed collection', { collection: this.collection });
			return;
		}
		if (this.state.status === 'initializing') return;
		this.config.debugLog('Marking collection as reconnecting', {
			collection: this.collection,
			previousStatus: this.state.status,
		});
		this.state.awaitingBackfill = true;
		this.setStatus('reconnecting');
	}

	handleEvent(event: RecordSubscription<AnyRecord>) {
		this.config.debugLog('Realtime event received', { collection: this.collection, action: event.action });

		if (event.action === 'PB_CONNECT' || event.action === 'PB_ERROR') {
			return;
		}

		if (this.state.status === 'initializing' || this.state.isBackfilling) {
			this.state.pendingEvents.push(event);
			return;
		}

		applyRealtimeEventToState(this.state, event, {
			collection: this.collection,
			debugLog: this.config.debugLog,
			notifyListeners: () => this.notifyListeners(),
		});
	}

	private async start(): Promise<void> {
		if (!this.state.subscribePromise) {
			this.config.debugLog('Creating realtime subscription', { collection: this.collection });
			const collectionSubscribePromise = this.pb.collection(this.collection).subscribe('*', (event) => {
				try {
					this.handleEvent(event as RecordSubscription<AnyRecord>);
				} catch (error) {
					this.state.error = normalizeRuntimeError(error);
					this.setStatus('error');
				}
			});
			const connectSubscribePromise = this.pb.realtime.subscribe('PB_CONNECT', () => {
				this.config.debugLog('PB_CONNECT event observed', { collection: this.collection });
				this.handleConnectEvent().catch((error) => {
					this.state.error = normalizeRuntimeError(error);
					this.setStatus('error');
				});
			});
			const errorSubscribePromise = this.pb.realtime.subscribe('PB_ERROR', (event) => {
				this.config.debugLog('PB_ERROR event observed', { collection: this.collection });
				this.handleRealtimeErrorEvent(event as RecordSubscription<AnyRecord>);
			});

			this.state.subscribePromise = Promise.all([
				collectionSubscribePromise,
				connectSubscribePromise,
				errorSubscribePromise,
			]).then(([collectionUnsubscribe, connectUnsubscribe, errorUnsubscribe]) => {
				return () => {
					try {
						errorUnsubscribe();
					} finally {
						try {
							connectUnsubscribe();
						} finally {
							collectionUnsubscribe();
						}
					}
				};
			});

			this.state.subscribePromise
				.then((unsub) => {
					this.state.unsubscribe = unsub;
				})
				.catch((error) => {
					this.state.error = normalizeRuntimeError(error);
					this.setStatus('error');
				});
		}

		if (!this.state.initialFetchPromise) {
			this.state.initialFetchPromise = this.fetchAndInitialize();
		}

		await this.state.initialFetchPromise;
	}

	private async fetchAndInitialize(): Promise<void> {
		this.config.debugLog('Initial fetch starting', { collection: this.collection });
		this.setStatus('initializing');
		try {
			await this.fetchForListeners();
			this.flushPendingEvents();
			this.state.error = null;
			this.state.lastSyncedAt = new Date().toISOString();
			this.config.debugLog('Initial fetch completed', {
				collection: this.collection,
				recordCount: this.state.records.size,
			});
			this.setStatus('ready');
		} catch (error) {
			this.config.debugLog('Initial fetch errored', { collection: this.collection, error });
			this.state.error = normalizeRuntimeError(error);
			this.setStatus('error');
			throw error;
		}
	}

	private async fetchForListeners(since?: string): Promise<void> {
		const filters = buildFilterMap(this.state.listeners.values());
		const cursorClause = since ? cursorFilter(since) : '';

		this.state.suspendNotifications = true;
		this.state.needsNotify = false;

		try {
			await Promise.all(
				Array.from(filters.entries()).map(async ([filter]) => {
					const finalFilter = combineFilters(filter, cursorClause);
					this.config.debugLog('Fetching collection records', {
						collection: this.collection,
						filter: finalFilter || null,
					});
					const records = await this.fetchCollectionRecords(finalFilter);
					mergeRecordsIntoState(this.state, records, {
						collection: this.collection,
						debugLog: this.config.debugLog,
						notifyListeners: () => this.notifyListeners(),
					});
				}),
			);
		} finally {
			this.state.suspendNotifications = false;
			if (this.state.needsNotify) {
				this.state.needsNotify = false;
				this.notifyListeners();
			}
		}
	}

	private async collectRecordsForInvalidation(): Promise<{ records: Map<string, AnyRecord>; lastCursor?: string }> {
		const filters = buildFilterMap(this.state.listeners.values());
		const nextRecords = new Map<string, AnyRecord>();
		let nextCursor: string | undefined;

		await Promise.all(
			Array.from(filters.entries()).map(async ([filter]) => {
				const finalFilter = combineFilters(filter, '');
				this.config.debugLog('Collecting records for invalidation', {
					collection: this.collection,
					filter: finalFilter || null,
				});
				const records = await this.fetchCollectionRecords(finalFilter);
				for (const record of records) {
					const anyRecord = record as AnyRecord;
					nextRecords.set(anyRecord.id, anyRecord);
					const ts = getRecordTimestamp(anyRecord);
					if (ts && (!nextCursor || ts > nextCursor)) {
						nextCursor = ts;
					}
				}
			}),
		);

		return { records: nextRecords, lastCursor: nextCursor };
	}

	private async fetchCollectionRecords<TRecord extends AnyRecord>(filter: string): Promise<TRecord[]> {
		const query = filter.trim().length > 0 ? { filter } : undefined;
		return await this.pb.collection(this.collection).getFullList<TRecord>(this.config.fetchBatchSize, query);
	}

	private flushPendingEvents(suppressNotify = false) {
		if (this.state.pendingEvents.length === 0) return;

		const events = this.state.pendingEvents.splice(0);
		this.config.debugLog('Flushing pending realtime events', { collection: this.collection, count: events.length });
		this.state.suspendNotifications = true;
		const previousNeedsNotify = this.state.needsNotify;
		this.state.needsNotify = false;
		try {
			for (const event of events) {
				applyRealtimeEventToState(this.state, event, {
					collection: this.collection,
					debugLog: this.config.debugLog,
					notifyListeners: () => this.notifyListeners(),
				});
			}
		} finally {
			this.state.suspendNotifications = false;
			if (suppressNotify) {
				this.state.needsNotify = this.state.needsNotify || previousNeedsNotify;
			} else if (this.state.needsNotify || previousNeedsNotify) {
				this.state.needsNotify = false;
				this.notifyListeners();
			}
		}
	}

	private notifyListeners() {
		for (const listener of this.state.listeners.values()) {
			const snapshot = buildSnapshot(this.state, listener.options as SubscribeOptions<PBBaseRecord>);
			listener.debouncedNotify(snapshot as CollectionSubscriptionSnapshot<PBBaseRecord>);
		}
		this.notifyStatusWatchers();
	}

	private notifyStatusWatchers() {
		const payload = buildStatusPayload(this.state);
		this.config.debugLog('Status updated', {
			collection: this.collection,
			status: payload.status,
			error: payload.error?.message ?? null,
		});
		for (const listener of this.state.statusListeners.values()) {
			listener.callback(payload);
		}
	}

	private setStatus(status: SubscriptionStatus) {
		if (this.state.status === status) return;
		this.state.status = status;
		this.notifyStatusWatchers();
		if (!this.state.suspendNotifications) {
			this.notifyListeners();
		} else {
			this.state.needsNotify = true;
		}
	}

	private async handleConnectEvent() {
		if (this.state.awaitingBackfill && this.state.lastCursor) {
			this.state.awaitingBackfill = false;
			this.state.isBackfilling = true;
			this.setStatus('backfilling');
			try {
				await this.fetchForListeners(this.state.lastCursor);
				this.flushPendingEvents();
				this.state.error = null;
				this.state.lastSyncedAt = new Date().toISOString();
				this.setStatus('ready');
			} catch (error) {
				this.state.error = normalizeRuntimeError(error);
				this.setStatus('error');
			} finally {
				this.state.isBackfilling = false;
			}
		} else if (this.state.status === 'reconnecting') {
			this.state.awaitingBackfill = false;
			this.setStatus('ready');
		}
	}

	private handleRealtimeErrorEvent(event: RecordSubscription<AnyRecord>) {
		const messageSource = event.record as unknown as Record<string, unknown> | undefined;
		const message = typeof messageSource?.message === 'string' ? String(messageSource.message) : undefined;
		this.state.error = normalizeRuntimeError(message ?? 'Realtime error');
		this.setStatus('error');
	}

	private async runInvalidation(): Promise<void> {
		this.state.suspendNotifications = true;
		this.state.needsNotify = false;
		try {
			this.setStatus('initializing');
			const { records: nextRecords, lastCursor } = await this.collectRecordsForInvalidation();
			this.state.records.clear();
			for (const [id, record] of nextRecords.entries()) {
				this.state.records.set(id, record);
			}
			this.state.lastCursor = lastCursor;
			this.state.lastSyncedAt = new Date().toISOString();
			this.state.awaitingBackfill = false;
			this.state.error = null;
			if (this.state.pendingEvents.length > 0) {
				this.flushPendingEvents(true);
				this.state.suspendNotifications = true;
			}
			this.state.lastSyncedAt = new Date().toISOString();
			this.setStatus('ready');
			this.config.debugLog('Manual invalidation completed', {
				collection: this.collection,
				recordCount: this.state.records.size,
			});
		} catch (error) {
			const normalized = normalizeRuntimeError(error);
			this.state.error = normalized;
			this.setStatus('error');
			this.config.debugLog('Manual invalidation failed', {
				collection: this.collection,
				error: normalized.message,
			});
			throw normalized;
		} finally {
			this.state.suspendNotifications = false;
			this.state.needsNotify = false;
			this.notifyListeners();
		}
	}

	private async waitForBackfill(): Promise<void> {
		if (!this.state.isBackfilling) return;
		await new Promise<void>((resolve) => {
			const poll = () => {
				if (!this.state.isBackfilling) {
					resolve();
					return;
				}
				setTimeout(poll, 10);
			};
			poll();
		});
	}
}
