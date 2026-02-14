import type { FinalsHeat, FinalsHeatResult, FinalsParticipant } from './finals-types.ts';

const DEFAULT_MIN_HEATS = 3;
const DEFAULT_MAX_HEATS = 7;
const DEFAULT_WINS_REQUIRED = 2;

export interface FinalsRules {
	minHeats: number;
	maxHeats: number;
	winsRequired: number;
}

export const DEFAULT_FINALS_RULES: FinalsRules = {
	minHeats: DEFAULT_MIN_HEATS,
	maxHeats: DEFAULT_MAX_HEATS,
	winsRequired: DEFAULT_WINS_REQUIRED,
};

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
 * - Champion: first pilot to reach configured win threshold (position 1)
 * - Places 2-6: ranked by best-of scoring (total points minus worst single result)
 * - Minimum configured heats required before rankings are locked
 * - Best-of scoring only applied if pilot competed in at least minHeats
 */
export function computeFinalsRankings(
	participants: RankingInput[],
	completedHeats: number,
	rules: FinalsRules = DEFAULT_FINALS_RULES,
): RankedParticipant[] {
	// Find champion (wins threshold from rules)
	const champion = participants.find((p) => p.wins >= rules.winsRequired);

	const ranked: RankedParticipant[] = participants.map((p) => {
		const isChampion = champion?.pilotId === p.pilotId;
		const totalPoints = p.heatResults.reduce((sum, r) => sum + r.points, 0);

		// Best-of scoring: total minus worst result (if 3+ heats)
		let bestOfScore = totalPoints;
		let worstHeatPoints: number | null = null;

		if (p.heatResults.length >= rules.minHeats) {
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
 * - Minimum configured heats must complete
 * - If no champion after minHeats, continue up to maxHeats
 * - Once a champion is crowned, additional heats may be needed for placement
 */
export function requiresMoreHeats(
	participants: RankingInput[],
	completedHeats: number,
	rules: FinalsRules = DEFAULT_FINALS_RULES,
): boolean {
	// Always need at least 3 heats
	if (completedHeats < rules.minHeats) return true;

	// Max heats reached
	if (completedHeats >= rules.maxHeats) return false;

	// No champion yet, need more heats
	const hasChampion = participants.some((p) => p.wins >= rules.winsRequired);
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
	rules: FinalsRules = DEFAULT_FINALS_RULES,
): string | null {
	if (totalHeats === 0) {
		return 'Finals have not started yet.';
	}

	if (completedHeats < rules.minHeats) {
		const remaining = rules.minHeats - completedHeats;
		return `Finals waiting for results. At least ${remaining} more ${
			remaining === 1 ? 'heat' : 'heats'
		} must complete before rankings lock in.`;
	}

	const champion = participants.find((p) => p.wins >= rules.winsRequired);
	if (champion) {
		return `${champion.pilotName} is the champion with ${champion.wins} wins!`;
	}

	if (completedHeats >= rules.maxHeats) {
		return 'Finals complete. Maximum heats reached.';
	}

	return `Finals in progress. Waiting for a pilot to earn ${rules.winsRequired} wins.`;
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
