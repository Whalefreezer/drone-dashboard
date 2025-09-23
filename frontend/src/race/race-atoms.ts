// PB-native race atoms
// This replaces the legacy raceFamilyAtom with a cleaner, more direct approach

import { atomFamily } from 'jotai/utils';
import {
	consecutiveLapsAtom,
	currentEventAtom,
	currentOrderKVAtom,
	racePilotChannelsAtom as baseRacePilotChannelsAtom,
	raceProcessedLapsAtom as baseRaceProcessedLapsAtom,
	raceRecordsAtom,
	roundsDataAtom,
} from '../state/pbAtoms.ts';
import { computeRaceStatus, RaceStatus } from './race-types.ts';
import type { PBRaceRecord } from '../api/pbTypes.ts';
import { eagerAtom } from 'jotai-eager';
import { EventType } from '../api/pbTypes.ts';

export type RacePilotCalc = {
	pilotChannel: { id: string; pilotId: string; channelId: string };
	completedLaps: number;
	completionTime: number; // holeshot + first N laps (legacy fallback for missing timestamps)
	consecutiveTime: number; // best N-consecutive time (N = event pbLaps), Infinity if not enough
	finishElapsedMs: number; // detection-derived elapsed finish time, Infinity if not completed
	finishDetectionMs: number; // absolute finish detection timestamp, Infinity if missing
	firstDetectionMs: number; // earliest detection timestamp for the pilot
	bestLapSeconds: number; // quickest non-holeshot lap, Infinity if none
};

const parsePbTimestamp = (value?: string | null): number => {
	if (!value) return Number.POSITIVE_INFINITY;
	const trimmed = value.trim();
	if (!trimmed) return Number.POSITIVE_INFINITY;
	const numeric = Number(trimmed);
	if (Number.isFinite(numeric)) return numeric;
	const parsed = Date.parse(trimmed);
	return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed;
};

const compareFiniteAsc = (a: number, b: number): number => {
	const aFinite = Number.isFinite(a);
	const bFinite = Number.isFinite(b);
	if (aFinite && bFinite) {
		const diff = a - b;
		if (diff !== 0) return diff;
		return 0;
	}
	if (aFinite) return -1;
	if (bFinite) return 1;
	return 0;
};

const compareChannelTieBreaker = (a: RacePilotCalc, b: RacePilotCalc): number => {
	const channelDiff = a.pilotChannel.channelId.localeCompare(b.pilotChannel.channelId);
	if (channelDiff !== 0) return channelDiff;
	// Fall back to pilotId for absolute determinism if channel IDs match
	return a.pilotChannel.pilotId.localeCompare(b.pilotChannel.pilotId);
};

const sortRaceRoundCalcs = (calcs: RacePilotCalc[]): RacePilotCalc[] => {
	const completed: RacePilotCalc[] = [];
	const incomplete: RacePilotCalc[] = [];

	for (const calc of calcs) {
		if (Number.isFinite(calc.finishElapsedMs) || Number.isFinite(calc.completionTime)) {
			completed.push(calc);
		} else {
			incomplete.push(calc);
		}
	}

	completed.sort((a, b) => {
		let diff = compareFiniteAsc(a.finishElapsedMs, b.finishElapsedMs);
		if (diff !== 0) return diff;

		diff = compareFiniteAsc(a.finishDetectionMs, b.finishDetectionMs);
		if (diff !== 0) return diff;

		diff = compareFiniteAsc(a.completionTime, b.completionTime);
		if (diff !== 0) return diff;

		diff = compareFiniteAsc(a.bestLapSeconds, b.bestLapSeconds);
		if (diff !== 0) return diff;

		diff = compareFiniteAsc(a.firstDetectionMs, b.firstDetectionMs);
		if (diff !== 0) return diff;

		if (a.completedLaps !== b.completedLaps) return b.completedLaps - a.completedLaps;

		return compareChannelTieBreaker(a, b);
	});

	incomplete.sort((a, b) => {
		if (a.completedLaps !== b.completedLaps) return b.completedLaps - a.completedLaps;

		let diff = compareFiniteAsc(a.bestLapSeconds, b.bestLapSeconds);
		if (diff !== 0) return diff;

		diff = compareFiniteAsc(a.firstDetectionMs, b.firstDetectionMs);
		if (diff !== 0) return diff;

		return compareChannelTieBreaker(a, b);
	});

	return [...completed, ...incomplete];
};

