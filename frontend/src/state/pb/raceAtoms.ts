import { atom } from 'jotai';
import { atomFamily } from 'jotai/utils';
import { allRacesAtom, currentRaceAtom as newCurrentRaceAtom } from '../../race/race-atoms.ts';
import {
	calculateOverallBestTimes,
	findEliminatedPilots,
	isRaceActive,
	orderRaces,
	type OverallBestTimes,
	type ProcessedLap,
} from '../commonAtoms.ts';
import {
	clientKVRecordsAtom,
	detectionRecordsAtom,
	gamePointRecordsAtom,
	lapRecordsAtom,
	pilotChannelRecordsAtom,
	raceRecordsAtom,
} from './subscriptionAtoms.ts';

// Derived: race ids for the current event (prefer PB id)
export const eventRaceIdsAtom = atom((get) => {
	const races = get(raceRecordsAtom);
	return races.map((race) => race.id);
});

// Use the new PB-native race atoms instead of legacy ComputedRace
export const racesAtom = allRacesAtom;
export const currentRaceAtom = newCurrentRaceAtom;

// Current order from client_kv for the current event
export const currentOrderKVAtom = atom((get) => {
	const kv = get(clientKVRecordsAtom);
	const record = kv.find((entry) => entry.namespace === 'race' && entry.key === 'currentOrder');
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
export { findEliminatedPilots, isRaceActive, orderRaces };

export const overallBestTimesAtom = atom((get) => {
	const raceIds = get(eventRaceIdsAtom);
	// Flatten all processed laps from all races using per-race atom
	const allProcessedLaps = raceIds.flatMap((raceId) => get(raceProcessedLapsAtom(raceId)));
	return calculateOverallBestTimes(allProcessedLaps);
});

/**
 * Processed laps for a specific race - computed from PB records
 */
export const raceProcessedLapsAtom = atomFamily((raceId: string) =>
	atom((get) => {
		const lapRecords = get(lapRecordsAtom);
		const detectionRecords = get(detectionRecordsAtom);

		const laps = lapRecords.filter((lap) => lap.race === raceId);
		const detections = detectionRecords.filter((detection) => detection.race === raceId);

		return laps
			.map((lap) => {
				const detection = detections.find((candidate) => candidate.id === lap.detection);
				if (!detection || !detection.valid) return null;

				return {
					id: lap.id,
					lapNumber: lap.lapNumber ?? 0,
					lengthSeconds: lap.lengthSeconds ?? 0,
					pilotId: detection.pilot ?? '',
					valid: detection.valid ?? false,
					startTime: lap.startTime ?? '',
					endTime: lap.endTime ?? '',
					detectionId: detection.id ?? '',
					detectionTime: detection.time ?? '',
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
	atom((get) => {
		const pilotChannelRecords = get(pilotChannelRecordsAtom);
		return pilotChannelRecords
			.filter((pilotChannel) => pilotChannel.race === raceId)
			.map((pilotChannel) => ({
				id: pilotChannel.id,
				pilotId: pilotChannel.pilot ?? '',
				channelId: pilotChannel.channel ?? '',
			}));
	})
);

/**
 * Race status (active/completed/started) for a specific race
 */
export const raceStatusAtom = atomFamily((raceId: string) =>
	atom((get) => {
		const raceRecords = get(raceRecordsAtom);
		const race = raceRecords.find((record) => record.id === raceId);
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
	atom((get) => {
		const detectionRecords = get(detectionRecordsAtom);
		return detectionRecords.filter((detection) => detection.race === raceId);
	})
);

/**
 * All game points for a specific race
 */
export const raceGamePointsAtom = atomFamily((raceId: string) =>
	atom((get) => {
		const gamePointRecords = get(gamePointRecordsAtom);
		return gamePointRecords.filter((gamePoint) => gamePoint.race === raceId);
	})
);
