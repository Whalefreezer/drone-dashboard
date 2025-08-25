import { Atom, atom, useAtomValue, useSetAtom } from 'jotai';
import { atomFamily, loadable } from 'jotai/utils';
import { Channel, Pilot, Race, RaceEvent, Round } from '../types/index.ts';
import { Bracket, EliminatedPilot } from '../bracket/bracket-types.ts';
import { useEffect, useState } from 'react';
import { atomWithSuspenseQuery } from 'jotai-tanstack-query';
import axios from 'axios';
import { usePB, usePBRace, pbFetchChannels, pbFetchEvent, pbFetchPilots, pbFetchRace, pbFetchRounds, getEnvEventIdFallback, pbGetCurrentEvent } from '../api/pb.ts';
import { findIndexOfCurrentRace } from '../common/index.ts';

export const eventIdAtom = atomWithSuspenseQuery(() => ({
    queryKey: ['eventId'],
    queryFn: async () => {
        // Allow explicit override via env when using PB
        const envId = getEnvEventIdFallback();
        if (envId) return envId;
        if (usePB) {
            const event = await pbGetCurrentEvent();
            return event?.ID ?? null;
        }
        const response = await axios.get('/fpv-api');
        const text = response.data;
        const match = text.match(/var eventManager = new EventManager\("events\/([a-z0-9-]+)"/);
        if (match) return match[1];
        return null;
    },
}));

export const eventDataAtom = atomWithSuspenseQuery<RaceEvent[]>((get) => ({
    queryKey: ['eventData'],
    queryFn: async () => {
        const { data: eventId } = await get(eventIdAtom);
        if (usePB) {
            return await pbFetchEvent(eventId!);
        } else {
            const response = await axios.get(`/api/events/${eventId}/Event.json`);
            return response.data as RaceEvent[];
        }
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
        if (usePB) {
            return await pbFetchPilots(eventId!);
        } else {
            const page = await axios.get(`/api/events/${eventId}/Pilots.json`);
            return page.data as Pilot[];
        }
    },
    staleTime: 10_000,
    refetchInterval: 10_000,
}));

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
    if (usePB) {
        return await pbFetchChannels();
    } else {
        const page = await axios.get(`/api/httpfiles/Channels.json`);
        const json = page.data;
        return json as Channel[];
    }
});

export const roundsDataAtom = atomWithSuspenseQuery<Round[]>((get) => ({
    queryKey: ['roundsData'],
    queryFn: async () => {
        const { data: eventId } = await get(eventIdAtom);
        if (usePB) {
            return await pbFetchRounds(eventId!);
        } else {
            const page = await axios.get(`/api/events/${eventId}/Rounds.json`);
            return page.data as Round[];
        }
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


function orderRaces(races: Race[], rounds: Round[]) {
    return races.sort((a, b) => {
        const aRound = rounds.find((r) => r.ID === a.Round);
        const bRound = rounds.find((r) => r.ID === b.Round);
        const orderDiff = (aRound?.Order ?? 0) - (bRound?.Order ?? 0);
        if (orderDiff !== 0) return orderDiff;
        return (a.RaceNumber ?? 0) - (b.RaceNumber ?? 0);
    });
}

export interface ProcessedLap {
    id: string;
    lapNumber: number;
    lengthSeconds: number;
    pilotId: string;
    valid: boolean;
    startTime: string;
    endTime: string;
    isHoleshot: boolean;
}

export interface RaceWithProcessedLaps extends Race {
    processedLaps: ProcessedLap[];
}

/**
 * Determines if a race is currently active (started but not ended)
 */
function isRaceActive(race: RaceWithProcessedLaps | undefined): boolean {
    if (!race) return false;
    const started = !!race.Start && !String(race.Start).startsWith('0');
    const ended = !!race.End && !String(race.End).startsWith('0');
    const raceStarted = started && !ended;
    return raceStarted;
}

/**
 * Calculates processed laps from a race, filtering out invalid detections and sorting by lap number
 */
function calculateProcessedLaps(race: Race): ProcessedLap[] {
    return race.Laps
        .map((lap) => {
            const detection = race.Detections.find((d) => lap.Detection === d.ID);
            if (!detection || !detection.Valid) return null;

            return {
                id: lap.ID,
                lapNumber: lap.LapNumber,
                lengthSeconds: lap.LengthSeconds,
                pilotId: detection.Pilot,
                valid: true,
                startTime: lap.StartTime,
                endTime: lap.EndTime,
                isHoleshot: detection.IsHoleshot,
            } as ProcessedLap;
        })
        .filter((lap): lap is ProcessedLap => lap !== null)
        .sort((a, b) => a.lapNumber - b.lapNumber);
}

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
                let race: Race;
                if (usePB && usePBRace) {
                    const arr = await pbFetchRace(eventId!, raceId);
                    race = arr[0] as Race;
                } else {
                    const page = await axios.get(`/api/events/${eventId}/${raceId}/Race.json`);
                    const json = page.data;
                    race = json[0] as Race;
                }

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

// export function useUpdate() {
//     const update = useAtomValue(updateAtom);
//     useEffect(() => {
//         const interval = setInterval(() => {
//             for (const updater of Object.values(update)) {
//                 updater.func();
//             }
//         }, 1000);
//         return () => clearInterval(interval);
//     }, [update]);
// }

export interface OverallBestTimes {
    overallFastestLap: number;
    pilotBestLaps: Map<string, number>;
}

export const overallBestTimesAtom = atom(async (get) => {
    const races = await get(racesAtom);

    const overallBestTimes: OverallBestTimes = {
        overallFastestLap: Infinity,
        pilotBestLaps: new Map(),
    };

    races.forEach((race) => {
        race.processedLaps.forEach((lap) => {
            if (!lap.isHoleshot) {
                // Update overall fastest
                if (lap.lengthSeconds < overallBestTimes.overallFastestLap) {
                    overallBestTimes.overallFastestLap = lap.lengthSeconds;
                }

                // Update pilot's personal best
                const currentBest = overallBestTimes.pilotBestLaps.get(lap.pilotId) ?? Infinity;
                if (lap.lengthSeconds < currentBest) {
                    overallBestTimes.pilotBestLaps.set(lap.pilotId, lap.lengthSeconds);
                }
            }
        });
    });

    return overallBestTimes;
});

// usePeriodicUpdate has been deprecated in favor of query refetch intervals

export function findEliminatedPilots(brackets: Bracket[]): EliminatedPilot[] {
    const eliminatedPilots: EliminatedPilot[] = [];

    brackets.forEach((bracket) => {
        // Check if bracket is complete by verifying all pilots have all rounds filled
        const isComplete = bracket.pilots.every((pilot) =>
            pilot.rounds.every((round) => round !== null)
        );

        if (isComplete) {
            // Sort pilots by points to find bottom two
            const sortedPilots = [...bracket.pilots].sort((a, b) => a.points - b.points);
            const bottomTwo = sortedPilots.slice(0, 2);

            // Add bottom two pilots to eliminated list
            bottomTwo.forEach((pilot, index) => {
                eliminatedPilots.push({
                    name: pilot.name,
                    bracket: bracket.name,
                    position: sortedPilots.length - 1 - index, // Convert to position from bottom
                    points: pilot.points,
                });
            });
        }
    });

    return eliminatedPilots;
}
