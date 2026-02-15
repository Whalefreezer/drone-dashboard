import { atom } from 'jotai';
import type { PBRaceRecord } from '../api/pbTypes.ts';
import { pilotsAtom, raceProcessedLapsAtom, racesAtom } from '../state/pbAtoms.ts';
import { raceSortedRowsAtom, raceStatusAtom } from '../race/race-atoms.ts';
import { activeBracketFormatAtom, bracketAnchorConfigAtom, bracketDiagramAtom, mapRacesToBracketHeats } from './eliminationState.ts';
import type { FinalsFinalist, FinalsHeat, FinalsParticipant, FinalsState } from './finals-types.ts';
import {
	computeFinalsRankings,
	DEFAULT_FINALS_RULES,
	getFinalsMessage,
	positionToPoints,
	type RankingInput,
	requiresMoreHeats,
} from './finals-ranking.ts';

interface FinalsFormatConfig {
	winnersFinalOrder: number;
	redemptionFinalOrder: number;
	finalsRaceNumber?: number;
	minHeats: number;
	maxHeats: number;
	winsRequired: number;
}

const FINALS_CONFIG_BY_FORMAT_ID: Record<string, FinalsFormatConfig> = {
	'double-elim-6p-v1': {
		winnersFinalOrder: 28,
		redemptionFinalOrder: 29,
		minHeats: DEFAULT_FINALS_RULES.minHeats,
		maxHeats: DEFAULT_FINALS_RULES.maxHeats,
		winsRequired: DEFAULT_FINALS_RULES.winsRequired,
	},
	'nzo-top24-de-v1': {
		winnersFinalOrder: 16,
		redemptionFinalOrder: 18,
		finalsRaceNumber: 19,
		minHeats: 3,
		maxHeats: 13,
		winsRequired: 3,
	},
};

const TEMP_DISABLE_NZO_CTA_DISPLAY = true;

let lastNzoFinalsDebugSignature = '';

export function selectFinalsRaceCandidates(
	sortedRaces: PBRaceRecord[],
	redemptionFinalRaceOrder: number,
	finalsRaceNumber?: number,
): PBRaceRecord[] {
	const racesAfterRedemption = sortedRaces.filter((race) => race.raceOrder > redemptionFinalRaceOrder);
	if (finalsRaceNumber == null) {
		return racesAfterRedemption;
	}
	const numberedFinals = racesAfterRedemption.filter((race) => race.raceNumber === finalsRaceNumber);
	if (numberedFinals.length > 0) {
		return numberedFinals;
	}
	return racesAfterRedemption;
}

/**
 * Atom that computes the complete finals state
 */
