import { Atom, atom, useAtomValue, useSetAtom } from 'jotai';
import { atomFamily, atomWithRefresh, loadable } from 'jotai/utils';
import { Channel, Pilot, Race, RaceEvent, Round } from '../types/types.ts';
import { useEffect, useState } from 'react';
import { atomWithSuspenseQuery } from 'jotai-tanstack-query';
import axios from 'axios';
import { AtomWithSuspenseQueryResult } from 'jotai-tanstack-query';
import { calculateBestTimes, calculateRacesUntilNext } from '../common/utils.ts';
import { defaultLeaderboardSortConfig, sortLeaderboard } from '../race/race-utils.ts';

const UPDATE = true;

const eventIdAtom = atomWithSuspenseQuery(() => ({
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

export const roundsDataAtom = atomWithRefresh(async (get) => {
    const { data: eventId } = await get(eventIdAtom);
    const page = await robustFetch(`/api/events/${eventId}/Rounds.json`);
    const json = await page.json();
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
        const page = await fetch(`/api/events/${eventId}/${raceId}/Race.json`);
        const json = await page.json();
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

// Add this new type and hook near the top of the file
type QueryAtom<T> = Atom<{ data: T }>;

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

export interface LeaderboardEntry {
    pilot: Pilot;
    bestLap: {
        time: number;
        roundId: string;
        raceNumber: number;
    } | null;
    consecutiveLaps: {
        time: number;
        roundId: string;
        raceNumber: number;
    } | null;
    bestHoleshot: {
        time: number;
        roundId: string;
        raceNumber: number;
    } | null;
    channel: Channel | null;
    racesUntilNext: number;
    totalLaps: number;
    eliminatedInfo: {
        bracket: string;
        position: number;
        points: number;
    } | null;
}

export function calculateLeaderboardData(
    races: RaceWithProcessedLaps[],
    pilots: Pilot[],
    channels: Channel[],
    currentRaceIndex: number,
    brackets: Bracket[] = [],
): LeaderboardEntry[] {
    // Calculate best times
    const { overallFastestLaps, fastestConsecutiveLaps, pilotChannels, fastestHoleshots } =
        calculateBestTimes(races);

    // Get pilots that are explicitly listed in race PilotChannels
    const scheduledPilots = new Set<string>();
    races.forEach((race) => {
        race.PilotChannels.forEach((pc) => {
            scheduledPilots.add(pc.Pilot);
        });
    });

    // Calculate races until next race for each pilot
    const racesUntilNext = new Map<string, number>();
    if (currentRaceIndex >= 0 && currentRaceIndex < races.length) {
        pilots.forEach((pilot) => {
            racesUntilNext.set(
                pilot.ID,
                calculateRacesUntilNext(races, currentRaceIndex, pilot.ID),
            );
        });
    }

    // Calculate total laps for each pilot
    const totalLaps = new Map<string, number>();
    races.forEach((race) => {
        race.processedLaps.forEach((lap) => {
            if (!lap.isHoleshot) {
                totalLaps.set(lap.pilotId, (totalLaps.get(lap.pilotId) || 0) + 1);
            }
        });
    });

    // Get eliminated pilots information
    const eliminatedPilots = findEliminatedPilots(brackets);

    // Create pilot entries only for pilots in races
    const pilotEntries = pilots
        .filter((pilot) => scheduledPilots.has(pilot.ID))
        .map((pilot) => {
            // Find if this pilot is eliminated
            const eliminatedInfo = eliminatedPilots.find(
                (ep) =>
                    ep.name.toLowerCase().replace(/\s+/g, '') ===
                        pilot.Name.toLowerCase().replace(/\s+/g, ''),
            );

            // Get the pilot's channel with priority:
            // 1. Current race channel
            // 2. Next race channel
            // 3. Last used channel
            let pilotChannel: Channel | null = null;

            if (currentRaceIndex >= 0 && currentRaceIndex < races.length) {
                // Check current race
                const currentRace = races[currentRaceIndex];
                const currentChannel = currentRace.PilotChannels.find((pc) => pc.Pilot === pilot.ID)
                    ?.Channel;
                if (currentChannel) {
                    pilotChannel = channels.find((c) => c.ID === currentChannel) || null;
                }

                // If no current channel and not currently racing, check next race
                if (!pilotChannel && racesUntilNext.get(pilot.ID) !== -2) {
                    for (let i = currentRaceIndex + 1; i < races.length; i++) {
                        const nextChannel = races[i].PilotChannels.find((pc) =>
                            pc.Pilot === pilot.ID
                        )?.Channel;
                        if (nextChannel) {
                            pilotChannel = channels.find((c) => c.ID === nextChannel) || null;
                            break;
                        }
                    }
                }

                // If still no channel, get last used channel
                if (!pilotChannel) {
                    for (let i = currentRaceIndex - 1; i >= 0; i--) {
                        const lastChannel = races[i].PilotChannels.find((pc) =>
                            pc.Pilot === pilot.ID
                        )?.Channel;
                        if (lastChannel) {
                            pilotChannel = channels.find((c) => c.ID === lastChannel) || null;
                            break;
                        }
                    }
                }
            }

            return {
                pilot,
                bestLap: overallFastestLaps.get(pilot.ID) || null,
                consecutiveLaps: fastestConsecutiveLaps.get(pilot.ID) || null,
                bestHoleshot: fastestHoleshots.get(pilot.ID) || null,
                channel: pilotChannel,
                racesUntilNext: racesUntilNext.get(pilot.ID) ?? -1,
                totalLaps: totalLaps.get(pilot.ID) ?? 0,
                eliminatedInfo: eliminatedInfo
                    ? {
                        bracket: eliminatedInfo.bracket,
                        position: eliminatedInfo.position,
                        points: eliminatedInfo.points,
                    }
                    : null,
            };
        });

    return sortLeaderboard(pilotEntries, defaultLeaderboardSortConfig);
}

export function getPositionChanges(
    currentPositions: LeaderboardEntry[],
    previousPositions: LeaderboardEntry[],
): Map<string, number> {
    const changes = new Map<string, number>();

    currentPositions.forEach((entry, currentIndex) => {
        // Only consider pilots who have times in the current leaderboard
        if (entry.consecutiveLaps || entry.bestLap) {
            const previousEntry = previousPositions.find(
                (prev) => prev.pilot.ID === entry.pilot.ID,
            );

            // Only record change if they had times in the previous leaderboard too
            if (previousEntry && (previousEntry.consecutiveLaps || previousEntry.bestLap)) {
                const previousIndex = previousPositions.indexOf(previousEntry);
                if (previousIndex !== currentIndex) {
                    // Store the previous position (1-based)
                    changes.set(entry.pilot.ID, previousIndex + 1);
                }
            }
        }
    });

    return changes;
}

export interface EliminatedPilot {
    name: string;
    bracket: string;
    position: number;
    points: number;
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