const sortNonRaceRoundCalcs = (calcs: RacePilotCalc[]): RacePilotCalc[] => {
	const withConsecutive: RacePilotCalc[] = [];
	const withoutConsecutive: RacePilotCalc[] = [];

	for (const calc of calcs) {
		if (Number.isFinite(calc.consecutiveTime)) {
			withConsecutive.push(calc);
		} else {
			withoutConsecutive.push(calc);
		}
	}

	withConsecutive.sort((a, b) => {
		let diff = compareFiniteAsc(a.consecutiveTime, b.consecutiveTime);
		if (diff !== 0) return diff;

		diff = compareFiniteAsc(a.bestLapSeconds, b.bestLapSeconds);
		if (diff !== 0) return diff;

		diff = compareFiniteAsc(a.finishElapsedMs, b.finishElapsedMs);
		if (diff !== 0) return diff;

		if (a.completedLaps !== b.completedLaps) return b.completedLaps - a.completedLaps;

		diff = compareFiniteAsc(a.firstDetectionMs, b.firstDetectionMs);
		if (diff !== 0) return diff;

		return compareChannelTieBreaker(a, b);
	});

	withoutConsecutive.sort((a, b) => {
		if (a.completedLaps !== b.completedLaps) return b.completedLaps - a.completedLaps;

		let diff = compareFiniteAsc(a.bestLapSeconds, b.bestLapSeconds);
		if (diff !== 0) return diff;

		diff = compareFiniteAsc(a.firstDetectionMs, b.firstDetectionMs);
		if (diff !== 0) return diff;

		return compareChannelTieBreaker(a, b);
	});

	return [...withConsecutive, ...withoutConsecutive];
};

/**
 * LapsView ordering rules (separate from leaderboard sort requirement):
 * Race rounds → completed pilots first (detection-backed finish elapsed, finish detection timestamp, legacy completion time),
 * then best lap, first detection, completed lap count, and channel/pilot tie-breakers. Remaining pilots fall back to laps → best lap → detection → channel.
 * Non-race rounds → pilots with N-consecutive totals first (ascending), then best lap, finish elapsed, completed laps, detection, channel.
 * Remaining pilots are ordered by completed laps, best lap, detection, channel to avoid unstable fallback behaviour.
 */
export const sortRacePilotRows = (calcs: RacePilotCalc[], isRaceRound: boolean): RacePilotCalc[] => {
	if (calcs.length <= 1) return [...calcs];
	return isRaceRound ? sortRaceRoundCalcs(calcs) : sortNonRaceRoundCalcs(calcs);
};

/**
 * Per-race pilot calculations used for ranking in LapsView
 */
