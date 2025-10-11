import type { FinalsHeat, FinalsHeatResult, FinalsParticipant } from './finals-types.ts';

const MIN_HEATS = 3;
const MAX_HEATS = 7;
const WINS_REQUIRED = 2;

export interface RankingInput {
	pilotId: string;
	pilotName: string;
	wins: number;
	heatResults: FinalsHeatResult[];
}

export interface RankedParticipant {
	pilotId: string;
	pilotName: string;
	wins: number;
	totalPoints: number;
	bestOfScore: number;
	worstHeatPoints: number | null;
	heatResults: FinalsHeatResult[];
	finalPosition: number;
	isChampion: boolean;
}

/**
 * Computes finals rankings with best-of scoring
 *
 * Rules:
 * - Champion: first pilot to win 2 heats (position 1)
 * - Places 2-6: ranked by best-of scoring (total points minus worst single result)
 * - Minimum 3 heats required before rankings are locked
 * - Best-of scoring only applied if pilot competed in 3+ heats
 */
export function computeFinalsRankings(
	participants: RankingInput[],
	completedHeats: number,
): RankedParticipant[] {
	// Find champion (2 wins)
	const champion = participants.find((p) => p.wins >= WINS_REQUIRED);

	const ranked: RankedParticipant[] = participants.map((p) => {
		const isChampion = champion?.pilotId === p.pilotId;
		const totalPoints = p.heatResults.reduce((sum, r) => sum + r.points, 0);

		// Best-of scoring: total minus worst result (if 3+ heats)
		let bestOfScore = totalPoints;
		let worstHeatPoints: number | null = null;

		if (p.heatResults.length >= MIN_HEATS) {
			const points = p.heatResults.map((r) => r.points);
			const worst = Math.min(...points);
			worstHeatPoints = worst;
			bestOfScore = totalPoints - worst;
		}

		return {
			pilotId: p.pilotId,
			pilotName: p.pilotName,
			wins: p.wins,
			totalPoints,
			bestOfScore,
			worstHeatPoints,
			heatResults: p.heatResults,
			finalPosition: 0, // Will be assigned below
			isChampion,
		};
	});

	// Sort: champion first, then by best-of score (desc), then by total points (desc)
	ranked.sort((a, b) => {
		if (a.isChampion !== b.isChampion) return a.isChampion ? -1 : 1;
		if (a.bestOfScore !== b.bestOfScore) return b.bestOfScore - a.bestOfScore;
		return b.totalPoints - a.totalPoints;
	});

	// Assign positions
	ranked.forEach((p, index) => {
		p.finalPosition = index + 1;
	});

	return ranked;
}

/**
 * Determines if more heats are required
 *
 * Rules:
 * - Minimum 3 heats must complete
 * - If no champion after 3 heats, continue up to 7 heats max
 * - Once a champion is crowned, additional heats may be needed for placement
 */
export function requiresMoreHeats(
	participants: RankingInput[],
	completedHeats: number,
): boolean {
	// Always need at least 3 heats
	if (completedHeats < MIN_HEATS) return true;

	// Max heats reached
	if (completedHeats >= MAX_HEATS) return false;

	// No champion yet, need more heats
	const hasChampion = participants.some((p) => p.wins >= WINS_REQUIRED);
	if (!hasChampion) return true;

	// Champion exists, check if we still need more heats for placement
	// (Could be extended with more sophisticated logic)
	return false;
}

/**
 * Generates a status message for the finals
 */
export function getFinalsMessage(
	participants: RankingInput[],
	completedHeats: number,
	totalHeats: number,
): string | null {
	if (totalHeats === 0) {
		return 'Finals have not started yet.';
	}

	if (completedHeats < MIN_HEATS) {
		const remaining = MIN_HEATS - completedHeats;
		return `Finals waiting for results. At least ${remaining} more ${
			remaining === 1 ? 'heat' : 'heats'
		} must complete before rankings lock in.`;
	}

	const champion = participants.find((p) => p.wins >= WINS_REQUIRED);
	if (champion) {
		return `${champion.pilotName} is the champion with ${champion.wins} wins!`;
	}

	if (completedHeats >= MAX_HEATS) {
		return 'Finals complete. Maximum heats reached.';
	}

	return 'Finals in progress. Waiting for a pilot to earn 2 wins.';
}

/**
 * Computes wins for each pilot based on heat results
 * A "win" is finishing in position 1 in a heat
 */
export function computeWins(heatResults: FinalsHeatResult[]): number {
	return heatResults.filter((r) => r.position === 1).length;
}

/**
 * Converts heat position to points
 * Standard scoring: 1st = 100, 2nd = 80, 3rd = 60, 4th = 40, 5th = 20, 6th = 10
 */
export function positionToPoints(position: number): number {
	const pointsMap: Record<number, number> = {
		1: 100,
		2: 80,
		3: 60,
		4: 40,
		5: 20,
		6: 10,
	};
	return pointsMap[position] ?? 0;
}
