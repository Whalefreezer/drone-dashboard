import { atom } from 'jotai';
import { atomFamily } from 'jotai/utils';
import { Channel, Pilot, Race, RaceEvent, Round } from '../types/index.ts';
import { Bracket } from '../bracket/bracket-types.ts';
import { atomWithSuspenseQuery } from 'jotai-tanstack-query';
import { pbFetchChannels, pbFetchEvent, pbFetchPilots, pbFetchRace, pbFetchRounds, getEnvEventIdFallback, pbGetCurrentEvent, pbSubscribeRecord, pbSubscribeRecords, pbSubscribeCollection, PBRaceEvent } from '../api/pb.ts';
import { findIndexOfCurrentRace } from '../common/index.ts';
import { 
    ProcessedLap, 
    RaceWithProcessedLaps, 
    OverallBestTimes,
    useCachedAtom,
    updateAtom,
    useUpdater,
    isRaceActive,
    calculateProcessedLaps,
    orderRaces,
    findEliminatedPilots,
    calculateOverallBestTimes
} from './commonAtoms.ts';



const eventsAtom = pbSubscribeCollection<PBRaceEvent>('events');

const currentEventAtom = atom((get) => {
    const events = get(eventsAtom);
    const currentEvent = events.find((event) => event.isCurrent);

    return currentEvent;
});

export const eventDataAtom = atomWithSuspenseQuery<RaceEvent[]>((get) => ({
    queryKey: ['eventData'],
    queryFn: async () => {
        const currentEvent = get(currentEventAtom);
        return await pbFetchEvent(currentEvent!.sourceId);
    },
    refetchInterval: 10_000,
}));

export const consecutiveLapsAtom = atom(async (get) => {
    const { data: eventData } = await get(eventDataAtom);
    return eventData[0]?.PBLaps ?? 3; // Default to 3 if not available
});

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

export const pilotsAtom = atomWithSuspenseQuery<Pilot[]>((get) => ({
    queryKey: ['pilots'],
    queryFn: async () => {
        const { data: eventId } = await get(eventIdAtom);
        return await pbFetchPilots(eventId!);
    },
    staleTime: 10_000,
    refetchInterval: 10_000,
}));

// Re-export from common
export { useCachedAtom };

export const channelsDataAtom = atom(async () => {
    return await pbFetchChannels();
});

export const roundsDataAtom = atomWithSuspenseQuery<Round[]>((get) => ({
    queryKey: ['roundsData'],
    queryFn: async () => {
        const { data: eventId } = await get(eventIdAtom);
        return await pbFetchRounds(eventId!);
    },
    staleTime: 10_000,
    refetchInterval: 10_000,
}));

export const racesAtom = atom(async (get) => {
    const {data: event} = await get(eventDataAtom);
    let races = await Promise.all(event[0].Races.map(async (raceId) => {
        const { data } = await get(raceFamilyAtom(raceId));
        return data;
    }));
    races = races.filter((race) => race.Valid);

    const { data: rounds } = await get(roundsDataAtom);

    orderRaces(races, rounds);

    return races;
});

export const currentRaceAtom = atom(async (get) => {
    const races = await get(racesAtom);
    const currentRace = findIndexOfCurrentRace(races);
    return races[currentRace];
});

// Re-export types and functions from common
export type { ProcessedLap, RaceWithProcessedLaps, OverallBestTimes };
export { orderRaces, isRaceActive, calculateProcessedLaps };

// Synchronous signal for current race ID, updated by UI once data is available.
// This allows other atoms to read the current race context without awaiting async atoms.
export const currentRaceIdSignalAtom = atom<string | null>(null);

export const raceFamilyAtom = atomFamily((raceId: string) => {
    return atomWithSuspenseQuery<RaceWithProcessedLaps>((get) => {
        // Read a synchronous signal for current race id, if available.
        const currentRaceId = get(currentRaceIdSignalAtom);
        const isCurrent = currentRaceId === raceId;
        return ({
            queryKey: ['race', raceId],
            queryFn: async () => {
                const { data: eventId } = await get(eventIdAtom);
                const arr = await pbFetchRace(eventId!, raceId);
                const race = arr[0] as Race;

                const processedLaps = calculateProcessedLaps(race);

                return {
                    ...race,
                    processedLaps,
                } as RaceWithProcessedLaps;
            },
            // Prefer current race context if known; otherwise infer from race Start/End
            refetchInterval: (query) => {
                if (isCurrent !== null) {
                    return isCurrent ? 500 : 10000;
                }
                const data = query.state.data as RaceWithProcessedLaps | undefined;
                return isRaceActive(data) ? 500 : 10000;
            },
            staleTime: (query) => {
                if (isCurrent !== null) {
                    return isCurrent ? 0 : 10000;
                }
                const data = query.state.data as RaceWithProcessedLaps | undefined;
                return isRaceActive(data) ? 0 : 10000;
            },
        });
    });
});

// Re-export from common
export { updateAtom, useUpdater, findEliminatedPilots };

export const overallBestTimesAtom = atom(async (get) => {
    const races = await get(racesAtom);
    return calculateOverallBestTimes(races);
});

// Example usage of the new PocketBase subscription atoms with Suspense support
// These atoms automatically handle initial loading and real-time updates

// Subscribe to all events with real-time updates
export const eventsSubscriptionAtom = pbSubscribeRecords('events', {
    filter: 'active = true',
    sort: 'name'
});

// Subscribe to a specific current event
export const currentEventSubscriptionAtom = atom(async (get) => {
    const { data: eventId } = await get(eventIdAtom);
    if (!eventId) return null;
    
    // Create a dynamic subscription atom for the current event
    return pbSubscribeRecord('events', eventId, { expand: 'rounds,races' });
});

// Subscribe to pilots with real-time updates
export const pilotsSubscriptionAtom = pbSubscribeRecords('pilots', {
    sort: 'name'
});

// Example of how to use these in a React component:
/*
import { useAtomValue } from 'jotai';
import { Suspense } from 'react';

function EventsList() {
    const events = useAtomValue(eventsSubscriptionAtom);
    return (
        <ul>
            {events.map(event => (
                <li key={event.id}>{event.name}</li>
            ))}
        </ul>
    );
}

function PilotsList() {
    const pilots = useAtomValue(pilotsSubscriptionAtom);
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
        <div>
            <Suspense fallback={<div>Loading events...</div>}>
                <EventsList />
            </Suspense>
            <Suspense fallback={<div>Loading pilots...</div>}>
                <PilotsList />
            </Suspense>
        </div>
    );
}
*/
