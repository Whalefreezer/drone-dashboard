import { atom } from 'jotai';
import { atomFamily } from 'jotai/utils';
import { Channel, Pilot, Race, RaceEvent, Round } from '../types/index.ts';
import { Bracket } from '../bracket/bracket-types.ts';
import { atomWithSuspenseQuery } from 'jotai-tanstack-query';
import { pbFetchChannels, pbFetchEvent, pbFetchPilots, pbFetchRace, pbFetchRounds, getEnvEventIdFallback, pbGetCurrentEvent } from '../api/pb.ts';
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

export const eventIdAtom = atomWithSuspenseQuery(() => ({
    queryKey: ['eventId'],
    queryFn: async () => {
        // Allow explicit override via env when using PB
        const envId = getEnvEventIdFallback();
        if (envId) return envId;
        const event = await pbGetCurrentEvent();
        return event?.ID ?? null;
    },
}));

export const eventDataAtom = atomWithSuspenseQuery<RaceEvent[]>((get) => ({
    queryKey: ['eventData'],
    queryFn: async () => {
        const { data: eventId } = await get(eventIdAtom);
        return await pbFetchEvent(eventId!);
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
