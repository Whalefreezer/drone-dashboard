import type { PBChannelRecord, PBPilotRecord, PBRoundRecord } from '../api/pbTypes.ts';
import { ProcessedLap } from '../state/atoms.ts';
import { LeaderboardEntry } from '../leaderboard/leaderboard-types.ts';
import { BestTime, ConsecutiveTime } from '../race/race-utils.ts';
import type { RaceData } from '../race/race-types.ts';

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
    const parts = time.split(':').map((part) => parseInt(part, 10));

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

export function orderRaces(races: RaceData[], rounds: PBRoundRecord[]): RaceData[] {
    return races.sort((a, b) => {
        const aRound = rounds.find((r) => r.id === a.roundId);
        const bRound = rounds.find((r) => r.id === b.roundId);
        const orderDiff = (aRound?.order ?? 0) - (bRound?.order ?? 0);
        if (orderDiff !== 0) return orderDiff;
        return (a.raceNumber ?? 0) - (b.raceNumber ?? 0);
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
    races: RaceData[],
    currentRaceIndex: number,
    pilotId: string,
): number {
    // Check if pilot is in current race
    if (
        races[currentRaceIndex].pilotChannels.some((pc) => pc.pilotId === pilotId)
    ) {
        return -2; // Use -2 to indicate current race
    }

    let racesCount = 0;

    for (let i = currentRaceIndex + 1; i < races.length; i++) {
        if (
            races[i].pilotChannels.some((pc) => pc.pilotId === pilotId)
        ) {
            return racesCount;
        }
        racesCount++;
    }

    return -1; // No upcoming races found
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
    pilot: PBPilotRecord;
    bestLap: BestTime | null;
    consecutiveLaps: ConsecutiveTime | null;
    channel: PBChannelRecord | null;
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
    return getEliminationOrderIndex(entry.pilot.name) !== -1;
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


