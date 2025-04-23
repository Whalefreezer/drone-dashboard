import { Channel, Pilot, Race, Round, Bracket, BracketPilot } from '../types/types.ts';
import { LeaderboardEntry, ProcessedLap, RaceWithProcessedLaps } from '../types/types.ts';

export const CONSECUTIVE_LAPS = 3; // Central constant for consecutive laps calculation

export function getPositionWithSuffix(position: number): string {
    const suffix = position === 1 ? 'st' : position === 2 ? 'nd' : position === 3 ? 'rd' : 'th';
    return `${position}${suffix}`;
}

export function secondsFromString(time: string): number {
    const [hours, minutes, seconds] = time.split(':');
    return parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseInt(seconds);
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

export function calculateRacesUntilNext(races: Race[], currentRaceIndex: number, pilotId: string): number {
    if (currentRaceIndex < 0 || currentRaceIndex >= races.length) {
        return -1;
    }

    // Check if pilot is in current race
    const currentRace = races[currentRaceIndex];
    if (currentRace.PilotChannels.some(pc => pc.Pilot === pilotId)) {
        return -2; // Currently racing
    }

    // Look ahead for next race with this pilot
    for (let i = currentRaceIndex + 1; i < races.length; i++) {
        if (races[i].PilotChannels.some(pc => pc.Pilot === pilotId)) {
            return i - currentRaceIndex;
        }
    }

    return -1; // No future races found
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

interface BestTime {
    time: number;
    roundId: string;
    raceNumber: number;
    lapNumber: number;
}

interface ConsecutiveTime {
    time: number;
    roundId: string;
    raceNumber: number;
    startLap: number;
}

export interface BestTimes {
    overallFastestLaps: Map<string, { time: number; roundId: string; raceNumber: number }>;
    fastestConsecutiveLaps: Map<string, { time: number; roundId: string; raceNumber: number }>;
    pilotChannels: Map<string, string>;
    fastestHoleshots: Map<string, { time: number; roundId: string; raceNumber: number }>;
}

export function calculateBestTimes(races: Race[]): BestTimes {
    return {
        overallFastestLaps: new Map(),
        fastestConsecutiveLaps: new Map(),
        pilotChannels: new Map(),
        fastestHoleshots: new Map(),
    };
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
        const isComplete = bracket.pilots.every((pilot: BracketPilot) =>
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
