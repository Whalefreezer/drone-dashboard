import { atomFamily } from 'jotai/utils';
import type { Atom } from 'jotai';
import {
	consecutiveLapsAtom,
	currentEventAtom,
	currentOrderKVAtom,
	racePilotChannelsAtom as baseRacePilotChannelsAtom,
	raceProcessedLapsAtom as baseRaceProcessedLapsAtom,
	raceRecordsAtom,
	roundsDataAtom,
} from '../state/pbAtoms.ts';
import { deepEqualAtomFamily } from '../state/jotai-utils.ts';
import { computeRaceStatus, RaceStatus } from './race-types.ts';
import type { PBRaceRecord } from '../api/pbTypes.ts';
import { eagerAtom } from 'jotai-eager';
import { EventType } from '../api/pbTypes.ts';
import { sortPilotIds } from '../leaderboard/leaderboard-sorter.ts';
import { type EagerGetter, NullHandling, SortDirection, type SortGroup } from '../leaderboard/sorting-types.ts';

const parsePbTimestamp = (value?: string | null): number => {
	if (!value) return Number.POSITIVE_INFINITY;
	const trimmed = value.trim();
	if (!trimmed) return Number.POSITIVE_INFINITY;
	const numeric = Number(trimmed);
	if (Number.isFinite(numeric)) return numeric;
	const parsed = Date.parse(trimmed);
	return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed;
};

const DESCENDING = SortDirection.Descending;
const ASCENDING = SortDirection.Ascending;

const LAST = NullHandling.Last;

const createValueGetter = (
	atomFamily: (key: [string, string]) => Atom<unknown>,
) =>
(get: EagerGetter, pilotId: string, context: { raceId: string }): number | null =>
	get(atomFamily([context.raceId, pilotId])) as number | null;

export const racePilotCompletedLapsAtom = deepEqualAtomFamily(([raceId, pilotId]: [string, string]) =>
	eagerAtom((get): number => {
		const processedLaps = get(baseRaceProcessedLapsAtom(raceId));
		return processedLaps.filter((lap) => lap.pilotId === pilotId && !lap.isHoleshot).length;
	})
);

export const racePilotConsecutiveTimeAtom = deepEqualAtomFamily(([raceId, pilotId]: [string, string]) =>
	eagerAtom((get): number | null => {
		const n = get(consecutiveLapsAtom);
		const processedLaps = get(baseRaceProcessedLapsAtom(raceId));
		const racingLaps = processedLaps.filter((lap) => lap.pilotId === pilotId && !lap.isHoleshot);

		if (n <= 0 || racingLaps.length < n) return null;

		let bestTime = Number.POSITIVE_INFINITY;
		for (let i = 0; i <= racingLaps.length - n; i++) {
			const time = racingLaps.slice(i, i + n).reduce((sum, lap) => sum + lap.lengthSeconds, 0);
			if (time < bestTime) bestTime = time;
		}
		return bestTime;
	})
);

export const racePilotBestLapAtom = deepEqualAtomFamily(([raceId, pilotId]: [string, string]) =>
	eagerAtom((get): number | null => {
		const processedLaps = get(baseRaceProcessedLapsAtom(raceId));
		const racingLaps = processedLaps.filter((lap) => lap.pilotId === pilotId && !lap.isHoleshot);
		if (racingLaps.length === 0) return null;
		return Math.min(...racingLaps.map((lap) => lap.lengthSeconds));
	})
);

export const racePilotFinishElapsedMsAtom = deepEqualAtomFamily(([raceId, pilotId]: [string, string]) =>
	eagerAtom((get): number | null => {
		const race = get(raceDataAtom(raceId));
		const processedLaps = get(baseRaceProcessedLapsAtom(raceId));
		const target = race?.targetLaps ?? 0;

		if (target === 0) return null;

		const pilotLaps = processedLaps.filter((lap) => lap.pilotId === pilotId);
		const racingLaps = pilotLaps.filter((lap) => !lap.isHoleshot);

		if (racingLaps.length < target) return null;

		// Find the target-th racing lap
		const targetLap = racingLaps[target - 1];
		const detectionTime = parsePbTimestamp(targetLap.detectionTime);

		if (!Number.isFinite(detectionTime)) return null;

		const raceStartTs = parsePbTimestamp(race?.start);
		return Number.isFinite(raceStartTs) ? detectionTime - raceStartTs : detectionTime;
	})
);

