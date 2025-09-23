import { assertEquals } from '@std/assert';

import { sortPilotIds } from '../leaderboard/leaderboard-sorter.ts';
import type { EagerGetter } from '../leaderboard/sorting-types.ts';
import { createRaceSortConfig, type RacePilotCalc } from './race-atoms.ts';

const noopGet: EagerGetter = () => {
	throw new Error('Unexpected atom read');
};

const createCalc = (overrides: Partial<RacePilotCalc>): RacePilotCalc => ({
	pilotChannel: overrides.pilotChannel ?? { id: crypto.randomUUID(), pilotId: crypto.randomUUID(), channelId: crypto.randomUUID() },
	completedLaps: overrides.completedLaps ?? 0,
	completionTime: overrides.completionTime ?? Number.POSITIVE_INFINITY,
	consecutiveTime: overrides.consecutiveTime ?? Number.POSITIVE_INFINITY,
	finishElapsedMs: overrides.finishElapsedMs ?? Number.POSITIVE_INFINITY,
	finishDetectionMs: overrides.finishDetectionMs ?? Number.POSITIVE_INFINITY,
	firstDetectionMs: overrides.firstDetectionMs ?? Number.POSITIVE_INFINITY,
	bestLapSeconds: overrides.bestLapSeconds ?? Number.POSITIVE_INFINITY,
});

const runSort = (calcs: RacePilotCalc[], isRaceRound: boolean): string[] => {
	const calcMap = new Map<string, RacePilotCalc>();
	const channelOrder = new Map<string, number>();
	calcs.forEach((calc, index) => {
		calcMap.set(calc.pilotChannel.pilotId, calc);
		channelOrder.set(calc.pilotChannel.pilotId, index);
	});

	const config = createRaceSortConfig(
		(_get, pilotId) => calcMap.get(pilotId) ?? null,
		(_get, pilotId) => channelOrder.get(pilotId) ?? null,
		isRaceRound,
	);

	return sortPilotIds(
		calcs.map((calc) => calc.pilotChannel.pilotId),
		noopGet,
		config,
	);
};

Deno.test('race rounds prioritise detection-backed finishes and deterministic tie-breakers', () => {
	const winner = createCalc({
		pilotChannel: { id: 'pc-1', pilotId: 'pilot-a', channelId: '1' },
		completedLaps: 3,
		completionTime: 75,
		finishElapsedMs: 70000,
		finishDetectionMs: 1_700_070_000,
		firstDetectionMs: 1_700_005_000,
		bestLapSeconds: 24.1,
	});

	const tieBreaker = createCalc({
		pilotChannel: { id: 'pc-2', pilotId: 'pilot-b', channelId: '2' },
		completedLaps: 3,
		completionTime: 75,
		finishElapsedMs: 70000,
		finishDetectionMs: 1_700_069_500,
		firstDetectionMs: 1_700_005_100,
		bestLapSeconds: 24.8,
	});

	const slower = createCalc({
		pilotChannel: { id: 'pc-3', pilotId: 'pilot-c', channelId: '3' },
		completedLaps: 3,
		completionTime: 78,
		finishElapsedMs: 78000,
		finishDetectionMs: 1_700_078_000,
		firstDetectionMs: 1_700_005_200,
		bestLapSeconds: 25.3,
	});

	const fallback = createCalc({
		pilotChannel: { id: 'pc-4', pilotId: 'pilot-d', channelId: '4' },
		completedLaps: 3,
		completionTime: 74,
		bestLapSeconds: 23.9,
	});

	const incomplete = createCalc({
		pilotChannel: { id: 'pc-5', pilotId: 'pilot-e', channelId: '5' },
		completedLaps: 2,
		bestLapSeconds: 26.1,
		firstDetectionMs: 1_700_006_000,
	});

	const sorted = runSort([fallback, slower, winner, tieBreaker, incomplete], true);
	assertEquals(sorted, ['pilot-b', 'pilot-a', 'pilot-c', 'pilot-d', 'pilot-e']);
});

Deno.test('non-race rounds use consecutive time with stable secondary ordering', () => {
	const leading = createCalc({
		pilotChannel: { id: 'pc-10', pilotId: 'pilot-x', channelId: '10' },
		completedLaps: 5,
		consecutiveTime: 90,
		bestLapSeconds: 27,
		finishElapsedMs: 450,
		firstDetectionMs: 900,
	});

	const tieOnConsecutive = createCalc({
		pilotChannel: { id: 'pc-11', pilotId: 'pilot-y', channelId: '11' },
		completedLaps: 5,
		consecutiveTime: 90,
		bestLapSeconds: 26.5,
		finishElapsedMs: 460,
		firstDetectionMs: 910,
	});

	const slowerWindow = createCalc({
		pilotChannel: { id: 'pc-12', pilotId: 'pilot-z', channelId: '12' },
		completedLaps: 4,
		consecutiveTime: 94,
		bestLapSeconds: 28.1,
		finishElapsedMs: 480,
		firstDetectionMs: 920,
	});

	const noWindow = createCalc({
		pilotChannel: { id: 'pc-13', pilotId: 'pilot-w', channelId: '13' },
		completedLaps: 4,
		bestLapSeconds: 27.8,
		firstDetectionMs: 915,
	});

	const sorted = runSort([noWindow, slowerWindow, leading, tieOnConsecutive], false);
	assertEquals(sorted, ['pilot-y', 'pilot-x', 'pilot-z', 'pilot-w']);
});
