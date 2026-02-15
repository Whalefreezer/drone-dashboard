/// <reference lib="deno.ns" />

import { assertEquals } from '@std/assert/equals';
import type { PBRaceRecord } from '../api/pbTypes.ts';
import { selectFinalsRaceCandidates } from './finalsState.ts';

function createRace(order: number, raceNumber: number): PBRaceRecord {
	return {
		id: `race-${order}`,
		sourceId: `SRC-${order}`,
		source: 'fpv',
		raceNumber,
		start: undefined,
		end: undefined,
		totalPausedTime: undefined,
		primaryTimingSystemLocation: undefined,
		valid: true,
		bracket: '',
		targetLaps: 3,
		raceOrder: order,
		event: 'event-1',
		round: 'round-1',
		lastUpdated: undefined,
	};
}

Deno.test('selectFinalsRaceCandidates filters NZO CTA heats to race 19 after redemption final', () => {
	const sortedRaces = [
		createRace(45, 18),
		createRace(46, 19),
		createRace(47, 7),
		createRace(48, 19),
		createRace(49, 12),
		createRace(50, 19),
	];

	const finals = selectFinalsRaceCandidates(sortedRaces, 45, 19);
	assertEquals(finals.map((race) => race.id), ['race-46', 'race-48', 'race-50']);
});

Deno.test('selectFinalsRaceCandidates keeps legacy behavior when finals race number is not configured', () => {
	const sortedRaces = [
		createRace(10, 10),
		createRace(11, 11),
		createRace(12, 12),
	];

	const finals = selectFinalsRaceCandidates(sortedRaces, 10);
	assertEquals(finals.map((race) => race.id), ['race-11', 'race-12']);
});

Deno.test('selectFinalsRaceCandidates falls back when configured finals race number is absent', () => {
	const sortedRaces = [
		createRace(10, 10),
		createRace(11, 1),
		createRace(12, 2),
	];

	const finals = selectFinalsRaceCandidates(sortedRaces, 10, 19);
	assertEquals(finals.map((race) => race.id), ['race-11', 'race-12']);
});
