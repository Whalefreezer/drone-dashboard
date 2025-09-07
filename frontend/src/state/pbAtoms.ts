import { atom } from 'jotai';
import { atomFamily } from 'jotai/utils';
// Legacy RaceEvent removed; we expose PBEventRecord and small derived atoms instead
import { Bracket } from '../bracket/bracket-types.ts';
import { atomWithSuspenseQuery } from 'jotai-tanstack-query';
import { getEnvEventIdFallback, pbSubscribeCollection } from '../api/pb.ts';
import { allRacesAtom, currentRaceAtom as newCurrentRaceAtom } from '../race/race-atoms.ts';
import {
	calculateOverallBestTimes,
	findEliminatedPilots,
	isRaceActive,
	orderRaces,
	OverallBestTimes,
	ProcessedLap,
	updateAtom,
	useCachedAtom,
	useUpdater,
} from './commonAtoms.ts';
import {
	PBChannelRecord,
	PBClientKVRecord,
	PBDetectionRecord,
	PBEventRecord,
	PBGamePointRecord,
	PBLapRecord,
	PBPilotChannelRecord,
	PBPilotRecord,
	PBRaceRecord,
	PBRoundRecord,
} from '../api/pbTypes.ts';
import { PBIngestTargetRecord, PBServerSettingRecord } from '../api/pbTypes.ts';
import { PrimaryTimingSystemLocation, ValidityType } from '../common/enums.ts';
import { eagerAtom } from 'jotai-eager';

// Live events collection; we filter locally for the current event
export const eventsAtom = pbSubscribeCollection<PBEventRecord>('events');

// // Current event PocketBase record (marked by isCurrent)
// export const currentEventAtom = atom((get) => {
//     const eventMaybePromise = get(eventsAtom);

//     if (!(eventMaybePromise instanceof Promise)) {
//         const events = eventMaybePromise;
//         const currentEvent = events.find((event) => event.isCurrent);
//         return currentEvent || null;
//     } else {
//         return eventMaybePromise.then((events) => {
//             const currentEvent = events.find((event) => event.isCurrent);
//             return currentEvent || null;
//         });
//     }
// });

export const currentEventAtom = eagerAtom((get) => {
	const events = get(eventsAtom);
	const currentEvent = events.find((event) => event.isCurrent);
	return currentEvent || null;
});

// Derived: race ids for the current event (prefer PB id)
export const eventRaceIdsAtom = eagerAtom((get) => {
	const ev = get(currentEventAtom);
	if (!ev) return [];
	const races = get(raceRecordsAtom);
	return races.filter((r) => r.event === ev.id).map((r) => r.id);
});

export const consecutiveLapsAtom = eagerAtom((get) => {
	const ev = get(currentEventAtom);
	return Number(ev?.pbLaps ?? 3);
});

export const bracketsDataAtom = atomWithSuspenseQuery<Bracket[]>(() => ({
	queryKey: ['bracketsData'],
	queryFn: () => {
		// const response = await axios.get(`/brackets/groups/0`);
		// return response.data as Bracket[];
		return [] as Bracket[];
	},
	// staleTime: 10_000,
	// refetchInterval: 10_000,
}));

// Pilots as PB records
export const pilotsRecordsAtom = pbSubscribeCollection<PBPilotRecord>('pilots');
export const pilotsAtom = eagerAtom((get) => get(pilotsRecordsAtom));

// Re-export from common
export { useCachedAtom };

// Channels as PB records
export const channelRecordsAtom = pbSubscribeCollection<PBChannelRecord>('channels');
export const channelsDataAtom = eagerAtom((get) => get(channelRecordsAtom));

export const pilotChannelRecordsAtom = pbSubscribeCollection<PBPilotChannelRecord>('pilotChannels');

export const roundRecordsAtom = pbSubscribeCollection<PBRoundRecord>('rounds');
export const roundsDataAtom = eagerAtom((get) => {
	const ev = get(currentEventAtom);
	if (!ev) return [];
	const rounds = get(roundRecordsAtom);
	return rounds.filter((r) => r.event === ev.id);
});

// Live records for race and nested collections
export const raceRecordsAtom = pbSubscribeCollection<PBRaceRecord>('races');
export const clientKVRecordsAtom = pbSubscribeCollection<PBClientKVRecord>('client_kv');
export const lapRecordsAtom = pbSubscribeCollection<PBLapRecord>('laps');
export const detectionRecordsAtom = pbSubscribeCollection<PBDetectionRecord>('detections');
export const gamePointRecordsAtom = pbSubscribeCollection<PBGamePointRecord>('gamePoints');

// Ingest targets (live subscription)
export const ingestTargetRecordsAtom = pbSubscribeCollection<PBIngestTargetRecord>('ingest_targets');
export const serverSettingsRecordsAtom = pbSubscribeCollection<PBServerSettingRecord>('server_settings');

// Use the new PB-native race atoms instead of legacy ComputedRace
export const racesAtom = allRacesAtom;
export const currentRaceAtom = newCurrentRaceAtom;

