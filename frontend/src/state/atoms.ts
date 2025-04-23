import { Atom, atom, useAtomValue, useSetAtom } from 'jotai';
import { atomWithRefresh, loadable } from 'jotai/utils';
import { Channel, Pilot, RaceEvent } from '../types/types.ts';
import { useEffect, useState } from 'react';
import { atomWithSuspenseQuery } from 'jotai-tanstack-query';
import axios from 'axios';
import { AtomWithSuspenseQueryResult } from 'jotai-tanstack-query';

const UPDATE = true;

export const eventIdAtom = atomWithSuspenseQuery(() => ({
    queryKey: ['eventId'],
    queryFn: async () => {
        const response = await axios.get('/api');
        const text = response.data;

        const match = text.match(
            /var eventManager = new EventManager\("events\/([a-f0-9-]+)"/,
        );
        if (match) {
            return match[1];
        }
        return null;
    },
}));

export const eventDataAtom = atomWithSuspenseQuery((get) => ({
    queryKey: ['eventData'],
    queryFn: async () => {
        const { data: eventId } = await get(eventIdAtom);
        const response = await axios.get(`/api/events/${eventId}/Event.json`);
        return response.data as RaceEvent[];
    },
    refetchInterval: 10_000,
}));

export interface BracketPilot {
    seed: string;
    name: string;
    rounds: (number | null)[];
    points: number;
}

export interface Bracket {
    name: string;
    pilots: BracketPilot[];
}

export const bracketsDataAtom = atomWithSuspenseQuery<Bracket[]>(() => ({
    queryKey: ['bracketsData'],
    queryFn: () => {
        // const response = await axios.get(`/brackets/groups/0`);
        // return response.data as Bracket[];
        return [] as Bracket[];
    },
    // staleTime: 10_000,
    // refetchInterval: 10_000,
}));

export const pilotsAtom = atomWithRefresh(async (get) => {
    const { data: eventId } = await get(eventIdAtom);
    const page = await robustFetch(`/api/events/${eventId}/Pilots.json`);
    const json = await page.json();
    return json as Pilot[];
});

export function useCachedAtom<T>(anAtom: Atom<T>) {
    const [cache, setCache] = useState<T | null>(null);

    const value = useAtomValue(loadable(anAtom));

    if (value.state === 'loading') {
        if (cache === null) {
            throw new Promise(() => {});
        } else {
            return cache;
        }
    }

    if (value.state === 'hasError') {
        throw value.error;
    }

    if (value.state === 'hasData') {
        setCache(value.data);
        return value.data;
    }
}

export const channelsDataAtom = atom(async () => {
    const page = await robustFetch(`/api/httpfiles/Channels.json`);
    const json = await page.json();
    return json as Channel[];
});

async function robustFetch(url: string): Promise<Response> {
    const timeout = 10_000; // 1 second timeout
    const maxRetries = 10;
    let retries = 0;

    while (retries < maxRetries) {
        try {
            const controller = new AbortController();

            // Create a race between the fetch and the timeout
            const response = await Promise.race([
                fetch(url, { signal: controller.signal }),
                new Promise<never>((_, reject) => {
                    setTimeout(() => {
                        controller.abort();
                        reject(new Error('Request timed out'));
                    }, timeout);
                }),
            ]);

            return response;
        } catch (err) {
            retries++;
            if (retries === maxRetries) {
                throw new Error(`Failed to fetch after ${maxRetries} retries: ${err}`);
            }
            // Exponential backoff
            await new Promise((resolve) => setTimeout(resolve, Math.pow(2, retries) * 100));
        }
    }
    throw new Error('should not get here');
}

export const updateAtom = atom<
    (Record<string, { func: () => void; count: number }>)
>({});

export function useUpdater(key: string, updater: () => void) {
    const setUpdate = useSetAtom(updateAtom);
    useEffect(() => {
        setUpdate((update) => {
            update[key] = { func: updater, count: (update[key]?.count ?? 0) + 1 };
            return update;
        });
        return () => {
            setUpdate((update) => {
                update[key].count--;
                if (update[key].count === 0) {
                    delete update[key];
                }
                return update;
            });
        };
    }, [updater]);
}

export function useUpdate() {
    const update = useAtomValue(updateAtom);
    useEffect(() => {
        const interval = setInterval(() => {
            for (const updater of Object.values(update)) {
                updater.func();
            }
        }, 1000);
        return () => clearInterval(interval);
    }, [update]);
}

// Add this new type and hook near the top of the file
type QueryAtom<T> = Atom<T>;

export function useQueryAtom<T>(queryAtom: Atom<AtomWithSuspenseQueryResult<T, Error>>): T {
    const { data } = useAtomValue(queryAtom);
    return data;
}

export function usePeriodicUpdate(updateFn: () => void, interval: number) {
    useEffect(() => {
        if (UPDATE) {
            updateFn(); // Initial update
            const intervalId = setInterval(updateFn, interval);
            return () => clearInterval(intervalId);
        }
    }, [updateFn, interval]);
}
