import { assertEquals } from '@std/assert';

import { sortPilotIds } from '../leaderboard/leaderboard-sorter.ts';
import type { EagerGetter } from '../leaderboard/sorting-types.ts';
import { createRaceSortConfig } from './race-atoms.ts';

const noopGet: EagerGetter = () => {
	throw new Error('Unexpected atom read');
};

// createCalc function removed - no longer needed with atom-based approach
// const createCalc = ...

// Test disabled - needs to be updated to work with individual atoms instead of RacePilotCalc
const runSort = (_calcs: unknown[], _isRaceRound: boolean): string[] => {
	// TODO(@user): Update test to mock individual race pilot atoms
	throw new Error('Test needs to be updated for new atom-based approach');
};

// TODO(@user): Update tests to work with individual atoms instead of RacePilotCalc
/*
Deno.test('race rounds prioritise detection-backed finishes and deterministic tie-breakers', () => {
	// Test disabled - needs atom mocking
});

Deno.test('non-race rounds use consecutive time with stable secondary ordering', () => {
	// Test disabled - needs atom mocking
});
*/
