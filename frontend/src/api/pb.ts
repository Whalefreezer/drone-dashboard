import PocketBase from 'pocketbase';
import { Atom, atom, PrimitiveAtom } from 'jotai';
import type { PBBaseRecord } from './pbTypes.ts';
import {
	CollectionSubscriptionSnapshot,
	PBCollectionSubscriptionManager,
	type SubscribeOptions,
	type SubscriptionStatus,
	type SubscriptionStatusPayload,
} from './pbRealtimeManager.ts';

// Optional override to select event without scraping FPVTrackside
const ENV_EVENT_ID = (import.meta.env.VITE_EVENT_ID || '').trim();

// Singleton PocketBase client used across the app
export const pb = new PocketBase(import.meta.env.VITE_API_URL || '/');
pb.autoCancellation(false);

const subscriptionManager = new PBCollectionSubscriptionManager(pb);
const envMeta = (import.meta as unknown as { env?: Record<string, unknown> }).env;
// const isDevBuild = Boolean(envMeta?.DEV);
type DebugWindow = Window & { __PB_DEBUG_SUBSCRIPTIONS?: boolean };
const debugWindow = typeof window !== 'undefined' ? (window as DebugWindow) : undefined;
const PB_DEBUG_LOG = true || Boolean(debugWindow?.__PB_DEBUG_SUBSCRIPTIONS);
const PB_PING_TOPIC = 'pb_ping';

let pingSubscribed = false;
let pingUnsubscribe: (() => void) | undefined;
let pingUnloadListenerAttached = false;

function ensurePingSubscription() {
	if (typeof window === 'undefined' || pingSubscribed) {
		return;
	}

	pingSubscribed = true;
	pb.realtime.subscribe(PB_PING_TOPIC, () => {
		if (PB_DEBUG_LOG) {
			try {
				console.debug('[pbPing]', 'heartbeat received');
			} catch {
				// ignore logging errors
			}
		}
	})
		.then((unsubscribe) => {
			pingUnsubscribe = () => {
				try {
					unsubscribe();
				} catch {
					// ignore unsubscribe errors (connection may already be closed)
				}
				pingUnsubscribe = undefined;
			};
		})
		.catch((error) => {
			pingSubscribed = false;
			if (PB_DEBUG_LOG) {
				try {
					console.warn('[pbPing]', 'subscription failed', error);
				} catch {
					// ignore logging errors
				}
			}
		});

	if (!pingUnloadListenerAttached) {
		pingUnloadListenerAttached = true;
		globalThis.addEventListener('beforeunload', () => {
			pingUnsubscribe?.();
		});
	}
}

ensurePingSubscription();

function debugSnapshot(message: string, payload: Record<string, unknown>) {
	if (!PB_DEBUG_LOG) return;
	try {
		console.debug('[pbSubscribeCollection]', message, payload);
	} catch {
		// ignore logging errors
	}
}

function createInitialSnapshot<T extends PBBaseRecord>(): CollectionSubscriptionSnapshot<T> {
	return {
		records: [],
		status: 'initializing',
		error: null,
		lastSyncedAt: undefined,
	};
}

// --- Auth helpers ---------------------------------------------------------
export type AuthKind = 'user' | 'admin';

export function isAuthenticated(): boolean {
	return pb.authStore?.isValid ?? false;
}

type PBModelMeta = { collectionName?: string; id?: string } | null | undefined;

export function authenticatedKind(): AuthKind | null {
	// Admin tokens have model = null but admins store in pb.authStore.model?.collectionName === '_superusers'
	// Newer PocketBase sets model for both, but admins are accessible via pb.admins collection.
	// We infer by presence of pb.authStore.model?.collectionName === '_superusers' or fallback to token type.
	const model = pb.authStore?.model as PBModelMeta;
	if (!isAuthenticated()) return null;
	if (model && (model.collectionName === '_superusers' || model?.id?.startsWith('admin'))) {
		return 'admin';
	}
	// If model exists and is not _superusers, treat as regular user
	if (model) return 'user';
	// If model is absent but token is valid, assume admin (older SDK behavior)
	return 'admin';
}

export function login(kind: AuthKind, identity: string, password: string) {
	if (kind === 'admin') {
		// Admin login via dedicated endpoint
		return pb.collection('_superusers').authWithPassword(identity, password);
	} else {
		// Regular auth collection login (default collection `users`)
		return pb.collection('users').authWithPassword(identity, password);
	}
}

export function logout() {
	pb.authStore.clear();
}

export function pbSubscribeCollection<T extends PBBaseRecord>(
	collection: string,
	options: SubscribeOptions<T> = {},
): Atom<T[]> {
	const snapshotAtom = getSnapshotAtom(collection, options);
	return atom((get) => get(snapshotAtom).records);
}

