import { atomFamily } from 'jotai/utils';
import { eagerAtom } from 'jotai-eager';
import type { PBChannelRecord, PBPilotRecord, PBRaceRecord, PBRoundRecord } from '../api/pbTypes.ts';
import type { ProcessedLap } from '../state/atoms.ts';
import {
	bracketsDataAtom,
	channelsDataAtom,
	leaderboardNextRaceOverridesAtom,
	pilotsAtom,
	raceProcessedLapsAtom,
	roundsDataAtom,
} from '../state/pbAtoms.ts';
import { allRacesAtom, currentRaceIndexAtom, racePilotChannelsAtom } from '../race/race-atoms.ts';
import type { Bracket, BracketPilot } from '../bracket/bracket-types.ts';
import { pilotPreferredChannelAtom } from '../leaderboard/leaderboard-context-atoms.ts';

const parseTimestampMs = (value?: string | number | null): number | null => {
	if (value == null) return null;
	if (typeof value === 'number') {
		return Number.isFinite(value) ? value : null;
	}
	const trimmed = String(value).trim();
	if (!trimmed) return null;
	const numeric = Number(trimmed);
	if (Number.isFinite(numeric)) return numeric;
	const parsed = Date.parse(trimmed);
	return Number.isNaN(parsed) ? null : parsed;
};

const buildRaceLabel = (race: PBRaceRecord, round?: PBRoundRecord): string => {
	const roundNum = round?.roundNumber ?? 1;
	const raceNum = race.raceNumber ?? race.raceOrder;
	return `${roundNum}-${raceNum}`;
};

const toChannelSummary = (channel: PBChannelRecord | null | undefined): ChannelSummary | null => {
	if (!channel) return null;
	const short = channel.shortBand ?? '';
	const number = channel.number != null ? String(channel.number) : '';
	const baseLabel = `${short}${number}`.trim();
	const fallbackLabel = channel.channelDisplayName ?? channel.displayName ?? '';
	return {
		id: channel.id,
		label: baseLabel || fallbackLabel || '—',
		color: channel.channelColor ?? '#888',
		shortBand: short,
		number: channel.number ?? undefined,
	};
};

const norm = (value: string) => value.toLowerCase().replace(/\s+/g, '');

export interface ChannelSummary {
	id: string;
	label: string;
	color: string;
	shortBand?: string;
	number?: number;
}

export interface PilotOverviewMeta {
	record: PBPilotRecord | null;
	preferredChannel: ChannelSummary | null;
	bracket: { name: string; points: number } | null;
}

export interface PilotLap extends ProcessedLap {
	raceId: string;
	raceOrder: number;
	raceNumber: number;
	raceLabel: string;
	roundId: string;
	roundName: string;
	roundNumber?: number;
	detectionTimestampMs: number | null;
	channel: ChannelSummary | null;
}

export interface PilotHoleshot extends ProcessedLap {
	detectionTimestampMs: number | null;
	channel: ChannelSummary | null;
}

export interface PilotRaceLapGroup {
	race: {
		id: string;
		label: string;
		order: number;
		number: number;
		roundId: string;
		roundName: string;
		roundNumber?: number;
		targetLaps: number | null;
		startTime?: string | null;
	};
	holeshot: PilotHoleshot | null;
	laps: PilotLap[];
	channel: ChannelSummary | null;
}

export interface PilotTimelineLap extends PilotLap {
	overallIndex: number;
	raceIndex: number;
}

export interface PilotUpcomingCompetitor {
	pilotId: string;
	name: string;
	channel: ChannelSummary | null;
}

export interface PilotUpcomingRace {
	raceId: string;
	raceOrder: number;
	raceNumber: number;
	raceLabel: string;
	roundId: string;
	roundName: string;
	roundNumber?: number;
	startTime?: string | null;
	racesUntil: number;
	isNext: boolean;
	channel: ChannelSummary | null;
	competitors: PilotUpcomingCompetitor[];
	overrideLabel: string | null;
}

export const pilotRecordAtom = atomFamily((pilotId: string) =>
	eagerAtom((get): PBPilotRecord | null => {
		const pilots = get(pilotsAtom);
		return pilots.find((p) => p.id === pilotId) ?? null;
	})
);

export const pilotOverviewMetaAtom = atomFamily((pilotId: string) =>
	eagerAtom((get): PilotOverviewMeta => {
		const record = get(pilotRecordAtom(pilotId));
		const preferredChannel = toChannelSummary(get(pilotPreferredChannelAtom(pilotId)));

		let bracket: { name: string; points: number } | null = null;
		if (record) {
			const bracketsResult = get(bracketsDataAtom);
			const brackets = Array.isArray(bracketsResult) ? bracketsResult : [];
			for (const entry of brackets) {
				const match = entry.pilots.find((bp: BracketPilot) => norm(bp.name) === norm(record.name));
				if (match) {
					bracket = { name: entry.name, points: match.points };
					break;
				}
			}
		}

		return { record, preferredChannel, bracket };
	})
);

