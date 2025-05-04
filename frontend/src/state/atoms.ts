import { Atom, atom, useAtomValue, useSetAtom } from 'jotai';
import { atomFamily, atomWithRefresh, loadable } from 'jotai/utils';
import { Channel, Pilot, Race, RaceEvent, Round } from '../types/types.ts';
import { Bracket, BracketPilot, EliminatedPilot } from '../bracket/bracket-types.ts';
import { useEffect, useState } from 'react';
import { atomWithSuspenseQuery } from 'jotai-tanstack-query';
import axios from 'axios';
import { AtomWithSuspenseQueryResult } from 'jotai-tanstack-query';
import { calculateBestTimes, calculateRacesUntilNext } from '../common/utils.ts';

const UPDATE = true;

export const eventIdAtom = atomWithSuspenseQuery(() => ({
    queryKey: ['eventId'],
    queryFn: async () => {
        const response = await axios.get('/api');
        const text = response.data;

        const match = text.match(
            /var eventManager = new EventManager\("events\/([a-z0-9-]+)"/,
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
    const page = await axios.get(`/api/events/${eventId}/Pilots.json`);
    const json = page.data;
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
    const page = await axios.get(`/api/httpfiles/Channels.json`);
    const json = page.data;
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

export const roundsDataAtom = atomWithRefresh(async (get) => {
    const { data: eventId } = await get(eventIdAtom);
    const page = await axios.get(`/api/events/${eventId}/Rounds.json`);
    const json = page.data;
    return json as Round[];
});

export const racesAtom = atom(async (get) => {
    const { data: event } = await get(eventDataAtom);
    let races = await Promise.all(event[0].Races.map(async (raceId) => {
        return await get(raceFamilyAtom(raceId));
    }));
    races = races.filter((race) => race.Valid);

    const rounds = await get(roundsDataAtom);

    orderRaces(races, rounds);

    return races;
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

export const raceFamilyAtom = atomFamily((raceId: string) =>
    atomWithRefresh(async (get) => {
        const { data: eventId } = await get(eventIdAtom);
        const page = await axios.get(`/api/events/${eventId}/${raceId}/Race.json`);
        const json = page.data;
        const race = json[0] as Race;

        const processedLaps = race.Laps
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
                };
            })
            .filter((lap): lap is ProcessedLap => lap !== null)
            .sort((a, b) => a.lapNumber - b.lapNumber);

        return {
            ...race,
            processedLaps,
        } as RaceWithProcessedLaps;
    })
);

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

export function usePeriodicUpdate(updateFn: () => void, interval: number) {
    useEffect(() => {
        if (UPDATE) {
            updateFn(); // Initial update
            const intervalId = setInterval(updateFn, interval);
            return () => clearInterval(intervalId);
        }
    }, [updateFn, interval]);
}

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
