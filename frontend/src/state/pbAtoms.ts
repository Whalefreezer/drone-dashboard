import { atom } from 'jotai';
import { atomFamily, atomWithStorage } from 'jotai/utils';
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
import { PBControlStatsRecord, PBIngestTargetRecord, PBServerSettingRecord } from '../api/pbTypes.ts';
import { PrimaryTimingSystemLocation, ValidityType } from '../common/enums.ts';
import { parseTimestampMs } from '../common/time.ts';

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

export const pbCurrentEventAtom = atom((get) => {
	const events = get(eventsAtom);
	const currentEvent = events.find((event) => event.isCurrent);
	return currentEvent || null;
});

const EVENT_SELECTION_STORAGE_KEY = 'selected-event-id';
export const EVENT_SELECTION_CURRENT = 'current';

export const selectedEventIdAtom = atomWithStorage<string>(EVENT_SELECTION_STORAGE_KEY, EVENT_SELECTION_CURRENT);

export const currentEventAtom = atom((get) => {
	const selection = get(selectedEventIdAtom);
	if (selection === EVENT_SELECTION_CURRENT) return get(pbCurrentEventAtom);
	const events = get(eventsAtom);
	const match = events.find((event) => event.id === selection);
	if (match) return match;
	return get(pbCurrentEventAtom);
});

// Derived: race ids for the current event (prefer PB id)
export const eventRaceIdsAtom = atom((get) => {
	const ev = get(currentEventAtom);
	if (!ev) return [];
	const races = get(raceRecordsAtom);
	return races.filter((r) => r.event === ev.id).map((r) => r.id);
});

