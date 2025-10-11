import type { PBRoundRecord } from '../api/pbTypes.ts';
import { Bracket, EliminatedPilot } from '../bracket/bracket-types.ts';

// Common types and interfaces
export interface ProcessedLap {
	id: string;
	lapNumber: number;
	lengthSeconds: number;
	pilotId: string;
	valid: boolean;
	startTime: string;
	endTime: string;
	detectionId: string;
	detectionTime: string;
	isHoleshot: boolean;
}

export interface OverallBestTimes {
	overallFastestLap: number;
	pilotBestLaps: Map<string, number>;
}

/**
 * Determines if a race is currently active (started but not ended)
 */
export function isRaceActive(race: { start?: string; end?: string } | undefined): boolean {
	if (!race) return false;
	const started = !!race.start && !String(race.start).startsWith('0');
	const ended = !!race.end && !String(race.end).startsWith('0');
	const raceStarted = started && !ended;
	return raceStarted;
}

/**
 * Orders races by round order and race number
 */
export function orderRaces(races: { roundId: string; raceNumber: number }[], rounds: PBRoundRecord[]) {
	return races.sort((a, b) => {
		const aRound = rounds.find((r) => r.id === a.roundId);
		const bRound = rounds.find((r) => r.id === b.roundId);
		const orderDiff = (aRound?.order ?? 0) - (bRound?.order ?? 0);
		if (orderDiff !== 0) return orderDiff;
		return (a.raceNumber ?? 0) - (b.raceNumber ?? 0);
	});
}

/**
 * Finds eliminated pilots from completed brackets
 * @deprecated Legacy function - use locked positions from client_kv instead
 */
export function findEliminatedPilots(_brackets: Bracket[]): EliminatedPilot[] {
	// This function is deprecated in favor of locked positions
	// Retained for backward compatibility only
	return [];
}

/**
 * Calculates overall best times from all processed laps
 * Simplified to take processed laps directly instead of race objects
 */
export function calculateOverallBestTimes(processedLaps: ProcessedLap[]): OverallBestTimes {
	const overallBestTimes: OverallBestTimes = {
		overallFastestLap: Infinity,
		pilotBestLaps: new Map(),
	};

	processedLaps.forEach((lap) => {
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

	return overallBestTimes;
}
