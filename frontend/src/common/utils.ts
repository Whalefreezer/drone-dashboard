import { Channel, Pilot, Race, Round } from '../types/types.ts';
import { ProcessedLap, RaceWithProcessedLaps } from '../state/atoms.ts';
import { LeaderboardEntry } from '../leaderboard/leaderboard-types.ts';
import { BestTime, ConsecutiveTime } from '../race/race-utils.ts';

export function getPositionWithSuffix(position: number): string {
    // Handle special cases for 11th, 12th, 13th
    if (position % 100 >= 11 && position % 100 <= 13) {
        return `${position}th`;
    }
    
    // Handle other cases based on the last digit
    const lastDigit = position % 10;
    const suffix = lastDigit === 1 ? 'st' : lastDigit === 2 ? 'nd' : lastDigit === 3 ? 'rd' : 'th';
    return `${position}${suffix}`;
}

export function secondsFromString(time: string): number {
    const parts = time.split(':').map(part => parseInt(part, 10));

    // Check if any part failed to parse
    if (parts.some(isNaN)) {
        console.error(`Invalid time format passed to secondsFromString: ${time}`);
        return NaN;
    }

    let hours = 0;
    let minutes = 0;
    let seconds = 0;

    if (parts.length === 3) {
        // HH:MM:SS format
        [hours, minutes, seconds] = parts;
    } else if (parts.length === 2) {
        // MM:SS format
        [minutes, seconds] = parts;
    } else {
        // Handle unexpected formats (e.g., single number for seconds, or too many parts)
        // For simplicity, let's assume a single number is seconds, otherwise error.
        if (parts.length === 1) {
             seconds = parts[0];
        } else {
            console.error(`Unexpected time format length in secondsFromString: ${time}`);
            return NaN;
        }
    }

    // Ensure all components are valid numbers before calculation
    if (isNaN(hours) || isNaN(minutes) || isNaN(seconds)) {
         console.error(`Parsed NaN component in secondsFromString: ${time}`);
         return NaN;
    }

    return hours * 3600 + minutes * 60 + seconds;
}

export function orderRaces(races: Race[], rounds: Round[]): Race[] {
    return races.sort((a, b) => {
        const aRound = rounds.find((r) => r.ID === a.Round);
        const bRound = rounds.find((r) => r.ID === b.Round);
        const orderDiff = (aRound?.Order ?? 0) - (bRound?.Order ?? 0);
        if (orderDiff !== 0) return orderDiff;
        return (a.RaceNumber ?? 0) - (b.RaceNumber ?? 0);
    });
}

export function getLapClassName(
    lap: ProcessedLap,
    overallFastestLap: number,
    pilotBestLap: number | undefined,
    raceFastestLap: number,
    pilotFastestLap: number,
): string | undefined {
    if (lap.isHoleshot) return undefined;

    if (lap.lengthSeconds === overallFastestLap) {
        return 'lap-overall-fastest';
    } else if (lap.lengthSeconds === pilotBestLap) {
        return 'lap-overall-personal-best';
    } else if (lap.lengthSeconds === raceFastestLap) {
        return 'lap-fastest-overall';
    } else if (lap.lengthSeconds === pilotFastestLap) {
        return 'lap-personal-best';
    }

    return undefined;
}

export function calculateRacesUntilNext(
    races: RaceWithProcessedLaps[],
    currentRaceIndex: number,
    pilotId: string,
): number {
    // Check if pilot is in current race
    if (
        races[currentRaceIndex].PilotChannels.some((pc: { Pilot: string }) => pc.Pilot === pilotId)
    ) {
        return -2; // Use -2 to indicate current race
    }

    let racesCount = 0;

    for (let i = currentRaceIndex + 1; i < races.length; i++) {
        if (
            races[i].PilotChannels.some((pc: { Pilot: string }) => pc.Pilot === pilotId)
        ) {
            return racesCount;
        }
        racesCount++;
    }

    return -1; // No upcoming races found
}

