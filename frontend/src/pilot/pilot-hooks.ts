import { useMemo } from 'react';
import { useAtomValue } from 'jotai';
import {
	type PilotLap,
	pilotLapGroupsAtom,
	PilotOverviewMeta,
	pilotOverviewMetaAtom,
	type PilotRaceLapGroup,
	type PilotTimelineLap,
	pilotTimelineLapsAtom,
	type PilotUpcomingRace,
	pilotUpcomingRacesAtom,
} from './pilot-state.ts';
import {
	pilotBestLapAtom,
	pilotConsecAtom,
	pilotFastestTotalRaceAtom,
	pilotHoleshotAtom,
	pilotTotalLapsAtom,
} from '../leaderboard/metric-factory.ts';
import { consecutiveLapsAtom, roundsDataAtom } from '../state/pbAtoms.ts';
import { racesAtom } from '../state/index.ts';
import type { PBRaceRecord, PBRoundRecord } from '../api/pbTypes.ts';
import { parseTimestampMs } from '../common/time.ts';

const buildRaceLabel = (race: PBRaceRecord | undefined, round: PBRoundRecord | undefined): string => {
	if (!race) return '—';
	const roundLabel = round?.name || (round?.roundNumber ? `Round ${round.roundNumber}` : 'Round');
	const raceLabel = race.raceNumber != null ? `Race ${race.raceNumber}` : `Order ${race.raceOrder}`;
	return `${roundLabel} — ${raceLabel}`;
};

export interface MetricSnapshot {
	time: number;
	raceId: string;
	raceLabel: string;
	timestampMs: number | null;
	extra?: Record<string, number>;
}

export interface PilotMetricSummary {
	totalCompletedLaps: number;
	bestLap: (MetricSnapshot & { lapNumber: number }) | null;
	fastestConsecutive: (MetricSnapshot & { startLap: number; lapWindow: number }) | null;
	fastestRace: (MetricSnapshot & { lapCount: number }) | null;
	holeshot: MetricSnapshot | null;
	bestLapTimeSeconds: number | null;
}

export function usePilotOverviewMeta(pilotId: string): PilotOverviewMeta {
	return useAtomValue(pilotOverviewMetaAtom(pilotId));
}

export function usePilotLapGroups(pilotId: string): PilotRaceLapGroup[] {
	return useAtomValue(pilotLapGroupsAtom(pilotId));
}

export function usePilotTimeline(pilotId: string): PilotTimelineLap[] {
	return useAtomValue(pilotTimelineLapsAtom(pilotId));
}

export function usePilotUpcomingRaces(pilotId: string): PilotUpcomingRace[] {
	return useAtomValue(pilotUpcomingRacesAtom(pilotId));
}

export function usePilotMetricSummary(pilotId: string): PilotMetricSummary {
	const races = useAtomValue(racesAtom);
	const rounds = useAtomValue(roundsDataAtom);
	const lapGroups = usePilotLapGroups(pilotId);
	const raceMap = useMemo(() => new Map(races.map((race) => [race.id, race])), [races]);
	const roundMap = useMemo(() => new Map(rounds.map((round) => [round.id, round])), [rounds]);
	const lapGroupMap = useMemo(() => {
		const map = new Map<string, PilotRaceLapGroup>();
		lapGroups.forEach((group) => map.set(group.race.id, group));
		return map;
	}, [lapGroups]);

	const labelForRace = (raceId: string): string => {
		const race = raceMap.get(raceId);
		const round = race ? roundMap.get(race.round ?? '') : undefined;
		return buildRaceLabel(race, round);
	};

	const findLapTimestamp = (raceId: string, lapNumber: number | null | undefined): number | null => {
		if (lapNumber == null) return null;
		const group = lapGroupMap.get(raceId);
		if (!group) return null;
		const lap = group.laps.find((entry) => entry.lapNumber === lapNumber);
		return lap?.detectionTimestampMs ?? null;
	};

	const findRaceTimestamp = (raceId: string): number | null => {
		const group = lapGroupMap.get(raceId);
		if (!group) return null;
		const fromRaceStart = parseTimestampMs(group.race.startTime ?? null);
		if (fromRaceStart != null) return fromRaceStart;
		const firstLap = group.laps.find((entry) => entry.lapNumber === 1) ?? group.laps[0];
		return firstLap?.detectionTimestampMs ?? null;
	};

	const findHoleshotTimestamp = (raceId: string): number | null => {
		const group = lapGroupMap.get(raceId);
		return group?.holeshot?.detectionTimestampMs ?? null;
	};

	const bestLapPair = useAtomValue(pilotBestLapAtom(pilotId));
	const consecutivePair = useAtomValue(pilotConsecAtom(pilotId));
	const fastestRacePair = useAtomValue(pilotFastestTotalRaceAtom(pilotId));
	const holeshotPair = useAtomValue(pilotHoleshotAtom(pilotId));
	const totalLapsPair = useAtomValue(pilotTotalLapsAtom(pilotId));
	const consecutiveWindow = useAtomValue(consecutiveLapsAtom);

	const bestLap = bestLapPair.current
		? {
			time: bestLapPair.current.time,
			raceId: bestLapPair.current.raceId,
			raceLabel: labelForRace(bestLapPair.current.raceId),
			lapNumber: bestLapPair.current.lapNumber,
			timestampMs: findLapTimestamp(bestLapPair.current.raceId, bestLapPair.current.lapNumber),
		}
		: null;

	const fastestConsecutive = consecutivePair.current
		? {
			time: consecutivePair.current.time,
			raceId: consecutivePair.current.raceId,
			raceLabel: labelForRace(consecutivePair.current.raceId),
			startLap: consecutivePair.current.startLap,
			lapWindow: consecutiveWindow,
			timestampMs: findLapTimestamp(consecutivePair.current.raceId, consecutivePair.current.startLap),
		}
		: null;

	const fastestRace = fastestRacePair.current
		? {
			time: fastestRacePair.current.time,
			raceId: fastestRacePair.current.raceId,
			raceLabel: labelForRace(fastestRacePair.current.raceId),
			lapCount: fastestRacePair.current.lapCount,
			timestampMs: findRaceTimestamp(fastestRacePair.current.raceId),
		}
		: null;

	const holeshot = holeshotPair.current
		? {
			time: holeshotPair.current.time,
			raceId: holeshotPair.current.raceId,
			raceLabel: labelForRace(holeshotPair.current.raceId),
			timestampMs: findHoleshotTimestamp(holeshotPair.current.raceId),
		}
		: null;

	return {
		totalCompletedLaps: totalLapsPair.current ?? 0,
		bestLap,
		fastestConsecutive,
		fastestRace,
		bestLapTimeSeconds: bestLapPair.current?.time ?? null,
		holeshot,
	};
}

export function usePilotBestLapTime(pilotId: string): number | null {
	const { current } = useAtomValue(pilotBestLapAtom(pilotId));
	return current?.time ?? null;
}

export type { PilotLap };