export const racePilotFinishDetectionMsAtom = deepEqualAtomFamily(([raceId, pilotId]: [string, string]) =>
	eagerAtom((get): number | null => {
		const race = get(raceDataAtom(raceId));
		const processedLaps = get(baseRaceProcessedLapsAtom(raceId));
		const target = race?.targetLaps ?? 0;

		if (target === 0) return null;

		const pilotLaps = processedLaps.filter((lap) => lap.pilotId === pilotId);
		const racingLaps = pilotLaps.filter((lap) => !lap.isHoleshot);

		if (racingLaps.length < target) return null;

		// Find the target-th racing lap
		const targetLap = racingLaps[target - 1];
		const detectionTime = parsePbTimestamp(targetLap.detectionTime);
		return Number.isFinite(detectionTime) ? detectionTime : null;
	})
);

/**
 * Completion time for a pilot in a specific race (holeshot + first N laps)
 */
export const racePilotCompletionTimeAtom = deepEqualAtomFamily(([raceId, pilotId]: [string, string]) =>
	eagerAtom((get): number | null => {
		const race = get(raceDataAtom(raceId));
		const processedLaps = get(baseRaceProcessedLapsAtom(raceId));
		const target = race?.targetLaps ?? 0;

		if (target === 0) return null;

		const pilotLaps = processedLaps.filter((lap) => lap.pilotId === pilotId);
		const holeshot = pilotLaps.find((lap) => lap.isHoleshot);
		const racingLaps = pilotLaps.filter((lap) => !lap.isHoleshot);

		if (!holeshot || racingLaps.length < target) return null;

		const holeshotTime = holeshot.lengthSeconds;
		const racingTime = racingLaps.slice(0, target).reduce((sum, lap) => sum + lap.lengthSeconds, 0);
		return holeshotTime + racingTime;
	})
);

/**
 * Total race time for a pilot (holeshot + all completed laps) - used for sorting incomplete pilots
 */
export const racePilotTotalTimeAtom = deepEqualAtomFamily(([raceId, pilotId]: [string, string]) =>
	eagerAtom((get): number | null => {
		const processedLaps = get(baseRaceProcessedLapsAtom(raceId));
		const pilotLaps = processedLaps.filter((lap) => lap.pilotId === pilotId);
		const holeshot = pilotLaps.find((lap) => lap.isHoleshot);
		const racingLaps = pilotLaps.filter((lap) => !lap.isHoleshot);

		if (!holeshot) return null;

		const holeshotTime = holeshot.lengthSeconds;
		const racingTime = racingLaps.reduce((sum, lap) => sum + lap.lengthSeconds, 0);
		return holeshotTime + racingTime;
	})
);

export const racePilotFirstDetectionMsAtom = deepEqualAtomFamily(([raceId, pilotId]: [string, string]) =>
	eagerAtom((get): number | null => {
		const processedLaps = get(baseRaceProcessedLapsAtom(raceId));
		const pilotLaps = processedLaps.filter((lap) => lap.pilotId === pilotId);
		const detectionTimes = pilotLaps
			.map((lap) => parsePbTimestamp(lap.detectionTime))
			.filter((time) => Number.isFinite(time));

		return detectionTimes.length > 0 ? Math.min(...detectionTimes) : null;
	})
);

