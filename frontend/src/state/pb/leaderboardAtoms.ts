import { atom } from 'jotai';
import { allRacesAtom } from '../../race/race-atoms.ts';
import { parseTimestampMs } from '../../common/time.ts';
import { clientKVRecordsAtom, detectionRecordsAtom, lapRecordsAtom, pilotsAtom, roundsDataAtom } from './subscriptionAtoms.ts';
import type { PBRaceRecord, PBRoundRecord } from '../../api/pbTypes.ts';

/**
 * Leaderboard split index (1-based position) from client_kv
 * namespace: 'leaderboard', key: 'splitIndex', value: JSON number
 */
export const leaderboardSplitAtom = atom((get) => {
	const kv = get(clientKVRecordsAtom);
	const record = kv.find((entry) => entry.namespace === 'leaderboard' && entry.key === 'splitIndex');
	if (!record || !record.value) return null;
	try {
		const raw = JSON.parse(record.value);
		const n = Number(raw);
		if (!Number.isFinite(n)) return null;
		const value = Math.floor(n);
		return value > 0 ? value : null;
	} catch {
		return null;
	}
});

/**
 * Parsed locked elimination entries with note metadata.
 */
export interface LockedPositionMetadata {
	position: number;
	note: string | null;
	isDone: boolean;
}

export const leaderboardLockedEntriesAtom = atom((get): Map<string, LockedPositionMetadata> => {
	const kv = get(clientKVRecordsAtom);
	const record = kv.find((entry) => entry.namespace === 'leaderboard' && entry.key === 'lockedPositions');
	if (!record?.value) return new Map();

	try {
		const parsed = JSON.parse(record.value);
		if (!Array.isArray(parsed)) return new Map();

		const map = new Map<string, LockedPositionMetadata>();
		for (const entry of parsed) {
			if (!entry || typeof entry !== 'object') continue;
			const pilotId = typeof entry.pilotId === 'string' ? entry.pilotId.trim() : '';
			const position = typeof entry.position === 'number' ? entry.position : null;
			const note = typeof entry.note === 'string' ? entry.note.trim() : '';
			const doneFlag = typeof entry.done === 'boolean' ? entry.done : false;
			const isDone = doneFlag || /\bdone\b/i.test(note);
			if (pilotId && position != null && Number.isFinite(position) && position > 0) {
				map.set(pilotId, {
					position,
					note: note || null,
					isDone,
				});
			}
		}
		return map;
	} catch {
		return new Map();
	}
});

/**
 * Locked elimination positions from client_kv
 * namespace: 'leaderboard', key: 'lockedPositions'
 * value: JSON array of { pilotId, pilotSourceId, displayName, position, note? }
 */
export const leaderboardLockedPositionsAtom = atom((get): Map<string, number> => {
	const entries = get(leaderboardLockedEntriesAtom);
	if (entries.size === 0) return new Map();
	return new Map(
		Array.from(entries.entries()).map(([pilotId, metadata]) => [pilotId, metadata.position]),
	);
});

