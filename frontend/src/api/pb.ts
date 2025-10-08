import PocketBase, { RecordSubscription } from 'pocketbase';
import { Atom, atom } from 'jotai';
import { PBBaseRecord } from './pbTypes.ts';
import { batchDebounce } from '../common/utils.ts';

export const usePB: boolean = String(import.meta.env.VITE_USE_PB || '').toLowerCase() === 'true';
export const usePBRace: boolean = String(import.meta.env.VITE_USE_PB_RACE || '').toLowerCase() === 'true';

// Optional override to select event without scraping FPVTrackside
const ENV_EVENT_ID = (import.meta.env.VITE_EVENT_ID || '').trim();

// Singleton PocketBase client used across the app
export const pb = new PocketBase(import.meta.env.VITE_API_URL || '/');
pb.autoCancellation(false);

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

export function pbSubscribeByID<T extends PBBaseRecord>(
	collection: string,
	id: string,
): Atom<Promise<T> | T> {
	const overrideAtom = atom<T | null>(null);
	const anAtom = atom<Promise<T> | T, [T], void>(
		(get, { setSelf }) => {
			const override = get(overrideAtom);
			if (override) return override;
			return pb.collection<T>(collection).getOne(id).then((r) => {
				setSelf(r);
				return r;
			});
		},
		(get, set, update) => {
			set(overrideAtom, update);
		},
	);

	anAtom.onMount = (set) => {
		console.log(`Subscribing to ${collection}:${id}`);

		const unsubscribePromise = pb.collection<T>(collection).subscribe(id, (e) => {
			console.log(`Subscription event for ${collection}:${id}`, e.action);
			if (e.action === 'create' || e.action === 'update') {
				set(e.record as T);
			} else if (e.action === 'delete') {
				// setAtom(null);
			}
		});

		return () => {
			unsubscribePromise.then((unsub) => unsub());
		};
	};

	return anAtom;
}

export function pbSubscribeCollection<T extends PBBaseRecord>(
	collection: string,
): Atom<Promise<T[]> | T[]> {
	const overrideAtom = atom<T[] | null>(null);
	const fetchAllPages = async (): Promise<T[]> => {
		const perPage = 1_000;
		let page = 1;
		let totalPages = 1;
		const allItems: T[] = [];

		while (true) {
			const response = await pb.collection<T>(collection).getList(page, perPage);
			totalPages = Math.max(response.totalPages, 1);
			allItems.push(...response.items);
			if (page >= totalPages || response.items.length === 0) break;
			page += 1;
		}

		return allItems;
	};

	const anAtom = atom<Promise<T[]> | T[], [(prev: T[] | null) => T[]], void>(
		(get, { setSelf }) => {
			const override = get(overrideAtom);
			if (override) return override;
			return fetchAllPages().then((items) => {
				setSelf((prev) => {
					if (!prev || prev.length === 0) return items;
					const merged = new Map<string, T>();
					for (const item of items) merged.set(item.id, item);
					for (const item of prev) merged.set(item.id, item);
					return Array.from(merged.values());
				});
				return items;
			});
		},
		(get, set, update) => {
			set(overrideAtom, update(get(overrideAtom)));
		},
	);

	anAtom.onMount = (set) => {
		const debouncedSet = batchDebounce((eventCalls: [RecordSubscription<T>][]) => {
			set((prev: T[] | null) => {
				let items = prev ? [...prev] : [];

				// Process all collected events in order
				for (const [event] of eventCalls) {
					if (event.action === 'create' || event.action === 'update') {
						const i = items.findIndex((item) => item.id === event.record.id);
						if (i !== -1) items[i] = event.record as T;
						else items.push(event.record as T);
					} else if (event.action === 'delete') {
						items = items.filter((item) => item.id !== event.record.id);
					}
				}

				return items;
			});
		}, 10);

		const unsubscribePromise = pb.collection<T>(collection).subscribe('*', debouncedSet);

		return () => {
			debouncedSet.cancel();
			unsubscribePromise.then((unsub) => unsub());
		};
	};
	return anAtom;
}

export function getEnvEventIdFallback(): string | null {
	return ENV_EVENT_ID || null;
}