export const createRaceSortConfig = (
	isRaceRound: boolean,
): SortGroup<{ raceId: string }>[] => {
	const completedCondition = (get: EagerGetter, pilotId: string, context: { raceId: string }) =>
		get(racePilotFinishElapsedMsAtom([context.raceId, pilotId])) != null ||
		get(racePilotCompletionTimeAtom([context.raceId, pilotId])) != null;

	const hasConsecutiveCondition = (get: EagerGetter, pilotId: string, context: { raceId: string }) =>
		get(racePilotConsecutiveTimeAtom([context.raceId, pilotId])) != null;

	const channelValue = (get: EagerGetter, pilotId: string, context: { raceId: string }) =>
		get(racePilotChannelOrderAtom(context.raceId)).get(pilotId) ?? null;

	const consecutiveValue = createValueGetter(racePilotConsecutiveTimeAtom);
	const bestLapValue = createValueGetter(racePilotBestLapAtom);
	const finishElapsedValue = createValueGetter(racePilotFinishElapsedMsAtom);
	const finishDetectionValue = createValueGetter(racePilotFinishDetectionMsAtom);
	const completionTimeValue = createValueGetter(racePilotCompletionTimeAtom);
	const totalTimeValue = createValueGetter(racePilotTotalTimeAtom);
	const firstDetectionValue = createValueGetter(racePilotFirstDetectionMsAtom);
	const completedLapsValue = createValueGetter(racePilotCompletedLapsAtom);

	if (isRaceRound) {
		return [
			{
				name: 'Completed',
				condition: completedCondition,
				criteria: [
					{ getValue: finishElapsedValue, direction: ASCENDING, nullHandling: LAST },
					{ getValue: finishDetectionValue, direction: ASCENDING, nullHandling: LAST },
					{ getValue: completionTimeValue, direction: ASCENDING, nullHandling: LAST },
					{ getValue: bestLapValue, direction: ASCENDING, nullHandling: LAST },
					{ getValue: firstDetectionValue, direction: ASCENDING, nullHandling: LAST },
					{ getValue: completedLapsValue, direction: DESCENDING, nullHandling: LAST },
					{ getValue: channelValue, direction: ASCENDING, nullHandling: LAST },
				],
			},
			{
				name: 'Incomplete',
				condition: (get: EagerGetter, pilotId: string, context: { raceId: string }) => !completedCondition(get, pilotId, context),
				criteria: [
					{ getValue: completedLapsValue, direction: DESCENDING, nullHandling: LAST },
					{ getValue: totalTimeValue, direction: ASCENDING, nullHandling: LAST },
					{ getValue: firstDetectionValue, direction: ASCENDING, nullHandling: LAST },
					{ getValue: channelValue, direction: ASCENDING, nullHandling: LAST },
				],
			},
			{
				name: 'Fallback',
				criteria: [
					{ getValue: channelValue, direction: ASCENDING, nullHandling: LAST },
				],
			},
		];
	}

	return [
		{
			name: 'With Consecutive',
			condition: hasConsecutiveCondition,
			criteria: [
				{ getValue: consecutiveValue, direction: ASCENDING, nullHandling: LAST },
				{ getValue: bestLapValue, direction: ASCENDING, nullHandling: LAST },
				{ getValue: finishElapsedValue, direction: ASCENDING, nullHandling: LAST },
				{ getValue: completedLapsValue, direction: DESCENDING, nullHandling: LAST },
				{ getValue: firstDetectionValue, direction: ASCENDING, nullHandling: LAST },
				{ getValue: channelValue, direction: ASCENDING, nullHandling: LAST },
			],
		},
		{
			name: 'Without Consecutive',
			condition: (get: EagerGetter, pilotId: string, context: { raceId: string }) => !hasConsecutiveCondition(get, pilotId, context),
			criteria: [
				{ getValue: completedLapsValue, direction: DESCENDING, nullHandling: LAST },
				{ getValue: bestLapValue, direction: ASCENDING, nullHandling: LAST },
				{ getValue: firstDetectionValue, direction: ASCENDING, nullHandling: LAST },
				{ getValue: channelValue, direction: ASCENDING, nullHandling: LAST },
			],
		},
		{
			name: 'Fallback',
			criteria: [
				{ getValue: channelValue, direction: ASCENDING, nullHandling: LAST },
			],
		},
	];
};

const racePilotChannelOrderAtom = atomFamily((raceId: string) =>
	eagerAtom((get): Map<string, number> => {
		const pilotChannels = get(baseRacePilotChannelsAtom(raceId));
		const order = new Map<string, number>();
		pilotChannels.forEach((channel, index) => {
			order.set(channel.pilotId, index);
		});
		return order;
	})
);

/**
 * Sorted pilot rows for LapsView based on event type:
 * - Race: first to complete targetLaps, then by most laps
 * - Others: fastest N consecutive (N = laps), then by most laps
 */
export const raceSortedRowsAtom = atomFamily((raceId: string) =>
	eagerAtom((get): { pilotChannel: { id: string; pilotId: string; channelId: string }; position: number }[] => {
		const race = get(raceDataAtom(raceId));
		if (!race) return [];
		const rounds = get(roundsDataAtom);
		const isRaceRound = rounds.find((r) => r.id === (race.round ?? ''))?.eventType === EventType.Race;
		const pilotChannels = get(baseRacePilotChannelsAtom(raceId));
		if (pilotChannels.length === 0) return [];

		const config = createRaceSortConfig(isRaceRound);
		const pilotIds = pilotChannels.map((pc) => pc.pilotId);
		const sortedIds = sortPilotIds(pilotIds, get, config, { raceId });
		const pilotChannelMap = new Map<string, { id: string; pilotId: string; channelId: string }>();
		pilotChannels.forEach((pc) => pilotChannelMap.set(pc.pilotId, pc));
		return sortedIds.map((pilotId, idx) => ({
			pilotChannel: pilotChannelMap.get(pilotId) ?? { id: pilotId, pilotId, channelId: '' },
			position: idx + 1,
		}));
	})
);

/**
 * Max lap number present in a race (for column count)
 */
export const raceMaxLapNumberAtom = atomFamily((raceId: string) =>
	eagerAtom((get): number => {
		const processedLaps = get(baseRaceProcessedLapsAtom(raceId));
		return Math.max(0, ...processedLaps.map((lap) => lap.lapNumber));
	})
);