export const leaderboardHasLockedPositionsAtom = atom((get): boolean => {
	return get(leaderboardLockedPositionsAtom).size > 0;
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
	const races = get(allRacesAtom);
	if (races.length === 0) return [];
	const kv = get(clientKVRecordsAtom);
	const record = kv.find((entry) => entry.namespace === 'leaderboard' && entry.key === 'nextRaceOverrides');
	if (!record?.value) return [];
	let parsed: unknown;
	try {
		parsed = JSON.parse(record.value);
	} catch {
		return [];
	}
	if (!Array.isArray(parsed)) return [];
	const raceIndexBySource = new Map<string, number>();
	races.forEach((race, index) => {
		const sourceId = (race.sourceId ?? '').trim();
		if (sourceId) {
			raceIndexBySource.set(sourceId, index);
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
	const kv = get(clientKVRecordsAtom);
	const record = kv.find((entry) => entry.namespace === 'leaderboard' && entry.key === 'nextRaceOverrides');
	if (!record?.value) return null;
	let parsed: unknown;
	try {
		parsed = JSON.parse(record.value);
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
		if (start) continue;

		const labelRaw = typeof (entry as { label?: unknown }).label === 'string' ? (entry as { label: string }).label.trim() : '';
		if (labelRaw) {
			return { label: labelRaw };
		}
	}
	return null;
});

export const closestLapTargetSecondsAtom = atom((get): number | null => {
	const kv = get(clientKVRecordsAtom);
	const record = kv.find((entry) => entry.namespace === 'leaderboard' && entry.key === 'closestLapTargetSeconds');
	if (!record?.value) return null;
	try {
		const raw = JSON.parse(record.value);
		const n = Number(raw);
		if (!Number.isFinite(n) || n <= 0) return null;
		return n;
	} catch {
		return null;
	}
});

export interface ClosestLapPrizeRow {
	pilotId: string;
	pilotName: string;
	pilotSourceId: string;
	closestLapSeconds: number;
	deltaSeconds: number;
	raceId: string;
	raceLabel: string;
	raceOrder: number;
	lapNumber: number;
}

function formatClosestLapRaceLabel(
	raceId: string,
	raceById: Map<string, PBRaceRecord>,
	roundById: Map<string, PBRoundRecord>,
): string {
	if (!raceId) return '-';
	const race = raceById.get(raceId);
	if (!race) return '-';
	const round = roundById.get(race.round ?? '');
	const roundPart = round?.roundNumber != null ? `R${round.roundNumber}` : 'R?';
	const racePart = race.raceNumber != null ? `${race.raceNumber}` : '?';
	return `${roundPart}-${racePart}`;
}

export const closestLapPrizeRowsAtom = atom((get): ClosestLapPrizeRow[] => {
	const targetSeconds = get(closestLapTargetSecondsAtom);
	if (targetSeconds == null) return [];

	const laps = get(lapRecordsAtom);
	const detections = get(detectionRecordsAtom);
	const pilots = get(pilotsAtom);
	const races = get(allRacesAtom);
	const rounds = get(roundsDataAtom);

	const pilotById = new Map(pilots.map((pilot) => [pilot.id, pilot]));
	const raceById = new Map(races.map((race) => [race.id, race]));
	const roundById = new Map(rounds.map((round) => [round.id, round]));
	const detectionById = new Map(
		detections
			.filter((detection) => detection.valid && detection.pilot)
			.map((detection) => [detection.id, detection]),
	);

	const bestByPilot = new Map<string, ClosestLapPrizeRow>();

	for (const lap of laps) {
		const lapSeconds = Number(lap.lengthSeconds);
		if (!Number.isFinite(lapSeconds) || lapSeconds <= 0) continue;

		const detection = detectionById.get(lap.detection);
		if (!detection || detection.isHoleshot) continue;
		const pilotId = (detection.pilot ?? '').trim();
		if (!pilotId) continue;

		const raceId = (lap.race ?? detection.race ?? '').trim();
		const race = raceById.get(raceId);
		const raceOrder = race?.raceOrder ?? Number.MAX_SAFE_INTEGER;
		const lapNumber = lap.lapNumber ?? 0;
		const deltaSeconds = Math.abs(lapSeconds - targetSeconds);

		const pilot = pilotById.get(pilotId);
		const pilotName = pilot?.name ?? pilotId;
		const pilotSourceId = pilot?.sourceId ?? pilotId;
		const candidate: ClosestLapPrizeRow = {
			pilotId,
			pilotName,
			pilotSourceId,
			closestLapSeconds: lapSeconds,
			deltaSeconds,
			raceId,
			raceLabel: formatClosestLapRaceLabel(raceId, raceById, roundById),
			raceOrder,
			lapNumber,
		};

		const existing = bestByPilot.get(pilotId);
		if (!existing) {
			bestByPilot.set(pilotId, candidate);
			continue;
		}

		const isBetter = candidate.deltaSeconds < existing.deltaSeconds ||
			(candidate.deltaSeconds === existing.deltaSeconds &&
				candidate.closestLapSeconds < existing.closestLapSeconds) ||
			(candidate.deltaSeconds === existing.deltaSeconds &&
				candidate.closestLapSeconds === existing.closestLapSeconds &&
				candidate.raceOrder < existing.raceOrder) ||
			(candidate.deltaSeconds === existing.deltaSeconds &&
				candidate.closestLapSeconds === existing.closestLapSeconds &&
				candidate.raceOrder === existing.raceOrder &&
				candidate.lapNumber < existing.lapNumber);

		if (isBetter) {
			bestByPilot.set(pilotId, candidate);
		}
	}

	return [...bestByPilot.values()].sort((a, b) => {
		if (a.deltaSeconds !== b.deltaSeconds) return a.deltaSeconds - b.deltaSeconds;
		if (a.closestLapSeconds !== b.closestLapSeconds) return a.closestLapSeconds - b.closestLapSeconds;
		const byName = a.pilotName.localeCompare(b.pilotName);
		if (byName !== 0) return byName;
		return a.pilotId.localeCompare(b.pilotId);
	});
});

export interface StreamVideoRange {
	id: string;
	label: string;
	url: string;
	startMs: number;
	endMs: number | null;
}

export const streamVideoRangesAtom = atom((get): StreamVideoRange[] => {
	const kv = get(clientKVRecordsAtom);
	const record = kv.find((entry) => entry.namespace === 'stream' && entry.key === 'videos');
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
