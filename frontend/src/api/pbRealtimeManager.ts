import type PocketBase from 'pocketbase';
import type { PBBaseRecord } from './pbTypes.ts';
import { PBCollectionRuntime } from './pbCollectionRuntime.ts';
import type { CollectionSubscriptionSnapshot, SubscribeOptions, SubscriptionStatus, SubscriptionStatusPayload } from './pbRealtimeTypes.ts';

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

export type { CollectionSubscriptionSnapshot, SubscribeOptions, SubscriptionStatus, SubscriptionStatusPayload } from './pbRealtimeTypes.ts';

export class PBCollectionSubscriptionManager {
	private readonly collectionRuntimes = new Map<string, PBCollectionRuntime>();
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
		return this.runtimeFor(collection).subscribe(options, callback);
	}

	subscribeStatus(
		collection: string,
		callback: (payload: SubscriptionStatusPayload) => void,
	): { unsubscribe: () => void; initialStatus: SubscriptionStatusPayload } {
		return this.runtimeFor(collection).subscribeStatus(callback);
	}

	getCachedSnapshot<TRecord extends PBBaseRecord>(
		collection: string,
		options: SubscribeOptions<TRecord>,
	): CollectionSubscriptionSnapshot<TRecord> | undefined {
		const runtime = this.collectionRuntimes.get(collection);
		return runtime?.getCachedSnapshot(options);
	}

	getCachedStatus(collection: string): SubscriptionStatusPayload | undefined {
		const runtime = this.collectionRuntimes.get(collection);
		return runtime ? runtime.getCachedStatus() : undefined;
	}

	clearCache(collection?: string) {
		if (collection) {
			const runtime = this.collectionRuntimes.get(collection);
			if (!runtime) return;
			runtime.clear();
			this.collectionRuntimes.delete(collection);
			return;
		}
		for (const [key, runtime] of this.collectionRuntimes.entries()) {
			runtime.clear();
			this.collectionRuntimes.delete(key);
		}
	}

	async invalidate(collection: string): Promise<void> {
		const runtime = this.collectionRuntimes.get(collection);
		if (!runtime) return;
		await runtime.invalidate();
	}

	async invalidateAll(): Promise<void> {
		await Promise.all(
			Array.from(this.collectionRuntimes.values()).map(async (runtime) => {
				await runtime.invalidate();
			}),
		);
	}

	private runtimeFor(collection: string): PBCollectionRuntime {
		let runtime = this.collectionRuntimes.get(collection);
		if (!runtime) {
			runtime = new PBCollectionRuntime(this.pb, collection, {
				defaultBatchMs: this.defaultBatchMs,
				fetchBatchSize: this.fetchBatchSize,
				debugLog,
			});
			this.collectionRuntimes.set(collection, runtime);
		}
		return runtime;
	}

	private handleDisconnect() {
		for (const runtime of this.collectionRuntimes.values()) {
			runtime.handleDisconnect();
		}
	}
}
