import { Atom, atom } from 'jotai';
import PocketBase from 'npm:pocketbase';

type PBRecord = { id: string; sourceId: string } & Record<string, unknown>;

const pb = new PocketBase('/api');
pb.autoCancellation(false);

/**
 * Creates a Jotai atom that handles PocketBase subscriptions with React Suspense support.
 * 
 * This atom:
 * 1. Returns a Promise initially for React Suspense to handle loading states
 * 2. Performs an initial query to fetch data
 * 3. Subscribes to real-time updates
 * 4. Properly manages subscription lifecycle (subscribe/unsubscribe)
 * 
 * @param collection - PocketBase collection name
 * @param id - Record ID to subscribe to (optional, if not provided subscribes to entire collection)
 * @param options - Optional parameters for filtering, sorting, etc.
 */
export function pbSubscribeWithSuspense<T extends PBRecord = PBRecord>(
    collection: string,
    id?: string,
    options: { filter?: string; sort?: string; expand?: string } = {}
) {
    // Create a primitive atom to store the promise
    const promiseAtom = atom<Promise<T | T[] | null>>(
        // Initial promise for React Suspense
        (async () => {
            try {
                if (id) {
                    // Subscribe to specific record
                    const record = await pb.collection<T>(collection).getOne(id, {
                        expand: options.expand,
                    });
                    return record as T;
                } else {
                    // Subscribe to collection
                    const result = await pb.collection<T>(collection).getList(1, 200, {
                        filter: options.filter,
                        sort: options.sort,
                        expand: options.expand,
                    });
                    return result.items as T[];
                }
            } catch (error) {
                console.error(`Failed to fetch ${collection}${id ? `:${id}` : ''}`, error);
                return id ? null : ([] as T[]);
            }
        })()
    );

    // Set up subscription when atom is mounted
    promiseAtom.onMount = (setAtom) => {
        console.log(`Subscribing to ${collection}${id ? `:${id}` : ''} with Suspense`);
        let unsubscribe: (() => void) | null = null;
        let currentData: T | T[] | null = null;

        // Perform initial fetch and update the atom
        const performInitialFetch = async () => {
            try {
                if (id) {
                    const record = await pb.collection<T>(collection).getOne(id, {
                        expand: options.expand,
                    });
                    currentData = record as T;
                    setAtom(Promise.resolve(currentData));
                } else {
                    const result = await pb.collection<T>(collection).getList(1, 200, {
                        filter: options.filter,
                        sort: options.sort,
                        expand: options.expand,
                    });
                    currentData = result.items as T[];
                    setAtom(Promise.resolve(currentData));
                }
            } catch (error) {
                console.error(`Failed to fetch ${collection}${id ? `:${id}` : ''}`, error);
                const fallback = id ? null : ([] as T[]);
                currentData = fallback;
                setAtom(Promise.resolve(fallback));
            }
        };

        // Subscribe to real-time updates
        const subscribeToUpdates = async () => {
            try {
                const subscriptionTarget = id || '*';
                const unsubscribeFunction = await pb.collection<T>(collection).subscribe(subscriptionTarget, (e) => {
                    console.log(`Subscription event for ${collection}${id ? `:${id}` : ''}`, e.action, e.record?.id);
                    
                    if (id) {
                        // Single record subscription
                        if (e.action === 'create' || e.action === 'update') {
                            currentData = e.record as T;
                            setAtom(Promise.resolve(currentData));
                        } else if (e.action === 'delete') {
                            currentData = null;
                            setAtom(Promise.resolve(null));
                        }
                    } else {
                        // Collection subscription
                        if (!Array.isArray(currentData)) {
                            currentData = [] as T[];
                        }
                        
                        if (e.action === 'create') {
                            currentData = [...(currentData as T[]), e.record as T];
                            setAtom(Promise.resolve(currentData));
                        } else if (e.action === 'update') {
                            currentData = (currentData as T[]).map(item => 
                                item.id === e.record?.id ? e.record as T : item
                            );
                            setAtom(Promise.resolve(currentData));
                        } else if (e.action === 'delete') {
                            currentData = (currentData as T[]).filter(item => item.id !== e.record?.id);
                            setAtom(Promise.resolve(currentData));
                        }
                    }
                }, {
                    expand: options.expand,
                });
                
                unsubscribe = unsubscribeFunction;
            } catch (error) {
                console.error(`Failed to subscribe to ${collection}${id ? `:${id}` : ''}`, error);
            }
        };

        // Initialize
        performInitialFetch();
        subscribeToUpdates();

        // Cleanup function
        return () => {
            console.log(`Unsubscribing from ${collection}${id ? `:${id}` : ''}`);
            if (unsubscribe) {
                try {
                    unsubscribe();
                } catch (error) {
                    console.error(`Error unsubscribing from ${collection}${id ? `:${id}` : ''}`, error);
                }
            }
        };
    };

    return promiseAtom;
}