// Current order from client_kv for the current event
export const currentOrderKVAtom = eagerAtom((get) => {
	const ev = get(currentEventAtom);
	if (!ev) return null as null | { order?: number; sourceId?: string };
	const kv = get(clientKVRecordsAtom);
	const record = kv.find((r) => r.namespace === 'race' && r.key === 'currentOrder' && r.event === ev.id);
	if (!record || !record.value) return null;
	try {
		const parsed = JSON.parse(record.value);
		const order = typeof parsed.order === 'number' ? parsed.order : undefined;
		const sourceId = typeof parsed.sourceId === 'string' ? parsed.sourceId : undefined;
		return { order, sourceId };
	} catch {
		return null;
	}
});

// Re-export types and functions from common
export type { OverallBestTimes, ProcessedLap };
export { isRaceActive, orderRaces };

function toValidityType(v: unknown): ValidityType {
	switch (String(v)) {
		case ValidityType.Auto:
			return ValidityType.Auto;
		case ValidityType.ManualOverride:
			return ValidityType.ManualOverride;
		case ValidityType.Marshall:
			return ValidityType.Marshall;
		default:
			return ValidityType.Auto;
	}
}

function toPTSL(v: unknown): PrimaryTimingSystemLocation {
	switch (String(v)) {
		case PrimaryTimingSystemLocation.Holeshot:
			return PrimaryTimingSystemLocation.Holeshot;
		case PrimaryTimingSystemLocation.EndOfLap:
		default:
			return PrimaryTimingSystemLocation.EndOfLap;
	}
}

// Re-export from common
export { findEliminatedPilots, updateAtom, useUpdater };

export const overallBestTimesAtom = eagerAtom((get) => {
	const raceIds = get(eventRaceIdsAtom);
	// Flatten all processed laps from all races using per-race atom
	const allProcessedLaps = raceIds.flatMap((raceId) => get(raceProcessedLapsAtom(raceId)));
	return calculateOverallBestTimes(allProcessedLaps);
});

// ===== NEW FOCUSED ATOMS =====

/**
 * Leaderboard split index (1-based position) from client_kv
 * namespace: 'leaderboard', key: 'splitIndex', value: JSON number
 */
export const leaderboardSplitAtom = eagerAtom((get) => {
	const ev = get(currentEventAtom);
	if (!ev) return null as number | null;
	const kv = get(clientKVRecordsAtom);
	const rec = kv.find((r) => r.namespace === 'leaderboard' && r.key === 'splitIndex' && r.event === ev.id);
	if (!rec || !rec.value) return null;
	try {
		const raw = JSON.parse(rec.value);
		const n = Number(raw);
		if (!Number.isFinite(n)) return null;
		const v = Math.floor(n);
		return v > 0 ? v : null;
	} catch {
		return null;
	}
});

/**
 * Processed laps for a specific race - computed from PB records
 */
export const raceProcessedLapsAtom = atomFamily((raceId: string) =>
	eagerAtom((get) => {
		const lapRecords = get(lapRecordsAtom);
		const detectionRecords = get(detectionRecordsAtom);

		const laps = lapRecords.filter((l) => l.race === raceId);
		const detections = detectionRecords.filter((d) => d.race === raceId);

		return laps
			.map((lap) => {
				const detection = detections.find((d) => d.id === lap.detection);
				if (!detection || !detection.valid) return null;

				return {
					id: lap.id,
					lapNumber: lap.lapNumber ?? 0,
					lengthSeconds: lap.lengthSeconds ?? 0,
					pilotId: detection.pilot ?? '',
					valid: detection.valid ?? false,
					startTime: lap.startTime ?? '',
					endTime: lap.endTime ?? '',
					isHoleshot: detection.isHoleshot ?? false,
				} as ProcessedLap;
			})
			.filter((lap): lap is ProcessedLap => lap !== null)
			.sort((a, b) => a.lapNumber - b.lapNumber);
	})
);

/**
 * Pilot-channel associations for a specific race
 */
export const racePilotChannelsAtom = atomFamily((raceId: string) =>
	eagerAtom((get) => {
		const pilotChannelRecords = get(pilotChannelRecordsAtom);
		return pilotChannelRecords
			.filter((pc) => pc.race === raceId)
			.map((pc) => ({
				id: pc.id,
				pilotId: pc.pilot ?? '',
				channelId: pc.channel ?? '',
			}));
	})
);

/**
 * Race status (active/completed/started) for a specific race
 */
export const raceStatusAtom = atomFamily((raceId: string) =>
	eagerAtom((get) => {
		const raceRecords = get(raceRecordsAtom);
		const race = raceRecords.find((r) => r.id === raceId);
		if (!race) return { isActive: false, isCompleted: false, hasStarted: false };

		const hasStarted = !!(race.start && !race.start.startsWith('0'));
		const hasEnded = !!(race.end && !race.end.startsWith('0'));

		return {
			hasStarted,
			isActive: hasStarted && !hasEnded,
			isCompleted: hasStarted && hasEnded,
		};
	})
);

/**
 * All detections for a specific race
 */
export const raceDetectionsAtom = atomFamily((raceId: string) =>
	eagerAtom((get) => {
		const detectionRecords = get(detectionRecordsAtom);
		return detectionRecords.filter((d) => d.race === raceId);
	})
);

/**
 * All game points for a specific race
 */
export const raceGamePointsAtom = atomFamily((raceId: string) =>
	eagerAtom((get) => {
		const gamePointRecords = get(gamePointRecordsAtom);
		return gamePointRecords.filter((g) => g.race === raceId);
	})
);
