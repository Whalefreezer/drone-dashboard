import PocketBase from 'npm:pocketbase';
import { Atom, atom } from 'jotai';
import { PBBaseRecord } from './pbTypes.ts';

export const usePB: boolean = String(import.meta.env.VITE_USE_PB || '').toLowerCase() === 'true';
export const usePBRace: boolean =
    String(import.meta.env.VITE_USE_PB_RACE || '').toLowerCase() === 'true';

// Optional override to select event without scraping FPVTrackside
const ENV_EVENT_ID = (import.meta.env.VITE_EVENT_ID || '').trim();

const pb = new PocketBase('/api');
pb.autoCancellation(false);

export function pbSubscribeByID<T extends PBBaseRecord>(collection: string, id: string): Atom<Promise<T>> {
    const overrideAtom = atom<T | null>(null);
    const anAtom = atom<Promise<T>, [T], void>(
        async (get) => {
            return get(overrideAtom) ?? await pb.collection<T>(collection).getOne(id);
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

export function pbSubscribeCollection<T extends PBBaseRecord>(collection: string): Atom<T[]> {
    const anAtom = atom<T[]>([]);
    anAtom.onMount = (set) => {
        const unsubscribePromise = pb.collection<T>(collection).subscribe('*', (e) => {
            set((prev) => {
                const items = [...prev];
                if (e.action === 'create' || e.action === 'update') {
                    const i = items.findIndex((r) => r.id === e.record.id);
                    if (i !== -1) items[i] = e.record as T; else items.push(e.record as T);
                    return items;
                }
                if (e.action === 'delete') return items.filter((r) => r.id !== e.record.id);
                return items;
            });
        });
        return () => { unsubscribePromise.then((unsub) => unsub()); };
    };
    return anAtom;
}


export function getEnvEventIdFallback(): string | null {
    return ENV_EVENT_ID || null;
}