export const consecutiveLapsAtom = atom((get) => {
	const ev = get(currentEventAtom);
	return Number(ev?.laps ?? 3);
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
const pilotsRecordsAtom = pbSubscribeCollection<PBPilotRecord>('pilots');
export const pilotsAtom = atom((get) => {
	const pilots = get(pilotsRecordsAtom);
	const event = get(currentEventAtom);
	if (!event) return pilots;
	return pilots.filter((p) => p.event === event.id);
});

export const pilotIdBySourceIdAtom = atomFamily((pilotSourceId: string) =>
	atom((get): string | null => {
		if (!pilotSourceId) return null;
		const pilots = get(pilotsAtom);
		const match = pilots.find((pilot) => pilot.sourceId === pilotSourceId || pilot.id === pilotSourceId);
		return match?.id ?? null;
	})
);

// Channels as PB records
export const channelRecordsAtom = pbSubscribeCollection<PBChannelRecord>('channels');
export const channelsDataAtom = atom((get) => get(channelRecordsAtom));

export const pilotChannelRecordsAtom = pbSubscribeCollection<PBPilotChannelRecord>('pilotChannels');

export const roundRecordsAtom = pbSubscribeCollection<PBRoundRecord>('rounds');
export const roundsDataAtom = atom((get) => {
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
export const controlStatsRecordsAtom = pbSubscribeCollection<PBControlStatsRecord>('control_stats');

export const DEFAULT_APP_TITLE = 'Drone Dashboard';

export const serverSettingRecordAtom = atomFamily((key: string) =>
	atom((get) => {
		const settings = get(serverSettingsRecordsAtom);
		const record = settings.find((setting) => setting.key === key);
		return record ?? null;
	})
);

export const appTitleAtom = atom((get) => {
	const record = get(serverSettingRecordAtom('ui.title'));
	const raw = record?.value;
	const text = raw == null ? '' : String(raw);
	const trimmed = text.trim();
	return trimmed || DEFAULT_APP_TITLE;
});

// Use the new PB-native race atoms instead of legacy ComputedRace
export const racesAtom = allRacesAtom;
export const currentRaceAtom = newCurrentRaceAtom;

// Current order from client_kv for the current event
export const currentOrderKVAtom = atom((get) => {
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
export { findEliminatedPilots };

export const overallBestTimesAtom = atom((get) => {
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
export const leaderboardSplitAtom = atom((get) => {
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

export interface NextRaceOverrideRecord {
	startSourceId: string;
	endSourceId: string | null;
	label: string;
}

export interface ResolvedNextRaceOverride extends NextRaceOverrideRecord {
	startIndex: number;
	endIndex: number;
}

export interface NoRacesOverride {
	label: string;
}

export const leaderboardNextRaceOverridesAtom = atom((get): ResolvedNextRaceOverride[] => {
	const ev = get(currentEventAtom);
	if (!ev) return [];
	const races = get(allRacesAtom);
	if (races.length === 0) return [];
	const kv = get(clientKVRecordsAtom);
	const rec = kv.find((r) => r.namespace === 'leaderboard' && r.key === 'nextRaceOverrides' && r.event === ev.id);
	if (!rec?.value) return [];
	let parsed: unknown;
	try {
		parsed = JSON.parse(rec.value);
	} catch {
		return [];
	}
	if (!Array.isArray(parsed)) return [];
	const raceIndexBySource = new Map<string, number>();
	races.forEach((race, idx) => {
		const sourceId = (race.sourceId ?? '').trim();
		if (sourceId) {
			raceIndexBySource.set(sourceId, idx);
		}
	});
	const lastIndex = races.length - 1;
	const cleaned: ResolvedNextRaceOverride[] = [];
	for (const entry of parsed) {
		if (!entry || typeof entry !== 'object') continue;
		const start = typeof (entry as { startSourceId?: unknown }).startSourceId === 'string'
			? (entry as { startSourceId: string }).startSourceId.trim()
			: '';
		const labelRaw = typeof (entry as { label?: unknown }).label === 'string' ? (entry as { label: string }).label.trim() : '';
		if (!labelRaw) continue;

		// Skip entries without a startSourceId (they're handled by noRacesOverrideAtom)
		if (!start) continue;

		const endRaw = typeof (entry as { endSourceId?: unknown }).endSourceId === 'string'
			? (entry as { endSourceId: string }).endSourceId.trim()
			: '';
		const startIndex = raceIndexBySource.get(start);
		if (startIndex == null) continue;
		let endIndex: number;
		if (endRaw) {
			const resolvedEnd = raceIndexBySource.get(endRaw);
			if (resolvedEnd == null) continue;
			endIndex = resolvedEnd;
		} else {
			endIndex = lastIndex;
		}
		const normalizedStart = Math.min(startIndex, endIndex);
		const normalizedEnd = Math.max(startIndex, endIndex);
		cleaned.push({
			startSourceId: start,
			endSourceId: endRaw || null,
			label: labelRaw,
			startIndex: normalizedStart,
			endIndex: normalizedEnd,
		});
	}
	return cleaned.sort((a, b) => a.startIndex - b.startIndex);
});

export const noRacesOverrideAtom = atom((get): NoRacesOverride | null => {
	const ev = get(currentEventAtom);
	if (!ev) return null;
	const kv = get(clientKVRecordsAtom);
	const rec = kv.find((r) => r.namespace === 'leaderboard' && r.key === 'nextRaceOverrides' && r.event === ev.id);
	if (!rec?.value) return null;
	let parsed: unknown;
	try {
		parsed = JSON.parse(rec.value);
	} catch {
		return null;
	}
	if (!Array.isArray(parsed)) return null;

	// Find entry without startSourceId
	for (const entry of parsed) {
		if (!entry || typeof entry !== 'object') continue;
		const start = typeof (entry as { startSourceId?: unknown }).startSourceId === 'string'
			? (entry as { startSourceId: string }).startSourceId.trim()
			: '';
		if (start) continue; // Skip entries with a startSourceId

		const labelRaw = typeof (entry as { label?: unknown }).label === 'string' ? (entry as { label: string }).label.trim() : '';
		if (labelRaw) {
			return { label: labelRaw };
		}
	}
	return null;
});

export interface StreamVideoRange {
	id: string;
	label: string;
	url: string;
	startMs: number;
	endMs: number | null;
}

export const streamVideoRangesAtom = atom((get): StreamVideoRange[] => {
	const ev = get(currentEventAtom);
	if (!ev) return [];
	const kv = get(clientKVRecordsAtom);
	const record = kv.find((r) => r.namespace === 'stream' && r.key === 'videos' && r.event === ev.id);
	if (!record?.value) return [];
	let parsed: unknown;
	try {
		parsed = JSON.parse(record.value);
	} catch {
		return [];
	}
	if (!Array.isArray(parsed)) return [];
	const ranges: StreamVideoRange[] = [];
	for (const entry of parsed) {
		if (!entry || typeof entry !== 'object') continue;
		const idRaw = (entry as { id?: unknown }).id;
		const labelRaw = (entry as { label?: unknown }).label;
		const urlRaw = (entry as { url?: unknown }).url;
		const startRaw = (entry as { startMs?: unknown }).startMs;
		const endRaw = (entry as { endMs?: unknown }).endMs;
		const id = typeof idRaw === 'string' ? idRaw.trim() : '';
		const label = typeof labelRaw === 'string' ? labelRaw.trim() : '';
		const url = typeof urlRaw === 'string' ? urlRaw.trim() : '';
		if (!id || !label || !url) continue;
		const startMs = parseTimestampMs(startRaw);
		if (startMs == null) continue;
		let endMs: number | null;
		if (endRaw == null || (typeof endRaw === 'string' && !endRaw.trim())) {
			endMs = null;
		} else {
			const parsedEnd = parseTimestampMs(endRaw);
			if (parsedEnd == null) continue;
			endMs = parsedEnd;
		}
		if (endMs != null && endMs < startMs) continue;
		try {
			// Validate the URL shape early to avoid rendering invalid anchors
			// Note: allowing both full YouTube and youtu.be hosts
			const parsedUrl = new URL(url);
			const host = parsedUrl.hostname.toLowerCase();
			if (!host.includes('youtube.com') && host !== 'youtu.be') continue;
		} catch {
			continue;
		}
		ranges.push({ id, label, url, startMs, endMs });
	}
	return ranges.sort((a, b) => a.startMs - b.startMs);
});

/**
 * Processed laps for a specific race - computed from PB records
 */
export const raceProcessedLapsAtom = atomFamily((raceId: string) =>
	atom((get) => {
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
	atom((get) => {
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
	atom((get) => {
		const detectionRecords = get(detectionRecordsAtom);
		return detectionRecords.filter((d) => d.race === raceId);
	})
);

/**
 * All game points for a specific race
 */
export const raceGamePointsAtom = atomFamily((raceId: string) =>
	atom((get) => {
		const gamePointRecords = get(gamePointRecordsAtom);
		return gamePointRecords.filter((g) => g.race === raceId);
	})
);
