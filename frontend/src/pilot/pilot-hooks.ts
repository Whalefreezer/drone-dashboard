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
	const raceMap = useMemo(() => new Map(races.map((race) => [race.id, race])), [races]);
	const roundMap = useMemo(() => new Map(rounds.map((round) => [round.id, round])), [rounds]);

	const labelForRace = (raceId: string): string => {
		const race = raceMap.get(raceId);
		const round = race ? roundMap.get(race.round ?? '') : undefined;
		return buildRaceLabel(race, round);
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
		}
		: null;

	const fastestConsecutive = consecutivePair.current
		? {
			time: consecutivePair.current.time,
			raceId: consecutivePair.current.raceId,
			raceLabel: labelForRace(consecutivePair.current.raceId),
			startLap: consecutivePair.current.startLap,
			lapWindow: consecutiveWindow,
		}
		: null;

	const fastestRace = fastestRacePair.current
		? {
			time: fastestRacePair.current.time,
			raceId: fastestRacePair.current.raceId,
			raceLabel: labelForRace(fastestRacePair.current.raceId),
			lapCount: fastestRacePair.current.lapCount,
		}
		: null;

	const holeshot = holeshotPair.current
		? {
			time: holeshotPair.current.time,
			raceId: holeshotPair.current.raceId,
			raceLabel: labelForRace(holeshotPair.current.raceId),
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