export function findIndexOfLastRace(sortedRaces: Race[]) {
    const currentRaceIndex = findIndexOfCurrentRace(sortedRaces);
    if (currentRaceIndex === -1) {
        return -1;
    }

    for (let i = currentRaceIndex - 1; i >= 0; i--) {
        if (sortedRaces[i].Valid) {
            return i;
        }
    }
    return -1;
}

export function findLastIndex<T>(
    array: T[],
    predicate: (value: T) => boolean,
): number {
    for (let i = array.length - 1; i >= 0; i--) {
        if (predicate(array[i])) {
            return i;
        }
    }
    return -1;
}

interface PilotEntry {
    pilot: Pilot;
    bestLap: BestTime | null;
    consecutiveLaps: ConsecutiveTime | null;
    channel: Channel | null;
    racesUntilNext: number;
    totalLaps: number;
    bestHoleshot: BestTime | null;
    eliminatedInfo: {
        bracket: string;
        position: number;
        points: number;
    } | null;
}

// --- Consolidated Elimination Logic ---

const officalEliminationOrder: [number, string][] = [];

export function getNormalizedPilotName(name: string): string {
    return name.toLowerCase().replace(/\W+/g, '');
}

export function getEliminationOrderIndex(pilotName: string): number {
    const normalizedName = getNormalizedPilotName(pilotName);
    const entry = officalEliminationOrder.find(([_, name]) =>
        getNormalizedPilotName(String(name)) === normalizedName
    );
    return entry ? Number(entry[0]) : -1;
}

// --- New Helper Functions for Sorting ---

export function isPilotInEliminationOrder(entry: LeaderboardEntry): boolean {
    return getEliminationOrderIndex(entry.pilot.Name) !== -1;
}

export function pilotHasLaps(entry: LeaderboardEntry): boolean {
    return entry.totalLaps > 0;
}

export function pilotHasConsecutiveLaps(entry: LeaderboardEntry): boolean {
    return entry.consecutiveLaps !== null;
}

export function isPilotEliminated(entry: LeaderboardEntry): boolean {
    return entry.eliminatedInfo !== null;
}

/**
 * Determines the elimination stage based on the bracket number.
 * Returns a number representing the stage (lower is earlier):
 * 1: Heats (<= 8)
 * 2: Quarters (<= 12)
 * 3: Semis (<= 14)
 * 4: Finals (> 14)
 * Returns null if the pilot is not eliminated or info is missing.
 */
export function getEliminationStage(entry: LeaderboardEntry): number | null {
    if (!entry.eliminatedInfo) return null;
    try {
        const bracketNum = parseInt(entry.eliminatedInfo.bracket.replace(/\D/g, ''));
        if (isNaN(bracketNum)) return null;
        if (bracketNum <= 8) return 1;
        if (bracketNum <= 12) return 2;
        if (bracketNum <= 14) return 3;
        return 4;
    } catch (e) {
        console.error('Error parsing bracket number:', entry.eliminatedInfo.bracket, e);
        return null;
    }
}

// --- Original Sorting Logic (to be potentially removed later) ---

export function findIndexOfCurrentRace(sortedRaces: Race[]) {
    if (!sortedRaces || sortedRaces.length === 0) {
        return -1;
    }

    const activeRace = sortedRaces.findIndex((race) => {
        if (!race.Valid) {
            return false;
        }
        if (!race.Start || race.Start.startsWith('0')) {
            return false;
        }
        if (!race.End || race.End.startsWith('0')) {
            return true;
        }
        return false;
    });

    if (activeRace !== -1) {
        return activeRace;
    }

    const lastRace = findLastIndex(sortedRaces, (race) => {
        if (!race.Valid) {
            return false;
        }

        if (
            race.Start && !race.Start.startsWith('0') && race.End &&
            !race.End.startsWith('0')
        ) {
            return true;
        }
        return false;
    });

    if (lastRace !== -1) {
        return Math.min(lastRace + 1, sortedRaces.length - 1);
    }

    return sortedRaces.length > 0 ? 0 : -1;
}
