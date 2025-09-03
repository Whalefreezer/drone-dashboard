import PocketBase, { RecordSubscription } from 'npm:pocketbase';
import { Atom, atom } from 'jotai';
import { PBBaseRecord } from './pbTypes.ts';
import { batchDebounce } from '../common/utils.ts';

export const usePB: boolean = String(import.meta.env.VITE_USE_PB || '').toLowerCase() === 'true';
export const usePBRace: boolean = String(import.meta.env.VITE_USE_PB_RACE || '').toLowerCase() === 'true';

// Optional override to select event without scraping FPVTrackside
const ENV_EVENT_ID = (import.meta.env.VITE_EVENT_ID || '').trim();

const pb = new PocketBase();
pb.autoCancellation(false);

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
    const anAtom = atom<Promise<T[]> | T[], [(prev: T[] | null) => T[]], void>(
        (get, { setSelf }) => {
            const override = get(overrideAtom);
            if (override) return override;
            return pb.collection<T>(collection).getList(1, 10_000).then((r) => {
                setSelf(() => r.items);
                return r.items;
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