// Convenience functions for common use cases
export function pbSubscribeRecord<T extends PBRecord = PBRecord>(
    collection: string, 
    id: string, 
    options: { expand?: string } = {}
) {
    return pbSubscribeWithSuspense<T>(collection, id, options);
}

export function pbSubscribeRecords<T extends PBRecord = PBRecord>(
    collection: string, 
    options: { filter?: string; sort?: string; expand?: string } = {}
) {
    return pbSubscribeWithSuspense<T>(collection, undefined, options);
}


function pbSubscribeByID(collection: string, id: string): Atom<PBRecord | null> {
    const anAtom = atom<PBRecord | null>(null);

    anAtom.onMount = (setAtom) => {
        console.log(`Subscribing to ${collection}:${id}`);
        let unsubscribe: (() => void) | null = null;

        // Initial fetch
        pb.collection<PBRecord>(collection).getOne(id)
            .then((rec) => {
                setAtom(rec as PBRecord);
            })
            .catch((error) => {
                console.error(`Failed to fetch ${collection}:${id}`, error);
                setAtom(null);
            });

        // Subscribe to changes
        pb.collection<PBRecord>(collection).subscribe(id, (e) => {
            console.log(`Subscription event for ${collection}:${id}`, e.action);
            if (e.action === 'create' || e.action === 'update') {
                setAtom(e.record as PBRecord);
            } else if (e.action === 'delete') {
                setAtom(null);
            }
        }).then((unsub) => {
            unsubscribe = unsub;
        }).catch((error) => {
            console.error(`Failed to subscribe to ${collection}:${id}`, error);
        });

        // Cleanup function
        return () => {
            console.log(`Unsubscribing from ${collection}:${id}`);
            if (unsubscribe) {
                try {
                    unsubscribe();
                } catch (error) {
                    console.error(`Error unsubscribing from ${collection}:${id}`, error);
                }
            }
        };
    };

    return anAtom;
}

function pbSubscribeCollection(collection: string): Atom<PBRecord[]> {
    const anAtom = atom<PBRecord[]>([]);

    anAtom.onMount = (setAtom) => {
        console.log(`Subscribing to collection ${collection}`);
        let unsubscribe: (() => void) | null = null;
        let currentItems: PBRecord[] = [];

        // Initial fetch
        pb.collection<PBRecord>(collection).getList(1, 200)
            .then((result) => {
                currentItems = result.items as PBRecord[];
                setAtom(currentItems);
            })
            .catch((error) => {
                console.error(`Failed to fetch collection ${collection}`, error);
                setAtom([]);
            });

        // Subscribe to changes
        pb.collection<PBRecord>(collection).subscribe('*', (e) => {
            console.log(`Collection subscription event for ${collection}`, e.action, e.record?.id);

            if (e.action === 'create') {
                currentItems = [...currentItems, e.record as PBRecord];
                setAtom(currentItems);
            } else if (e.action === 'update') {
                currentItems = currentItems.map((item) =>
                    item.id === e.record?.id ? e.record as PBRecord : item
                );
                setAtom(currentItems);
            } else if (e.action === 'delete') {
                currentItems = currentItems.filter((item) => item.id !== e.record?.id);
                setAtom(currentItems);
            }
        }).then((unsub) => {
            unsubscribe = unsub;
        }).catch((error) => {
            console.error(`Failed to subscribe to collection ${collection}`, error);
        });

        // Cleanup function
        return () => {
            console.log(`Unsubscribing from collection ${collection}`);
            if (unsubscribe) {
                try {
                    unsubscribe();
                } catch (error) {
                    console.error(`Error unsubscribing from collection ${collection}`, error);
                }
            }
        };
    };

    return anAtom;
}


// Example usage:
/*
import { useAtomValue } from 'jotai';
import { Suspense } from 'react';

// For a specific record
const eventAtom = pbSubscribeRecord('events', 'some-event-id');

// For a collection
const pilotsAtom = pbSubscribeRecords('pilots', { 
    filter: 'active = true', 
    sort: 'name' 
});

function EventDetails() {
    const event = useAtomValue(eventAtom);
    return <div>Event: {event?.name}</div>;
}

function PilotsList() {
    const pilots = useAtomValue(pilotsAtom);
    return (
        <ul>
            {pilots.map(pilot => (
                <li key={pilot.id}>{pilot.name}</li>
            ))}
        </ul>
    );
}

function App() {
    return (
        <Suspense fallback={<div>Loading...</div>}>
            <EventDetails />
            <PilotsList />
        </Suspense>
    );
}
*/
