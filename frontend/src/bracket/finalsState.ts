import { atom } from 'jotai';
import type { PBRaceRecord } from '../api/pbTypes.ts';
import { pilotsAtom, racesAtom } from '../state/pbAtoms.ts';
import { raceSortedRowsAtom, raceStatusAtom } from '../race/race-atoms.ts';
import { activeBracketFormatAtom, bracketAnchorConfigAtom, mapRacesToBracket } from './eliminationState.ts';
import type { FinalsFinalist, FinalsHeat, FinalsParticipant, FinalsState } from './finals-types.ts';
import {
	computeFinalsRankings,
	computeWins,
	getFinalsMessage,
	positionToPoints,
	type RankingInput,
	requiresMoreHeats,
} from './finals-ranking.ts';

// Race 28 is the winners bracket final (top 3 advance to finals)
// Race 29 is the redemption grand final (top 3 advance to finals)
const WINNERS_FINAL_ORDER = 28;
const REDEMPTION_FINAL_ORDER = 29;

/**
 * Atom that computes the complete finals state
 */
export const finalsStateAtom = atom((get): FinalsState => {
	const config = get(bracketAnchorConfigAtom);
	const format = get(activeBracketFormatAtom);
	const races = get(racesAtom) as PBRaceRecord[];
	const pilots = get(pilotsAtom);

	// If bracket anchors are not configured, finals are not enabled
	if (!config.record) {
		return {
			enabled: false,
			finalists: [],
			heats: [],
			participants: [],
			championId: null,
			isComplete: false,
			requiresMoreHeats: false,
			message: null,
		};
	}

	// Finals module currently supports only the original 29-race bracket.
	if (format.id !== 'double-elim-6p-v1') {
		return {
			enabled: false,
			finalists: [],
			heats: [],
			participants: [],
			championId: null,
			isComplete: false,
			requiresMoreHeats: false,
			message: null,
		};
	}

	// Map bracket nodes to races
	const mapping = mapRacesToBracket(races, config, format.nodes);

	// Get the two final races that feed the finals pool
	const winnersFinalRace = mapping.get(WINNERS_FINAL_ORDER);
	const redemptionFinalRace = mapping.get(REDEMPTION_FINAL_ORDER);

	// If either final race doesn't exist, finals are not enabled
	if (!winnersFinalRace || !redemptionFinalRace) {
		return {
			enabled: false,
			finalists: [],
			heats: [],
			participants: [],
			championId: null,
			isComplete: false,
			requiresMoreHeats: false,
			message: null,
		};
	}

	// Check if both final races are completed
	const winnersStatus = get(raceStatusAtom(winnersFinalRace.id));
	const redemptionStatus = get(raceStatusAtom(redemptionFinalRace.id));

	if (!winnersStatus?.isCompleted || !redemptionStatus?.isCompleted) {
		return {
			enabled: false,
			finalists: [],
			heats: [],
			participants: [],
			championId: null,
			isComplete: false,
			requiresMoreHeats: false,
			message: 'Waiting for bracket finals to complete before starting Top 6 finals.',
		};
	}

	// Extract top 3 from each final race
	const winnersRows = get(raceSortedRowsAtom(winnersFinalRace.id));
	const redemptionRows = get(raceSortedRowsAtom(redemptionFinalRace.id));

	const winnerFinalists: FinalsFinalist[] = winnersRows
		.filter((row) => row.position >= 1 && row.position <= 3 && row.pilotChannel.pilotId)
		.map((row) => {
			const pilot = pilots.find((p) => p.id === row.pilotChannel.pilotId);
			return {
				pilotId: row.pilotChannel.pilotId!,
				pilotName: pilot?.name ?? 'Unknown',
				sourceRace: 'winners' as const,
				sourcePosition: row.position,
			};
		});

	const redemptionFinalists: FinalsFinalist[] = redemptionRows
		.filter((row) => row.position >= 1 && row.position <= 3 && row.pilotChannel.pilotId)
		.map((row) => {
			const pilot = pilots.find((p) => p.id === row.pilotChannel.pilotId);
			return {
				pilotId: row.pilotChannel.pilotId!,
				pilotName: pilot?.name ?? 'Unknown',
				sourceRace: 'redemption' as const,
				sourcePosition: row.position,
			};
		});

	const finalists = [...winnerFinalists, ...redemptionFinalists];

	if (finalists.length < 6) {
		return {
			enabled: false,
			finalists,
			heats: [],
			participants: [],
			championId: null,
			isComplete: false,
			requiresMoreHeats: false,
			message: `Waiting for all 6 finalists to be determined. Currently have ${finalists.length}/6.`,
		};
	}

	// Find finals heats (races that come after the redemption final)
	const sortedRaces = [...races].sort((a, b) => a.raceOrder - b.raceOrder);
	const redemptionFinalIndex = sortedRaces.findIndex((r) => r.id === redemptionFinalRace.id);

	if (redemptionFinalIndex === -1) {
		return {
			enabled: true,
			finalists,
			heats: [],
			participants: [],
			championId: null,
			isComplete: false,
			requiresMoreHeats: false,
			message: 'Finals pool determined. Waiting for finals heats to begin.',
		};
	}

	// Finals heats are races after the redemption final
	const finalsRaces = sortedRaces.slice(redemptionFinalIndex + 1);

	// Filter to only include heats with at least some finalists participating
	const finalistIds = new Set(finalists.map((f) => f.pilotId));
	const finalsHeats: FinalsHeat[] = [];

	for (let i = 0; i < finalsRaces.length; i++) {
		const race = finalsRaces[i];
		const status = get(raceStatusAtom(race.id));
		const rows = get(raceSortedRowsAtom(race.id));

		// Check if this race has any finalists
		const hasFinalists = rows.some((row) => row.pilotChannel.pilotId && finalistIds.has(row.pilotChannel.pilotId));
		if (!hasFinalists) continue;

		const results = rows
			.filter((row) => row.pilotChannel.pilotId && finalistIds.has(row.pilotChannel.pilotId))
			.map((row) => {
				const pilot = pilots.find((p) => p.id === row.pilotChannel.pilotId);
				return {
					pilotId: row.pilotChannel.pilotId!,
					pilotName: pilot?.name ?? 'Unknown',
					position: row.position,
					points: positionToPoints(row.position),
				};
			});

		finalsHeats.push({
			raceId: race.id,
			raceOrder: race.raceOrder,
			heatNumber: i + 1,
			isCompleted: status?.isCompleted === true,
			isActive: status?.isActive === true,
			results,
		});
	}

	// Build participant data
	const participantMap = new Map<string, RankingInput>();

	for (const finalist of finalists) {
		participantMap.set(finalist.pilotId, {
			pilotId: finalist.pilotId,
			pilotName: finalist.pilotName,
			wins: 0,
			heatResults: [],
		});
	}

	// Aggregate results from completed heats
	for (const heat of finalsHeats) {
		if (!heat.isCompleted) continue;

		for (const result of heat.results) {
			const participant = participantMap.get(result.pilotId);
			if (!participant) continue;

			participant.heatResults.push(result);
			if (result.position === 1) {
				participant.wins++;
			}
		}
	}

	const participantsArray = Array.from(participantMap.values());
	const completedHeats = finalsHeats.filter((h) => h.isCompleted).length;

	// Compute rankings
	const ranked = computeFinalsRankings(participantsArray, completedHeats);

	// Build participants with full info
	const participants: FinalsParticipant[] = ranked.map((r) => ({
		pilotId: r.pilotId,
		pilotName: r.pilotName,
		wins: r.wins,
		totalPoints: r.totalPoints,
		heatResults: r.heatResults,
		isChampion: r.isChampion,
		finalPosition: r.finalPosition,
	}));

	const championId = participants.find((p) => p.isChampion)?.pilotId ?? null;
	const needsMoreHeats = requiresMoreHeats(participantsArray, completedHeats);
	const message = getFinalsMessage(participantsArray, completedHeats, finalsHeats.length);

	return {
		enabled: true,
		finalists,
		heats: finalsHeats,
		participants,
		championId,
		isComplete: !needsMoreHeats && completedHeats >= 3,
		requiresMoreHeats: needsMoreHeats,
		message,
	};
});