// Re-export the dedicated atoms for convenience in race domain
export { baseRacePilotChannelsAtom as racePilotChannelsAtom, baseRaceProcessedLapsAtom as raceProcessedLapsAtom };

export const raceDataAtom = atomFamily((raceId: string) =>
	eagerAtom((get): PBRaceRecord | null => {
		const currentEvent = get(currentEventAtom);
		if (!currentEvent) return null;

		// Get the PB race record directly
		const raceRecords = get(raceRecordsAtom);
		const raceRecord = raceRecords.find(
			(r) => r.id === raceId && r.event === currentEvent.id,
		);
		if (!raceRecord) return null;
		return raceRecord;
	})
);

/**
 * Race status atom family for checking if a race is active/completed
 */
export const raceStatusAtom = atomFamily((raceId: string) =>
	eagerAtom((get): RaceStatus | null => {
		const currentEvent = get(currentEventAtom);
		if (!currentEvent) return null;

		const raceRecords = get(raceRecordsAtom);
		const raceRecord = raceRecords.find(
			(r) => r.id === raceId && r.event === currentEvent.id,
		);
		if (!raceRecord) return null;

		return computeRaceStatus(raceRecord);
	})
);

/**
 * All races for the current event - PB native
 */
export const allRacesAtom = eagerAtom((get): PBRaceRecord[] => {
	const currentEvent = get(currentEventAtom);
	if (!currentEvent) return [];

	const raceRecords = get(raceRecordsAtom);
	const validRaceRecords = raceRecords.filter(
		(r) => r.event === currentEvent.id && r.valid !== false,
	);

	return validRaceRecords.sort((a, b) => {
		return a.raceOrder - b.raceOrder;
	});
});

/**
 * Current race detection - PB native
 *
 * Uses backend-published current order (client_kv) with sourceId/raceOrder matching:
 * 1. Match by sourceId (external system race ID)
 * 2. Fallback to raceOrder matching
 * 3. Default to first race if no matches
 */
export const currentRaceAtom = eagerAtom((get): PBRaceRecord | null => {
	const races = get(allRacesAtom);
	if (!races || races.length === 0) return null;

	// Use backend-published current order (client_kv) only
	const kv = get(currentOrderKVAtom);
	if (kv) {
		// First try to match by sourceId
		if (kv.sourceId) {
			const bySourceId = races.find((r) => r.sourceId === kv.sourceId);
			if (bySourceId) return bySourceId;
		} // Fallback to raceOrder if sourceId match fails
		else if (kv.order && kv.order > 0) {
			const byRaceOrder = races.find((r) => r.raceOrder === kv.order);
			if (byRaceOrder) return byRaceOrder;
		}
	}
	// Minimal default without local detection heuristics
	return races[0] || null;
});

/**
 * Helper to find current race index - uses currentRaceAtom to find position in allRacesAtom
 */
export const currentRaceIndexAtom = eagerAtom((get): number => {
	const races = get(allRacesAtom);
	const currentRace = get(currentRaceAtom);

	if (!races || races.length === 0 || !currentRace) {
		return -1;
	}

	return races.findIndex((race) => race.id === currentRace.id);
});

/**
 * Last race - finds the race with order = kv.order - 1
 * Consistent with currentRaceAtom logic, relies totally on kv.order
 */
export const lastRaceAtom = eagerAtom((get): PBRaceRecord | null => {
	const races = get(allRacesAtom);
	const kv = get(currentOrderKVAtom);

	if (!races || races.length === 0 || !kv?.order) {
		return null;
	}

	const lastOrder = kv.order - 1;
	if (lastOrder < 1) {
		return null;
	}

	// Find race with raceOrder = kv.order - 1
	return races.find((r) => r.raceOrder === lastOrder) ?? null;
});

/**
 * Next races atom - returns the next 8 races based on current order from KV store
 * Uses the order field from currentOrderKVAtom to find races with higher raceOrder values
 */
export const nextRacesAtom = eagerAtom((get): PBRaceRecord[] => {
	const races = get(allRacesAtom);
	const currentOrderKV = get(currentOrderKVAtom);

	if (!races || races.length === 0 || !currentOrderKV?.order) {
		return [];
	}

	const currentOrder = currentOrderKV.order;

	// Find all races with raceOrder greater than current order
	const nextRacesByOrder = races
		.filter((race) => race.raceOrder && race.raceOrder > currentOrder)
		.sort((a, b) => (a.raceOrder ?? 0) - (b.raceOrder ?? 0))
		.slice(0, 8); // Take first 8

	return nextRacesByOrder;
});
