/// <reference lib="deno.ns" />

import { assertEquals } from '@std/assert/equals';
import { applyPredictedAssignments, buildAnchorPoints, mapRacesToBracket, mapRacesToBracketHeats } from './eliminationState.ts';
import type { BracketAnchorConfig, BracketNodeSlot, BracketNodeViewModel } from './eliminationState.ts';
import type { PBRaceRecord } from '../api/pbTypes.ts';
import { BRACKET_NODES } from './doubleElimDefinition.ts';

function createRace(
	index: number,
	overrides: Partial<PBRaceRecord> = {},
): PBRaceRecord {
	return {
		id: `race-${index}`,
		sourceId: `SRC-${index}`,
		source: 'fpv',
		raceNumber: index + 1,
		start: undefined,
		end: undefined,
		totalPausedTime: undefined,
		primaryTimingSystemLocation: undefined,
		valid: true,
		bracket: '',
		targetLaps: 3,
		raceOrder: index + 1,
		event: 'event-1',
		round: `round-${Math.floor(index / 2)}`,
		lastUpdated: undefined,
		...overrides,
	};
}

const emptyConfig: BracketAnchorConfig = {
	formatId: 'double-elim-6p-v1',
	anchors: [],
	record: null,
};

Deno.test('mapRacesToBracket falls back to sequential ordering without anchors', () => {
	const races = Array.from({ length: 40 }, (_, index) => createRace(index));
	const mapping = mapRacesToBracket(races, emptyConfig);
	assertEquals(mapping.get(1)?.id, 'race-0');
	assertEquals(mapping.get(9)?.id, 'race-8');
	assertEquals(mapping.get(29)?.id, 'race-28');
});

Deno.test('buildAnchorPoints injects fallback anchor at order 1', () => {
	const races = Array.from({ length: 5 }, (_, index) => createRace(index));
	const points = buildAnchorPoints(races, {
		formatId: 'double-elim-6p-v1',
		anchors: [{ bracketOrder: 10, raceOrder: 12 }],
		record: null,
	});
	assertEquals(points[0].bracketOrder, 1);
	assertEquals(points[0].raceIndex, 0);
});

Deno.test('mapRacesToBracket respects raceOrder anchor', () => {
	const races = Array.from({ length: 35 }, (_, index) => createRace(index));
	const config = {
		formatId: 'double-elim-6p-v1',
		anchors: [
			{ bracketOrder: 5, raceOrder: 12 },
		],
		record: null,
	};
	const mapping = mapRacesToBracket(races, config);
	assertEquals(mapping.get(5)?.raceOrder, 12);
	assertEquals(mapping.get(6)?.raceOrder, 13);
	assertEquals(mapping.get(29)?.raceOrder, 36);
});

Deno.test('mapRacesToBracket resolves sourceId anchors', () => {
	const races = Array.from({ length: 50 }, (_, index) => createRace(index));
	const target = races[20];
	const config = {
		formatId: 'double-elim-6p-v1',
		anchors: [
			{ bracketOrder: 12, raceSourceId: target.sourceId },
		],
		record: null,
	};
	const mapping = mapRacesToBracket(races, config);
	assertEquals(mapping.get(12)?.id, target.id);
	assertEquals(mapping.get(13)?.id, races[21].id);
});

Deno.test('mapRacesToBracket ignores anchors that do not match races', () => {
	const races = Array.from({ length: 30 }, (_, index) => createRace(index));
	const config = {
		formatId: 'double-elim-6p-v1',
		anchors: [{ bracketOrder: 4, raceSourceId: 'unknown' }],
		record: null,
	};
	const mapping = mapRacesToBracket(races, config);
	assertEquals(mapping.get(4)?.id, 'race-3');
});

Deno.test('mapRacesToBracketHeats groups races by run sequence', () => {
	const races = Array.from({ length: 8 }, (_, index) => createRace(index));
	const mapping = mapRacesToBracketHeats(
		races,
		emptyConfig,
		BRACKET_NODES.slice(0, 3),
		[1, 2, 1, 3, 1],
	);
	assertEquals(mapping.get(1)?.map((race) => race.id), ['race-0', 'race-2', 'race-4']);
	assertEquals(mapping.get(2)?.map((race) => race.id), ['race-1']);
	assertEquals(mapping.get(3)?.map((race) => race.id), ['race-3']);
});

Deno.test('applyPredictedAssignments injects winners into downstream nodes', () => {
	const sourceDef = BRACKET_NODES.find((node) => node.order === 1)!;
	const targetDef = BRACKET_NODES.find((node) => node.order === 9)!;
	const winnerSlots: BracketNodeSlot[] = ['Alpha', 'Bravo', 'Charlie'].map((name, index) => ({
		id: `slot-winner-${index}`,
		pilotId: `pilot-${index}`,
		name,
		channelLabel: `C${index + 1}`,
		channelId: `chan-${index}`,
		position: index + 1,
		isWinner: true,
		isEliminated: false,
		isPredicted: false,
		destinationLabel: null,
		heatPoints: [10 - index],
		totalPoints: 10 - index,
	}));
	const eliminatedSlots: BracketNodeSlot[] = ['Delta', 'Echo', 'Foxtrot'].map((name, index) => ({
		id: `slot-elim-${index}`,
		pilotId: `pilot-e${index}`,
		name,
		channelLabel: `E${index + 1}`,
		channelId: `chan-e${index}`,
		position: index + 4,
		isWinner: false,
		isEliminated: true,
		isPredicted: false,
		destinationLabel: null,
		heatPoints: [null],
		totalPoints: null,
	}));
	const sourceNode: BracketNodeViewModel = {
		definition: sourceDef,
		race: null,
		raceIds: [],
		status: 'completed',
		headline: sourceDef.name,
		subline: sourceDef.code,
		expectedHeatCount: 1,
		assignedHeatCount: 1,
		slots: [...winnerSlots, ...eliminatedSlots],
	};
	const targetNode: BracketNodeViewModel = {
		definition: targetDef,
		race: null,
		raceIds: [],
		status: 'scheduled',
		headline: targetDef.name,
		subline: targetDef.code,
		expectedHeatCount: 1,
		assignedHeatCount: 0,
		slots: Array.from({ length: 6 }).map((_, idx) => ({
			id: `placeholder-${idx}`,
			pilotId: null,
			name: 'Awaiting assignment',
			channelLabel: '—',
			channelId: null,
			position: null,
			isWinner: false,
			isEliminated: false,
			isPredicted: false,
			destinationLabel: null,
			heatPoints: [null],
			totalPoints: null,
		})),
	};
	const nodeByOrder = new Map<number, BracketNodeViewModel>([
		[sourceDef.order, sourceNode],
		[targetDef.order, targetNode],
	]);

	applyPredictedAssignments(nodeByOrder);

	const downstreamSlots = nodeByOrder.get(targetDef.order)!.slots;
	const predictedNames = downstreamSlots
		.filter((slot) => slot.isPredicted)
		.map((slot) => slot.name)
		.sort();
	assertEquals(predictedNames, ['Alpha', 'Bravo', 'Charlie']);
});