export const finalsStateAtom = atom((get): FinalsState => {
	const config = get(bracketAnchorConfigAtom);
	const format = get(activeBracketFormatAtom);
	const bracketDiagram = get(bracketDiagramAtom);
	const races = get(racesAtom) as PBRaceRecord[];
	const pilots = get(pilotsAtom);

	// If bracket anchors are not configured, finals are not enabled
	if (!config.record) {
		return {
			enabled: false,
			finalists: [],
			heats: [],
			participants: [],
			minHeats: DEFAULT_FINALS_RULES.minHeats,
			maxHeats: DEFAULT_FINALS_RULES.maxHeats,
			winsRequired: DEFAULT_FINALS_RULES.winsRequired,
			championId: null,
			isComplete: false,
			requiresMoreHeats: false,
			message: null,
		};
	}

	const finalsConfig = FINALS_CONFIG_BY_FORMAT_ID[format.id];
	if (!finalsConfig) {
		return {
			enabled: false,
			finalists: [],
			heats: [],
			participants: [],
			minHeats: DEFAULT_FINALS_RULES.minHeats,
			maxHeats: DEFAULT_FINALS_RULES.maxHeats,
			winsRequired: DEFAULT_FINALS_RULES.winsRequired,
			championId: null,
			isComplete: false,
			requiresMoreHeats: false,
			message: null,
		};
	}

	if (TEMP_DISABLE_NZO_CTA_DISPLAY && format.id === 'nzo-top24-de-v1') {
		return {
			enabled: false,
			finalists: [],
			heats: [],
			participants: [],
			minHeats: finalsConfig.minHeats,
			maxHeats: finalsConfig.maxHeats,
			winsRequired: finalsConfig.winsRequired,
			championId: null,
			isComplete: false,
			requiresMoreHeats: false,
			message: null,
		};
	}

	// Map bracket nodes to all assigned heats for each order
	const mapping = mapRacesToBracketHeats(races, config, format.nodes, config.runSequence ?? format.runSequence);

	// Get the two final races that feed the finals pool
	const winnersFinalRaces = mapping.get(finalsConfig.winnersFinalOrder) ?? [];
	const redemptionFinalRaces = mapping.get(finalsConfig.redemptionFinalOrder) ?? [];

	// If either final race doesn't exist, finals are not enabled
	if (winnersFinalRaces.length === 0 || redemptionFinalRaces.length === 0) {
		return {
			enabled: false,
			finalists: [],
			heats: [],
			participants: [],
			minHeats: finalsConfig.minHeats,
			maxHeats: finalsConfig.maxHeats,
			winsRequired: finalsConfig.winsRequired,
			championId: null,
			isComplete: false,
			requiresMoreHeats: false,
			message: null,
		};
	}

	// Check if all feeder heats are completed before finals can start
	const winnersHeatsComplete = winnersFinalRaces.every((race) => get(raceStatusAtom(race.id))?.isCompleted === true);
	const redemptionHeatsComplete = redemptionFinalRaces.every((race) => get(raceStatusAtom(race.id))?.isCompleted === true);

	if (!winnersHeatsComplete || !redemptionHeatsComplete) {
		return {
			enabled: false,
			finalists: [],
			heats: [],
			participants: [],
			minHeats: finalsConfig.minHeats,
			maxHeats: finalsConfig.maxHeats,
			winsRequired: finalsConfig.winsRequired,
			championId: null,
			isComplete: false,
			requiresMoreHeats: false,
			message: 'Waiting for bracket finals to complete before starting Top 6 finals.',
		};
	}

	// Extract top 3 finalists from the completed bracket nodes (supports multi-heat feeders like NZO race 18)
	const winnersNode = bracketDiagram.nodes.find((node) => node.definition.order === finalsConfig.winnersFinalOrder);
	const redemptionNode = bracketDiagram.nodes.find((node) => node.definition.order === finalsConfig.redemptionFinalOrder);

	const winnerFinalists: FinalsFinalist[] = winnersNode
		? winnersNode.slots
			.filter((slot) => slot.position != null && slot.position >= 1 && slot.position <= 3 && slot.pilotId != null)
			.map((slot) => ({
				pilotId: slot.pilotId!,
				pilotName: slot.name,
				sourceRace: 'winners' as const,
				sourcePosition: slot.position!,
			}))
		: [];

	const redemptionFinalists: FinalsFinalist[] = redemptionNode
		? redemptionNode.slots
			.filter((slot) => slot.position != null && slot.position >= 1 && slot.position <= 3 && slot.pilotId != null)
			.map((slot) => ({
				pilotId: slot.pilotId!,
				pilotName: slot.name,
				sourceRace: 'redemption' as const,
				sourcePosition: slot.position!,
			}))
		: [];

	const finalists = [...winnerFinalists, ...redemptionFinalists];

	if (finalists.length < 6) {
		return {
			enabled: false,
			finalists,
			heats: [],
			participants: [],
			minHeats: finalsConfig.minHeats,
			maxHeats: finalsConfig.maxHeats,
			winsRequired: finalsConfig.winsRequired,
			championId: null,
			isComplete: false,
			requiresMoreHeats: false,
			message: `Waiting for all 6 finalists to be determined. Currently have ${finalists.length}/6.`,
		};
	}

	// Find finals heats (races that come after the redemption final)
	const sortedRaces = [...races].sort((a, b) => a.raceOrder - b.raceOrder);
	const lastRedemptionFinalRace = redemptionFinalRaces[redemptionFinalRaces.length - 1];
	const redemptionFinalIndex = sortedRaces.findIndex((r) => r.id === lastRedemptionFinalRace.id);

	if (redemptionFinalIndex === -1) {
		return {
			enabled: true,
			finalists,
			heats: [],
			participants: [],
			minHeats: finalsConfig.minHeats,
			maxHeats: finalsConfig.maxHeats,
			winsRequired: finalsConfig.winsRequired,
			championId: null,
			isComplete: false,
			requiresMoreHeats: false,
			message: 'Finals pool determined. Waiting for finals heats to begin.',
		};
	}

	// Finals heats are races after the redemption final.
	// Some formats (e.g., NZO CTA) identify finals heats by a fixed race number.
	const finalsRaces = selectFinalsRaceCandidates(
		sortedRaces,
		lastRedemptionFinalRace.raceOrder,
		finalsConfig.finalsRaceNumber,
	);

	// Filter to only include heats with at least some finalists participating
	const finalistIds = new Set(finalists.map((f) => f.pilotId));
	const finalsHeats: FinalsHeat[] = [];
	let finalsBlockStarted = false;
	const finalsTrace: Array<{
		raceId: string;
		raceOrder: number;
		raceNumber: number;
		hasStarted: boolean;
		isActive: boolean;
		isCompleted: boolean;
		hasFinalists: boolean;
		hasFinalistLapData: boolean;
		included: boolean;
		reason: string;
	}> = [];

	for (let i = 0; i < finalsRaces.length; i++) {
		const race = finalsRaces[i];
		const status = get(raceStatusAtom(race.id));
		const rows = get(raceSortedRowsAtom(race.id));
		const processedLaps = get(raceProcessedLapsAtom(race.id));
		const hasStarted = status?.hasStarted === true || status?.isActive === true || status?.isCompleted === true;

		// Ignore future scheduled finals races that already have pilot assignments.
		if (!hasStarted) {
			finalsTrace.push({
				raceId: race.id,
				raceOrder: race.raceOrder,
				raceNumber: race.raceNumber,
				hasStarted: status?.hasStarted === true,
				isActive: status?.isActive === true,
				isCompleted: status?.isCompleted === true,
				hasFinalists: false,
				hasFinalistLapData: false,
				included: false,
				reason: finalsBlockStarted ? 'stop-after-block-unstarted-race' : 'skip-unstarted-race',
			});
			if (finalsBlockStarted) break;
			continue;
		}

		// Check if this race has any finalists
		const hasFinalists = rows.some((row) => row.pilotChannel.pilotId && finalistIds.has(row.pilotChannel.pilotId));
		const hasFinalistLapData = processedLaps.some((lap) => lap.pilotId && finalistIds.has(lap.pilotId));
		if (!hasFinalists) {
			finalsTrace.push({
				raceId: race.id,
				raceOrder: race.raceOrder,
				raceNumber: race.raceNumber,
				hasStarted: status?.hasStarted === true,
				isActive: status?.isActive === true,
				isCompleted: status?.isCompleted === true,
				hasFinalists: false,
				hasFinalistLapData,
				included: false,
				reason: finalsBlockStarted ? 'stop-after-block-non-finalist-race' : 'skip-non-finalist-race',
			});
			if (finalsBlockStarted) break;
			continue;
		}

		// Guard against races marked completed without any real finalist lap/detection data.
		if (status?.isCompleted === true && !hasFinalistLapData) {
			finalsTrace.push({
				raceId: race.id,
				raceOrder: race.raceOrder,
				raceNumber: race.raceNumber,
				hasStarted: status?.hasStarted === true,
				isActive: status?.isActive === true,
				isCompleted: true,
				hasFinalists: true,
				hasFinalistLapData: false,
				included: false,
				reason: finalsBlockStarted ? 'stop-after-block-completed-without-laps' : 'skip-completed-without-laps',
			});
			if (finalsBlockStarted) break;
			continue;
		}
		finalsBlockStarted = true;

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
		finalsTrace.push({
			raceId: race.id,
			raceOrder: race.raceOrder,
			raceNumber: race.raceNumber,
			hasStarted: status?.hasStarted === true,
			isActive: status?.isActive === true,
			isCompleted: status?.isCompleted === true,
			hasFinalists: true,
			hasFinalistLapData,
			included: true,
			reason: 'included',
		});
	}

	if (import.meta.env.DEV && format.id === 'nzo-top24-de-v1') {
		const debugPayload = {
			formatId: format.id,
			redemptionFinalRaceOrder: lastRedemptionFinalRace.raceOrder,
			configuredFinalsRaceNumber: finalsConfig.finalsRaceNumber ?? null,
			selectedFinalsCandidates: finalsRaces.map((race) => ({
				raceId: race.id,
				raceOrder: race.raceOrder,
				raceNumber: race.raceNumber,
			})),
			evaluatedRaces: finalsTrace,
			includedHeats: finalsHeats.map((heat) => ({
				raceId: heat.raceId,
				raceOrder: heat.raceOrder,
				heatNumber: heat.heatNumber,
				isActive: heat.isActive,
				isCompleted: heat.isCompleted,
			})),
		};
		const signature = JSON.stringify(debugPayload);
		if (signature !== lastNzoFinalsDebugSignature) {
			lastNzoFinalsDebugSignature = signature;
			console.debug('[finals][nzo] CTA heat selection trace', debugPayload);
		}
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
	const ranked = computeFinalsRankings(participantsArray, completedHeats, finalsConfig);

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
	const needsMoreHeats = requiresMoreHeats(participantsArray, completedHeats, finalsConfig);
	const message = getFinalsMessage(participantsArray, completedHeats, finalsHeats.length, finalsConfig);

	return {
		enabled: true,
		finalists,
		heats: finalsHeats,
		participants,
		minHeats: finalsConfig.minHeats,
		maxHeats: finalsConfig.maxHeats,
		winsRequired: finalsConfig.winsRequired,
		championId,
		isComplete: !needsMoreHeats && completedHeats >= finalsConfig.minHeats,
		requiresMoreHeats: needsMoreHeats,
		message,
	};
});