export function getEnvEventIdFallback(): string | null {
	return ENV_EVENT_ID || null;
}

export function pbCollectionSnapshotAtom<T extends PBBaseRecord>(
	collection: string,
	options: SubscribeOptions<T> = {},
): Atom<CollectionSubscriptionSnapshot<T>> {
	return getSnapshotAtom(collection, options);
}

export function pbCollectionStatusAtom(
	collection: string,
): Atom<SubscriptionStatusPayload> {
	return getStatusAtom(collection);
}

export function pbInvalidateCollection(collection: string): Promise<void> {
	return subscriptionManager.invalidate(collection);
}

export function pbInvalidateAll(): Promise<void> {
	return subscriptionManager.invalidateAll();
}

export { type SubscriptionStatus };
export type { CollectionSubscriptionSnapshot, SubscribeOptions, SubscriptionStatusPayload };

function resolveOptionsKey(options?: SubscribeOptions<PBBaseRecord>): string {
	if (!options) return 'default';
	if (options.key) return options.key;
	const filterKey = options.filter ?? 'all';
	const predicateKey = options.recordFilter ? options.recordFilter.name || options.recordFilter.toString() : 'pred:none';
	return `${filterKey}::${predicateKey}`;
}

function buildCacheKey(
	collection: string,
	options: SubscribeOptions<PBBaseRecord> | undefined,
	suffix: string,
): string {
	return `${collection}::${resolveOptionsKey(options)}::${suffix}`;
}

type SnapshotAtom = Atom<CollectionSubscriptionSnapshot<PBBaseRecord>>;
type StatusAtom = Atom<SubscriptionStatusPayload>;

const snapshotAtomCache = new Map<string, SnapshotAtom>();
const statusAtomCache = new Map<string, StatusAtom>();

function getSnapshotAtom<T extends PBBaseRecord>(
	collection: string,
	options: SubscribeOptions<T> = {},
): Atom<CollectionSubscriptionSnapshot<T>> {
	const cacheKey = buildCacheKey(collection, options as SubscribeOptions<PBBaseRecord>, 'snapshot');
	if (!snapshotAtomCache.has(cacheKey)) {
		const cached = subscriptionManager.getCachedSnapshot(collection, options);
		const initial = cached ?? createInitialSnapshot<T>();
		const baseAtom = atom<CollectionSubscriptionSnapshot<T>>(initial) as PrimitiveAtom<CollectionSubscriptionSnapshot<T>>;

		baseAtom.onMount = (set) => {
			debugSnapshot('atom mounted', { collection, filter: options.filter ?? null });
			const setSnapshot = set as (value: CollectionSubscriptionSnapshot<T>) => void;
			let active = true;

			const { unsubscribe, initialSnapshotPromise } = subscriptionManager.subscribe(
				collection,
				options,
				(snapshot) => {
					if (!active) return;
					setSnapshot(snapshot as CollectionSubscriptionSnapshot<T>);
				},
			);

			initialSnapshotPromise
				.then((snapshot) => {
					if (!active) return;
					setSnapshot(snapshot);
					debugSnapshot('initial snapshot delivered', { collection, recordCount: snapshot.records.length });
				})
				.catch((error) => {
					if (!active) return;
					const normalizedError = error instanceof Error ? error : new Error(String(error));
					setSnapshot({
						records: [],
						status: 'error',
						error: normalizedError,
						lastSyncedAt: undefined,
					});
					debugSnapshot('initial snapshot error', { collection, error: normalizedError.message });
				});

			return () => {
				debugSnapshot('atom unmounted', { collection, filter: options.filter ?? null });
				active = false;
				unsubscribe();
			};
		};

		snapshotAtomCache.set(cacheKey, baseAtom as SnapshotAtom);
	}

	return snapshotAtomCache.get(cacheKey)! as Atom<CollectionSubscriptionSnapshot<T>>;
}

function getStatusAtom(collection: string): Atom<SubscriptionStatusPayload> {
	const cacheKey = `${collection}::status`;
	if (!statusAtomCache.has(cacheKey)) {
		const initial = subscriptionManager.getCachedStatus(collection) ?? {
			status: 'initializing' as SubscriptionStatus,
			error: null,
			lastSyncedAt: undefined,
		};

		const statusAtom = atom<SubscriptionStatusPayload>(initial);

		statusAtom.onMount = (set) => {
			const { unsubscribe, initialStatus } = subscriptionManager.subscribeStatus(collection, (payload) => {
				set(payload);
			});
			set(initialStatus);
			return () => {
				unsubscribe();
			};
		};

		statusAtomCache.set(cacheKey, statusAtom);
	}

	return statusAtomCache.get(cacheKey)!;
}
