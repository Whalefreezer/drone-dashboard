/// <reference lib="deno.ns" />

import { assertEquals } from '@std/assert';
import {
	computeFinalsRankings,
	computeWins,
	getFinalsMessage,
	positionToPoints,
	type RankingInput,
	requiresMoreHeats,
} from './finals-ranking.ts';

// Helper to create test data
function createParticipant(
	pilotId: string,
	pilotName: string,
	heatResults: Array<{ position: number; points: number }>,
): RankingInput {
	return {
		pilotId,
		pilotName,
		wins: computeWins(heatResults.map((r, idx) => ({
			pilotId,
			pilotName,
			position: r.position,
			points: r.points,
		}))),
		heatResults: heatResults.map((r, idx) => ({
			pilotId,
			pilotName,
			position: r.position,
			points: r.points,
		})),
	};
}

Deno.test('positionToPoints maps positions correctly', () => {
	assertEquals(positionToPoints(1), 100);
	assertEquals(positionToPoints(2), 80);
	assertEquals(positionToPoints(3), 60);
	assertEquals(positionToPoints(4), 40);
	assertEquals(positionToPoints(5), 20);
	assertEquals(positionToPoints(6), 10);
	assertEquals(positionToPoints(7), 0);
});

Deno.test('computeWins counts first place finishes', () => {
	const results = [
		{ pilotId: 'p1', pilotName: 'Alice', position: 1, points: 100 },
		{ pilotId: 'p1', pilotName: 'Alice', position: 2, points: 80 },
		{ pilotId: 'p1', pilotName: 'Alice', position: 1, points: 100 },
	];
	assertEquals(computeWins(results), 2);
});

Deno.test('computeFinalsRankings identifies champion with 2 wins', () => {
	const participants = [
		createParticipant('p1', 'Alice', [
			{ position: 1, points: 100 },
			{ position: 1, points: 100 },
			{ position: 3, points: 60 },
		]),
		createParticipant('p2', 'Bob', [
			{ position: 2, points: 80 },
			{ position: 2, points: 80 },
			{ position: 1, points: 100 },
		]),
	];

	const ranked = computeFinalsRankings(participants, 3);

	assertEquals(ranked[0].pilotId, 'p1');
	assertEquals(ranked[0].isChampion, true);
	assertEquals(ranked[0].finalPosition, 1);
	assertEquals(ranked[0].wins, 2);
});

Deno.test('computeFinalsRankings applies best-of scoring for 3+ heats', () => {
	const participants = [
		createParticipant('p1', 'Alice', [
			{ position: 1, points: 100 },
			{ position: 1, points: 100 },
			{ position: 6, points: 10 }, // Worst result
		]),
		createParticipant('p2', 'Bob', [
			{ position: 2, points: 80 },
			{ position: 2, points: 80 },
			{ position: 2, points: 80 },
		]),
	];

	const ranked = computeFinalsRankings(participants, 3);

	// Alice: total 210, best-of 200 (210 - 10)
	// Bob: total 240, best-of 160 (240 - 80)
	assertEquals(ranked[0].pilotId, 'p1'); // Alice is champion
	assertEquals(ranked[0].bestOfScore, 200);
	assertEquals(ranked[1].pilotId, 'p2');
	assertEquals(ranked[1].bestOfScore, 160);
});

Deno.test('computeFinalsRankings does not apply best-of for fewer than 3 heats', () => {
	const participants = [
		createParticipant('p1', 'Alice', [
			{ position: 1, points: 100 },
			{ position: 3, points: 60 },
		]),
	];

	const ranked = computeFinalsRankings(participants, 2);

	assertEquals(ranked[0].bestOfScore, 160); // No worst result dropped
	assertEquals(ranked[0].worstHeatPoints, null);
});

Deno.test('computeFinalsRankings ranks by best-of score when no champion', () => {
	const participants = [
		createParticipant('p1', 'Alice', [
			{ position: 2, points: 80 },
			{ position: 1, points: 100 },
			{ position: 3, points: 60 },
		]),
		createParticipant('p2', 'Bob', [
			{ position: 1, points: 100 },
			{ position: 3, points: 60 },
			{ position: 2, points: 80 },
		]),
		createParticipant('p3', 'Carol', [
			{ position: 3, points: 60 },
			{ position: 2, points: 80 },
			{ position: 1, points: 100 },
		]),
	];

	const ranked = computeFinalsRankings(participants, 3);

	// All have 1 win and same total (240)
	// Best-of scores: Alice 180, Bob 180, Carol 180
	// Should be tied on best-of, then by total points (all 240)
	assertEquals(ranked[0].isChampion, false);
	assertEquals(ranked.every((p) => p.bestOfScore === 180), true);
});

