import { LeaderboardEntry, SortGroup } from '../leaderboard/leaderboard-types.ts';
import { ProcessedLap } from '../state/atoms.ts';

// Minimal race shape required for leaderboard calculations
export type LBInputRace = {
    roundId: string;
    raceNumber: number;
    targetLaps?: number;
    processedLaps: ProcessedLap[];
    pilotChannels: { id: string; pilotId: string; channelId: string }[];
};

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
    lapCount: number;
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

export function calculateBestTimes(races: LBInputRace[], consecutiveLaps: number) {
    const overallFastestLaps = new Map<string, BestTime>();
    const fastestConsecutiveLaps = new Map<string, ConsecutiveTime>();
    const fastestHoleshots = new Map<string, BestTime>();
    const pilotChannels = new Map<string, string>();
    const fastestTotalRaceTimes = new Map<string, TotalRaceTime>();

    races.forEach((race) => {
        race.pilotChannels.forEach((pilotChannel) => {
            if (!pilotChannels.has(pilotChannel.pilotId)) {
                pilotChannels.set(pilotChannel.pilotId, pilotChannel.channelId);
            }

            const racingLaps = race.processedLaps.filter((lap) => lap.pilotId === pilotChannel.pilotId && !lap.isHoleshot);

            const holeshotLaps = race.processedLaps.filter((lap) => lap.pilotId === pilotChannel.pilotId && lap.isHoleshot);

            updateFastestLaps(
                racingLaps,
                pilotChannel.pilotId,
                race,
                overallFastestLaps,
            );
            updateConsecutiveLaps(
                racingLaps,
                pilotChannel.pilotId,
                race,
                fastestConsecutiveLaps,
                consecutiveLaps,
            );
            updateFastestLaps(
                holeshotLaps,
                pilotChannel.pilotId,
                race,
                fastestHoleshots,
            );
            updateTotalRaceTime(
                pilotChannel.pilotId,
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
    race: LBInputRace,
    overallFastestLaps: Map<string, BestTime>,
) {
    if (racingLaps.length > 0) {
        const fastestLap = racingLaps.reduce((fastest, lap) => lap.lengthSeconds < fastest.lengthSeconds ? lap : fastest);

        const currentFastest = overallFastestLaps.get(pilotId);
        if (!currentFastest || fastestLap.lengthSeconds < currentFastest.time) {
            overallFastestLaps.set(pilotId, {
                time: fastestLap.lengthSeconds,
                roundId: race.roundId,
                raceNumber: race.raceNumber,
                lapNumber: fastestLap.lapNumber,
            });
        }
    }
}

function updateConsecutiveLaps(
    racingLaps: ProcessedLap[],
    pilotId: string,
    race: LBInputRace,
    fastestConsecutiveLaps: Map<string, ConsecutiveTime>,
    consecutiveLaps: number,
) {
    if (racingLaps.length >= consecutiveLaps) {
        let fastestConsecutive = { time: Infinity, startLap: 0 };
        for (let i = 0; i < racingLaps.length - (consecutiveLaps - 1); i++) {
            const consecutiveLapsTime = racingLaps
                .slice(i, i + consecutiveLaps)
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
                roundId: race.roundId,
                raceNumber: race.raceNumber,
            });
        }
    }
}

function updateTotalRaceTime(
    pilotId: string,
    race: LBInputRace,
    holeshotLaps: ProcessedLap[],
    racingLaps: ProcessedLap[],
    fastestTotalRaceTimes: Map<string, TotalRaceTime>,
) {
    const targetLaps = race.targetLaps ?? 3; // Use race targetLaps or default to 3

    if (
        targetLaps <= 0 || holeshotLaps.length === 0 ||
        racingLaps.length < targetLaps
    ) {
        return;
    }

    const holeshotTime = holeshotLaps[0].lengthSeconds;
    const firstNLapsTime = racingLaps
        .slice(0, targetLaps)
        .reduce((sum, lap) => sum + lap.lengthSeconds, 0);
    const totalTime = holeshotTime + firstNLapsTime;

    const currentFastest = fastestTotalRaceTimes.get(pilotId);
    if (!currentFastest || totalTime < currentFastest.time) {
        fastestTotalRaceTimes.set(pilotId, {
            time: totalTime,
            roundId: race.roundId,
            raceNumber: race.raceNumber,
            lapCount: targetLaps,
        });
    }
}