export const racePilotCalcsAtom = atomFamily((raceId: string) =>
	eagerAtom((get): RacePilotCalc[] => {
		const race = get(raceDataAtom(raceId));
		if (!race) return [];

		const rounds = get(roundsDataAtom);
		const nConsec = get(consecutiveLapsAtom);

		const processedLaps = get(baseRaceProcessedLapsAtom(raceId));
		const pilotChannels = get(baseRacePilotChannelsAtom(raceId));

		const lapsByPilot = new Map<string, typeof processedLaps>();
		for (const lap of processedLaps) {
			const existing = lapsByPilot.get(lap.pilotId);
			if (existing) {
				existing.push(lap);
			} else {
				lapsByPilot.set(lap.pilotId, [lap]);
			}
		}

		const raceStartTs = parsePbTimestamp(race.start);
		const target = race.targetLaps ?? 0;

		return pilotChannels.map((pilotChannel) => {
			const lapsForPilot = lapsByPilot.get(pilotChannel.pilotId) ?? [];
			const holeshotLap = lapsForPilot.find((lap) => lap.isHoleshot) ?? null;
			const racingLaps = lapsForPilot.filter((lap) => !lap.isHoleshot);
			const completedLaps = racingLaps.length;

			let completionTime = Number.POSITIVE_INFINITY;
			if (target > 0 && holeshotLap && racingLaps.length >= target) {
				const holeshotSeconds = holeshotLap.lengthSeconds;
				const firstNLapSeconds = racingLaps
					.slice(0, target)
					.reduce((total, lap) => total + lap.lengthSeconds, 0);
				completionTime = holeshotSeconds + firstNLapSeconds;
			}

			let consecutiveTime = Number.POSITIVE_INFINITY;
			if (nConsec > 0 && racingLaps.length >= nConsec) {
				for (let i = 0; i <= racingLaps.length - nConsec; i++) {
					let windowSum = 0;
					for (let j = 0; j < nConsec; j++) windowSum += racingLaps[i + j].lengthSeconds;
					if (windowSum < consecutiveTime) consecutiveTime = windowSum;
				}
			}

			let bestLapSeconds = Number.POSITIVE_INFINITY;
			for (const lap of racingLaps) {
				if (lap.lengthSeconds > 0 && lap.lengthSeconds < bestLapSeconds) {
					bestLapSeconds = lap.lengthSeconds;
				}
			}

			let finishDetectionMs = Number.POSITIVE_INFINITY;
			if (target > 0 && racingLaps.length >= target) {
				const finishLap = racingLaps[target - 1];
				const parsedFinish = parsePbTimestamp(finishLap.detectionTime);
				if (Number.isFinite(parsedFinish)) finishDetectionMs = parsedFinish;
			}

			const holeshotDetectionMs = holeshotLap ? parsePbTimestamp(holeshotLap.detectionTime) : Number.POSITIVE_INFINITY;
			let finishElapsedMs = Number.POSITIVE_INFINITY;
			if (Number.isFinite(finishDetectionMs)) {
				const baseline = Number.isFinite(raceStartTs) ? raceStartTs : holeshotDetectionMs;
				if (Number.isFinite(baseline)) {
					const elapsed = finishDetectionMs - baseline;
					if (Number.isFinite(elapsed) && elapsed >= 0) finishElapsedMs = elapsed;
				}
			}
			const detectionTimes = lapsForPilot
				.map((lap) => parsePbTimestamp(lap.detectionTime))
				.filter((value) => Number.isFinite(value));
			const firstDetectionMs = detectionTimes.length > 0 ? Math.min(...detectionTimes) : Number.POSITIVE_INFINITY;

			return {
				pilotChannel,
				completedLaps,
				completionTime,
				consecutiveTime,
				finishElapsedMs,
				finishDetectionMs,
				firstDetectionMs,
				bestLapSeconds,
			};
		});
	})
);

/**
 * Sorted pilot rows for LapsView based on event type:
 * - Race: first to complete targetLaps, then by most laps
 * - Others: fastest N consecutive (N = pbLaps), then by most laps
 */
export const raceSortedRowsAtom = atomFamily((raceId: string) =>
	eagerAtom((get): { pilotChannel: { id: string; pilotId: string; channelId: string }; position: number }[] => {
		const race = get(raceDataAtom(raceId));
		if (!race) return [];
		const rounds = get(roundsDataAtom);
		const isRaceRound = rounds.find((r) => r.id === (race.round ?? ''))?.eventType === EventType.Race;
		const calcs = get(racePilotCalcsAtom(raceId));

		const sorted = sortRacePilotRows(calcs, isRaceRound);
		return sorted.map((p, idx) => ({ pilotChannel: p.pilotChannel, position: idx + 1 }));
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

/**
 * PB-native race atom family - much cleaner than the legacy ComputedRace approach
 */
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
 * Last completed race - finds the most recently completed race in the sorted races array
 */
export const lastCompletedRaceAtom = eagerAtom((get): PBRaceRecord | null => {
	const races = get(allRacesAtom);

	if (!races || races.length === 0) {
		return null;
	}

	// Find last completed race by searching backwards through the sorted races array
	const lastCompletedIndex = races.map((race, index) => ({ race, index }))
		.reverse()
		.find(({ race }) => {
			if (!race.valid) {
				return false;
			}

			if (
				race.start && !race.start.startsWith('0') &&
				race.end && !race.end.startsWith('0')
			) {
				return true; // Both started and ended = completed
			}
			return false;
		})?.index ?? -1;

	return lastCompletedIndex !== -1 ? races[lastCompletedIndex] : null;
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
