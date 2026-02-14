/// <reference lib="deno.ns" />

import { assertEquals } from '@std/assert/equals';
import type { BracketAnchorConfig, BracketDiagramViewModel, BracketNodeSlot, BracketNodeViewModel } from '../bracket/eliminationState.ts';
import { BRACKET_NODES } from '../bracket/doubleElimDefinition.ts';
import type { PBRaceRecord } from '../api/pbTypes.ts';
import { buildNextRaceEntries } from './next-race-entries.ts';

function createRace(order: number, overrides: Partial<PBRaceRecord> = {}): PBRaceRecord {
	return {
		id: `race-${order}`,
		sourceId: `SRC-${order}`,
		source: 'fpv',
		raceNumber: order,
		start: undefined,
		end: undefined,
		totalPausedTime: undefined,
		primaryTimingSystemLocation: undefined,
		valid: true,
		bracket: '',
		targetLaps: 3,
		raceOrder: order,
		event: 'event-1',
		round: BRACKET_NODES[0]?.roundId ?? 'round1',
		lastUpdated: undefined,
		...overrides,
	};
}

function createNode(
	index: number,
	slotOverrides: Partial<BracketNodeSlot>[] = [],
	race: PBRaceRecord | null = null,
): BracketNodeViewModel {
	const definition = BRACKET_NODES[index];
	const baseSlot: BracketNodeSlot = {
		id: `slot-${index}`,
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
	};
	const slots = slotOverrides.length > 0
		? slotOverrides.map((override, idx) => ({ ...baseSlot, id: `${baseSlot.id}-${idx}`, ...override }))
		: [baseSlot];
	return {
		definition,
		race,
		raceIds: race ? [race.id] : [],
		status: race ? 'scheduled' : 'unassigned',
		headline: definition.name,
		subline: definition.code,
		expectedHeatCount: 1,
		assignedHeatCount: race ? 1 : 0,
		slots,
	};
}

const emptyAnchors: BracketAnchorConfig = { formatId: 'double-elim-6p-v1', anchors: [], record: null };

Deno.test('buildNextRaceEntries includes predicted nodes after real races', () => {
	const upcomingRace = createRace(5);
	const realNode = createNode(0, [{ pilotId: 'pilot-1', name: 'Actual Pilot', isPredicted: false }], upcomingRace);
	const predictedNode = createNode(1, [{
		pilotId: 'pilot-2',
		name: 'Predicted Pilot',
		isPredicted: true,
	}], null);

	const diagram: BracketDiagramViewModel = {
		nodes: [realNode, predictedNode],
		edges: [],
		rounds: [],
		anchors: emptyAnchors,
	};

	const entries = buildNextRaceEntries([upcomingRace], diagram);
	assertEquals(entries.length, 2);
	assertEquals(entries[0].raceId, upcomingRace.id);
	assertEquals(entries[0].isPredicted, false);
	assertEquals(entries[1].raceId, `predicted-race-${predictedNode.definition.order}`);
	assertEquals(entries[1].isPredicted, true);
	assertEquals(entries[1].definition?.name, predictedNode.definition.name);
});

Deno.test('buildNextRaceEntries respects max entry cap', () => {
	const raceOne = createRace(10);
	const predictedNode = createNode(1, [{ pilotId: 'pilot-2', name: 'P2', isPredicted: true }], null);
	const diagram: BracketDiagramViewModel = {
		nodes: [
			createNode(0, [{ pilotId: 'pilot-1', name: 'P1' }], raceOne),
			predictedNode,
		],
		edges: [],
		rounds: [],
		anchors: emptyAnchors,
	};

	const entries = buildNextRaceEntries([raceOne], diagram, 1);
	assertEquals(entries.length, 1);
	assertEquals(entries[0].raceId, raceOne.id);
});

Deno.test('buildNextRaceEntries orders predicted nodes by run sequence', () => {
	const nodeForRace10 = createNode(0, [{ pilotId: 'pilot-10', name: 'P10', isPredicted: true }], null);
	nodeForRace10.definition = { ...nodeForRace10.definition, order: 10 };
	nodeForRace10.assignedHeatCount = 0;
	const nodeForRace11 = createNode(1, [{ pilotId: 'pilot-11', name: 'P11', isPredicted: true }], null);
	nodeForRace11.definition = { ...nodeForRace11.definition, order: 11 };
	nodeForRace11.assignedHeatCount = 0;

	const diagram: BracketDiagramViewModel = {
		nodes: [nodeForRace11, nodeForRace10],
		edges: [],
		rounds: [],
		anchors: emptyAnchors,
		runSequence: [11, 10],
	};

	const entries = buildNextRaceEntries([], diagram);
	assertEquals(entries[0].raceId, 'predicted-race-11');
	assertEquals(entries[1].raceId, 'predicted-race-10');
});
