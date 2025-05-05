import { LeaderboardEntry, SortGroup } from '../leaderboard/leaderboard-types.ts';
import { ProcessedLap, RaceWithProcessedLaps } from '../state/atoms.ts';

// Central constant for consecutive laps calculation
export const CONSECUTIVE_LAPS = 3;

export interface BestTime {
    time: number;
    roundId: string;
    raceNumber: number;
    lapNumber: number;
}

export interface ConsecutiveTime {
    time: number;
    roundId: string;
    raceNumber: number;
    startLap: number;
}

export interface TotalRaceTime {
    time: number;
    roundId: string;
    raceNumber: number;
}

// Helper function to find the hierarchy of applicable groups for an entry
function getGroupHierarchy(
    entry: LeaderboardEntry,
    groups: SortGroup[],
): SortGroup[] {
    const hierarchy: SortGroup[] = [];

    function findPath(currentGroups: SortGroup[]): boolean {
        for (const group of currentGroups) {
            if (!group.condition || group.condition(entry)) {
                hierarchy.push(group);
                if (group.groups && group.groups.length > 0) {
                    if (findPath(group.groups)) {
                        return true; // Found the deepest path
                    }
                }
                // If no deeper path found or no subgroups, this is the path
                return true;
            }
        }
        // No applicable group found at this level
        hierarchy.pop(); // Backtrack
        return false;
    }

    findPath(groups);
    return hierarchy;
}

export function calculateBestTimes(races: RaceWithProcessedLaps[]) {
    const overallFastestLaps = new Map<string, BestTime>();
    const fastestConsecutiveLaps = new Map<string, ConsecutiveTime>();
    const fastestHoleshots = new Map<string, BestTime>();
    const pilotChannels = new Map<string, string>();
    const fastestTotalRaceTimes = new Map<string, TotalRaceTime>();

    races.forEach((race) => {
        race.PilotChannels.forEach((pilotChannel) => {
            if (!pilotChannels.has(pilotChannel.Pilot)) {
                pilotChannels.set(pilotChannel.Pilot, pilotChannel.Channel);
            }

            const racingLaps = race.processedLaps.filter((lap) =>
                lap.pilotId === pilotChannel.Pilot && !lap.isHoleshot
            );

            const holeshotLaps = race.processedLaps.filter((lap) =>
                lap.pilotId === pilotChannel.Pilot && lap.isHoleshot
            );

            updateFastestLaps(
                racingLaps,
                pilotChannel.Pilot,
                race,
                overallFastestLaps,
            );
            updateConsecutiveLaps(
                racingLaps,
                pilotChannel.Pilot,
                race,
                fastestConsecutiveLaps,
            );
            updateFastestLaps(
                holeshotLaps,
                pilotChannel.Pilot,
                race,
                fastestHoleshots,
            );
            updateTotalRaceTime(
                pilotChannel.Pilot,
                race,
                holeshotLaps,
                racingLaps,
                fastestTotalRaceTimes,
            );
        });
    });

    return {
        overallFastestLaps,
        fastestConsecutiveLaps,
        fastestHoleshots,
        pilotChannels,
        fastestTotalRaceTimes,
    };
}

function updateFastestLaps(
    racingLaps: ProcessedLap[],
    pilotId: string,
    race: RaceWithProcessedLaps,
    overallFastestLaps: Map<string, BestTime>,
) {
    if (racingLaps.length > 0) {
        const fastestLap = racingLaps.reduce((fastest, lap) =>
            lap.lengthSeconds < fastest.lengthSeconds ? lap : fastest
        );

        const currentFastest = overallFastestLaps.get(pilotId);
        if (!currentFastest || fastestLap.lengthSeconds < currentFastest.time) {
            overallFastestLaps.set(pilotId, {
                time: fastestLap.lengthSeconds,
                roundId: race.Round,
                raceNumber: race.RaceNumber,
                lapNumber: fastestLap.lapNumber,
            });
        }
    }
}

function updateConsecutiveLaps(
    racingLaps: ProcessedLap[],
    pilotId: string,
    race: RaceWithProcessedLaps,
    fastestConsecutiveLaps: Map<string, ConsecutiveTime>,
) {
    if (racingLaps.length >= CONSECUTIVE_LAPS) {
        let fastestConsecutive = { time: Infinity, startLap: 0 };
        for (let i = 0; i < racingLaps.length - (CONSECUTIVE_LAPS - 1); i++) {
            const consecutiveLapsTime = racingLaps
                .slice(i, i + CONSECUTIVE_LAPS)
                .reduce((sum, lap) => sum + lap.lengthSeconds, 0);
            if (consecutiveLapsTime < fastestConsecutive.time) {
                fastestConsecutive = {
                    time: consecutiveLapsTime,
                    startLap: racingLaps[i].lapNumber,
                };
            }
        }

        const currentFastestConsecutive = fastestConsecutiveLaps.get(pilotId);
        if (
            !currentFastestConsecutive ||
            fastestConsecutive.time < currentFastestConsecutive.time
        ) {
            fastestConsecutiveLaps.set(pilotId, {
                ...fastestConsecutive,
                roundId: race.Round,
                raceNumber: race.RaceNumber,
            });
        }
    }
}

function updateTotalRaceTime(
    pilotId: string,
    race: RaceWithProcessedLaps,
    holeshotLaps: ProcessedLap[],
    racingLaps: ProcessedLap[],
    fastestTotalRaceTimes: Map<string, TotalRaceTime>,
) {
    if (
        race.TargetLaps <= 0 || holeshotLaps.length === 0 ||
        racingLaps.length < race.TargetLaps
    ) {
        return;
    }

    const holeshotTime = holeshotLaps[0].lengthSeconds;
    const firstNLapsTime = racingLaps
        .slice(0, race.TargetLaps)
        .reduce((sum, lap) => sum + lap.lengthSeconds, 0);
    const totalTime = holeshotTime + firstNLapsTime;

    const currentFastest = fastestTotalRaceTimes.get(pilotId);
    if (!currentFastest || totalTime < currentFastest.time) {
        fastestTotalRaceTimes.set(pilotId, {
            time: totalTime,
            roundId: race.Round,
            raceNumber: race.RaceNumber,
        });
    }
}