Deno.test('requiresMoreHeats returns true for fewer than 3 heats', () => {
	const participants = [
		createParticipant('p1', 'Alice', [{ position: 1, points: 100 }]),
	];
	assertEquals(requiresMoreHeats(participants, 1), true);
	assertEquals(requiresMoreHeats(participants, 2), true);
});

Deno.test('requiresMoreHeats returns true when no champion after 3 heats', () => {
	const participants = [
		createParticipant('p1', 'Alice', [
			{ position: 1, points: 100 },
			{ position: 2, points: 80 },
			{ position: 3, points: 60 },
		]),
	];
	assertEquals(requiresMoreHeats(participants, 3), true);
});

Deno.test('requiresMoreHeats returns false when champion exists after 3 heats', () => {
	const participants = [
		createParticipant('p1', 'Alice', [
			{ position: 1, points: 100 },
			{ position: 1, points: 100 },
			{ position: 3, points: 60 },
		]),
	];
	assertEquals(requiresMoreHeats(participants, 3), false);
});

Deno.test('requiresMoreHeats returns false after 7 heats', () => {
	const participants = [
		createParticipant('p1', 'Alice', [
			{ position: 2, points: 80 },
			{ position: 2, points: 80 },
			{ position: 2, points: 80 },
			{ position: 2, points: 80 },
			{ position: 2, points: 80 },
			{ position: 2, points: 80 },
			{ position: 2, points: 80 },
		]),
	];
	assertEquals(requiresMoreHeats(participants, 7), false);
});

Deno.test('getFinalsMessage returns appropriate message for no heats', () => {
	const participants: RankingInput[] = [];
	const message = getFinalsMessage(participants, 0, 0);
	assertEquals(message, 'Finals have not started yet.');
});

Deno.test('getFinalsMessage returns waiting message for fewer than 3 heats', () => {
	const participants = [
		createParticipant('p1', 'Alice', [{ position: 1, points: 100 }]),
	];
	const message = getFinalsMessage(participants, 1, 1);
	assertEquals(
		message,
		'Finals waiting for results. At least 2 more heats must complete before rankings lock in.',
	);
});

Deno.test('getFinalsMessage returns champion message when 2 wins achieved', () => {
	const participants = [
		createParticipant('p1', 'Alice', [
			{ position: 1, points: 100 },
			{ position: 1, points: 100 },
			{ position: 3, points: 60 },
		]),
	];
	const message = getFinalsMessage(participants, 3, 3);
	assertEquals(message, 'Alice is the champion with 2 wins!');
});

Deno.test('getFinalsMessage returns in-progress message when no champion after 3 heats', () => {
	const participants = [
		createParticipant('p1', 'Alice', [
			{ position: 1, points: 100 },
			{ position: 2, points: 80 },
			{ position: 3, points: 60 },
		]),
	];
	const message = getFinalsMessage(participants, 3, 3);
	assertEquals(message, 'Finals in progress. Waiting for a pilot to earn 2 wins.');
});

Deno.test('getFinalsMessage returns max heats message after 7 heats', () => {
	const participants = [
		createParticipant('p1', 'Alice', [
			{ position: 2, points: 80 },
			{ position: 2, points: 80 },
			{ position: 2, points: 80 },
			{ position: 2, points: 80 },
			{ position: 2, points: 80 },
			{ position: 2, points: 80 },
			{ position: 2, points: 80 },
		]),
	];
	const message = getFinalsMessage(participants, 7, 7);
	assertEquals(message, 'Finals complete. Maximum heats reached.');
});

Deno.test('computeFinalsRankings supports custom winsRequired (3 for CTA)', () => {
	const participants = [
		createParticipant('p1', 'Alice', [
			{ position: 1, points: 100 },
			{ position: 1, points: 100 },
			{ position: 2, points: 80 },
		]),
		createParticipant('p2', 'Bob', [
			{ position: 2, points: 80 },
			{ position: 2, points: 80 },
			{ position: 1, points: 100 },
		]),
	];

	const ranked = computeFinalsRankings(participants, 3, { minHeats: 3, maxHeats: 13, winsRequired: 3 });
	assertEquals(ranked[0].isChampion, false);
});

Deno.test('getFinalsMessage uses custom winsRequired text', () => {
	const participants = [
		createParticipant('p1', 'Alice', [
			{ position: 1, points: 100 },
			{ position: 2, points: 80 },
			{ position: 3, points: 60 },
		]),
	];
	const message = getFinalsMessage(participants, 3, 3, { minHeats: 3, maxHeats: 13, winsRequired: 3 });
	assertEquals(message, 'Finals in progress. Waiting for a pilot to earn 3 wins.');
});
