/// <reference lib="deno.ns" />

import { assertEquals } from '@std/assert/equals';
import { buildAnchorPoints, mapRacesToBracket } from './eliminationState.ts';
import type { BracketAnchorConfig } from './eliminationState.ts';
import type { PBRaceRecord } from '../api/pbTypes.ts';

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
	bracketId: 'double-elim-6p-v1',
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
		bracketId: 'double-elim-6p-v1',
		anchors: [{ bracketOrder: 10, raceOrder: 12 }],
		record: null,
	});
	assertEquals(points[0].bracketOrder, 1);
	assertEquals(points[0].raceIndex, 0);
});

Deno.test('mapRacesToBracket respects raceOrder anchor', () => {
	const races = Array.from({ length: 35 }, (_, index) => createRace(index));
	const config = {
		bracketId: 'double-elim-6p-v1',
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
		bracketId: 'double-elim-6p-v1',
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
		bracketId: 'double-elim-6p-v1',
		anchors: [{ bracketOrder: 4, raceSourceId: 'unknown' }],
		record: null,
	};
	const mapping = mapRacesToBracket(races, config);
	assertEquals(mapping.get(4)?.id, 'race-3');
});