export const pilotLapGroupsAtom = atomFamily((pilotId: string) =>
	eagerAtom((get): PilotRaceLapGroup[] => {
		const races = get(allRacesAtom);
		const rounds = get(roundsDataAtom);
		const channels = get(channelsDataAtom);

		const groups: PilotRaceLapGroup[] = [];
		for (const race of races) {
			const processed = get(raceProcessedLapsAtom(race.id));
			const pilotLaps = processed.filter((lap) => lap.pilotId === pilotId);
			if (pilotLaps.length === 0) continue;

			const round = rounds.find((r) => r.id === race.round);
			const assignments = get(racePilotChannelsAtom(race.id));
			const pilotChannel = assignments.find((pc) => pc.pilotId === pilotId);
			const channelRecord = pilotChannel ? channels.find((ch) => ch.id === pilotChannel.channelId) ?? null : null;
			const channel = toChannelSummary(channelRecord);
			const holeshotRecord = pilotLaps.find((lap) => lap.isHoleshot) ?? null;
			const holeshot = holeshotRecord
				? {
					...holeshotRecord,
					detectionTimestampMs: parseTimestampMs(holeshotRecord.detectionTime),
					channel,
				}
				: null;

			const laps = pilotLaps
				.filter((lap) => !lap.isHoleshot)
				.map((lap) => ({
					...lap,
					raceId: race.id,
					raceOrder: race.raceOrder,
					raceNumber: race.raceNumber ?? race.raceOrder,
					raceLabel: buildRaceLabel(race, round),
					roundId: race.round ?? '',
					roundName: round?.name ?? `Round ${round?.roundNumber ?? '?'}`,
					roundNumber: round?.roundNumber,
					detectionTimestampMs: parseTimestampMs(lap.detectionTime),
					channel,
				}))
				.sort((a, b) => a.lapNumber - b.lapNumber);

			if (laps.length === 0) continue;

			groups.push({
				race: {
					id: race.id,
					label: buildRaceLabel(race, round),
					order: race.raceOrder,
					number: race.raceNumber ?? race.raceOrder,
					roundId: race.round ?? '',
					roundName: round?.name ?? `Round ${round?.roundNumber ?? '?'}`,
					roundNumber: round?.roundNumber,
					targetLaps: race.targetLaps ?? null,
					startTime: race.start,
				},
				holeshot,
				laps,
				channel,
			});
		}

		return groups.sort((a, b) => a.race.order - b.race.order);
	})
);

export const pilotTimelineLapsAtom = atomFamily((pilotId: string) =>
	eagerAtom((get): PilotTimelineLap[] => {
		const groups = get(pilotLapGroupsAtom(pilotId));
		const timeline: PilotTimelineLap[] = [];
		let overallIndex = 0;
		for (const group of groups) {
			group.laps.forEach((lap, lapIndex) => {
				timeline.push({ ...lap, overallIndex, raceIndex: lapIndex });
				overallIndex++;
			});
		}
		return timeline;
	})
);

export const pilotUpcomingRacesAtom = atomFamily((pilotId: string) =>
	eagerAtom((get): PilotUpcomingRace[] => {
		const races = get(allRacesAtom);
		if (races.length === 0) return [];

		const currentIndex = get(currentRaceIndexAtom);
		const startIndex = currentIndex >= 0 ? currentIndex + 1 : 0;
		const rounds = get(roundsDataAtom);
		const channels = get(channelsDataAtom);
		const pilots = get(pilotsAtom);
		const overrides = get(leaderboardNextRaceOverridesAtom);

		const results: PilotUpcomingRace[] = [];
		for (let idx = startIndex; idx < races.length; idx++) {
			const race = races[idx];
			const assignments = get(racePilotChannelsAtom(race.id));
			const pilotChannel = assignments.find((pc) => pc.pilotId === pilotId);
			if (!pilotChannel) continue;

			const round = rounds.find((r) => r.id === race.round);
			const channelRecord = channels.find((ch) => ch.id === pilotChannel.channelId) ?? null;
			const channel = toChannelSummary(channelRecord);

			const competitors = assignments
				.filter((pc) => pc.pilotId !== pilotId)
				.map((pc) => {
					const pilot = pilots.find((p) => p.id === pc.pilotId);
					const compChannel = channels.find((ch) => ch.id === pc.channelId) ?? null;
					return {
						pilotId: pc.pilotId,
						name: pilot?.name ?? 'Unknown',
						channel: toChannelSummary(compChannel),
					};
				});

			const racesUntil = idx - startIndex;
			const override = overrides.find((range) => idx >= range.startIndex && idx <= range.endIndex) ?? null;
			results.push({
				raceId: race.id,
				raceOrder: race.raceOrder,
				raceNumber: race.raceNumber ?? race.raceOrder,
				raceLabel: buildRaceLabel(race, round),
				roundId: race.round ?? '',
				roundName: round?.name ?? `Round ${round?.roundNumber ?? '?'}`,
				roundNumber: round?.roundNumber,
				startTime: race.start,
				racesUntil,
				isNext: results.length === 0,
				channel,
				competitors,
				overrideLabel: override?.label ?? null,
			});
		}

		return results;
	})
);
