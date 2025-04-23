import { Atom, atom, useAtomValue } from 'jotai';
import { atomFamily, atomWithRefresh } from 'jotai/utils';
import { Channel, Pilot, Race, RaceEvent } from '../types/types.ts';
import { calculateBestTimes, calculateRacesUntilNext, findEliminatedPilots } from '../common/utils.ts';
import { defaultLeaderboardSortConfig, sortLeaderboard } from './race-utils.ts';
import { RoundData, Round } from './race-types.ts';
import { eventDataAtom, eventIdAtom } from '../state/atoms.ts';
import { Bracket } from '../types/types.ts';
import { robustFetch } from '../common/fetch.ts';

// Re-export atoms from main state that are race-specific
export const currentRoundAtom = atom<RoundData | null>(null);

export interface RaceWithProcessedLaps extends Race {
    processedLaps: ProcessedLap[];
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

export const roundsDataAtom = atomWithRefresh(async (get) => {
    const eventId = await get(eventIdAtom);
    const page = await robustFetch(`/api/events/${eventId}/Rounds.json`);
    const json = await page.json();
    return json as Round[];
});

export const raceFamilyAtom = atomFamily((raceId: string) =>
    atomWithRefresh(async (get) => {
        const eventId = await get(eventIdAtom);
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