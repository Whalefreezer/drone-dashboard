import { atom } from 'jotai';
import { atomFamily } from 'jotai/utils';
// Legacy RaceEvent removed; we expose PBEventRecord and small derived atoms instead
import { Bracket } from '../bracket/bracket-types.ts';
import { atomWithSuspenseQuery } from 'jotai-tanstack-query';
import { getEnvEventIdFallback, pbSubscribeCollection } from '../api/pb.ts';
import { findIndexOfCurrentRace } from '../common/index.ts';
import { 
    ProcessedLap, 
    RaceWithProcessedLaps, 
    ComputedRace,
    OverallBestTimes,
    useCachedAtom,
    updateAtom,
    useUpdater,
    isRaceActive,
    calculateProcessedLaps,
    orderRaces,
    findEliminatedPilots,
    calculateOverallBestTimes
} from './commonAtoms.ts';
import {
    PBEventRecord,
    PBPilotRecord,
    PBChannelRecord,
    PBRoundRecord,
    PBRaceRecord,
    PBLapRecord,
    PBDetectionRecord,
    PBGamePointRecord,
} from '../api/pbTypes.ts';
import { PrimaryTimingSystemLocation, ValidityType } from '../types/common.ts';



// Live events collection; we filter locally for the current event
export const eventsAtom = pbSubscribeCollection<PBEventRecord>('events');

// Current event PocketBase record (marked by isCurrent)
export const currentEventAtom = atom((get) => {
    const events = get(eventsAtom);
    const currentEvent = events.find((event) => event.isCurrent);
    return currentEvent || null;
});

// Expose current event sourceId for places that still need the GUID
export const eventIdAtom = atom<string | null>((get) => {
    const ev = get(currentEventAtom);
    return ev?.sourceId ?? getEnvEventIdFallback();
});

// Derived: race sourceIds for the current event
export const eventRaceIdsAtom = atom((get): string[] => {
    const ev = get(currentEventAtom);
    if (!ev) return [];
    const races = get(raceRecordsAtom).filter((r) => r.event === ev.id);
    return races.map((r) => r.sourceId);
});

export const consecutiveLapsAtom = atom((get) => {
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
export const pilotsAtom = atom((get) => get(pilotsRecordsAtom));

// Re-export from common
export { useCachedAtom };

// Channels as PB records
export const channelRecordsAtom = pbSubscribeCollection<PBChannelRecord>('channels');
export const channelsDataAtom = atom((get) => get(channelRecordsAtom));

export const roundRecordsAtom = pbSubscribeCollection<PBRoundRecord>('rounds');
export const roundsDataAtom = atom((get): PBRoundRecord[] => {
    const ev = get(currentEventAtom);
    if (!ev) return [];
    return get(roundRecordsAtom).filter((r) => r.event === ev.id);
});

// Live records for race and nested collections
const raceRecordsAtom = pbSubscribeCollection<PBRaceRecord>('races');
const lapRecordsAtom = pbSubscribeCollection<PBLapRecord>('laps');
const detectionRecordsAtom = pbSubscribeCollection<PBDetectionRecord>('detections');
const gamePointRecordsAtom = pbSubscribeCollection<PBGamePointRecord>('gamePoints');

export const racesAtom = atom((get) => {
    const raceIds = get(eventRaceIdsAtom);
    const races = raceIds
        .map((raceId) => get(raceFamilyAtom(raceId)))
        .filter((r) => r.Valid);
    const rounds = get(roundsDataAtom);
    orderRaces(races, rounds);
    return races;
});

export const currentRaceAtom = atom(async (get) => {
    const races = await get(racesAtom);
    const currentRace = findIndexOfCurrentRace(races);
    return races[currentRace];
});

// Re-export types and functions from common
export type { ProcessedLap, RaceWithProcessedLaps, OverallBestTimes };
export { orderRaces, isRaceActive, calculateProcessedLaps };

// Synchronous signal for current race ID, updated by UI once data is available.
// This allows other atoms to read the current race context without awaiting async atoms.
export const currentRaceIdSignalAtom = atom<string | null>(null);

export const raceFamilyAtom = atomFamily((raceSourceId: string) =>
    atom((get): RaceWithProcessedLaps => {
        const ev = get(currentEventAtom);
        const raceRec = get(raceRecordsAtom).find(
            (r) => r.sourceId === raceSourceId && (!ev || r.event === ev.id),
        );
        const roundGuid = (() => {
            if (!raceRec?.round) return '';
            const roundRec = get(roundRecordsAtom).find((rr) => rr.id === raceRec.round);
            return roundRec?.sourceId ?? '';
        })();
        const eventGuid = ev?.sourceId ?? '';
        const laps = get(lapRecordsAtom)
            .filter((l) => l.race === raceRec?.id)
            .map((l) => ({
                ID: l.sourceId,
                Detection: '',
                LengthSeconds: Number(l.lengthSeconds ?? 0),
                LapNumber: Number(l.lapNumber ?? 0),
                StartTime: String(l.startTime ?? ''),
                EndTime: String(l.endTime ?? ''),
            }));
        const detections = get(detectionRecordsAtom)
            .filter((d) => d.race === raceRec?.id)
            .map((d) => ({
                ID: d.sourceId,
                TimingSystemIndex: Number(d.timingSystemIndex ?? 0),
                Channel: String(d.channel ?? ''),
                Time: String(d.time ?? ''),
                Peak: Number(d.peak ?? 0),
                TimingSystemType: String(d.timingSystemType ?? ''),
                Pilot: String(d.pilot ?? ''),
                LapNumber: Number(d.lapNumber ?? 0),
                Valid: Boolean(d.valid),
                ValidityType: toValidityType(d.validityType),
                IsLapEnd: Boolean(d.isLapEnd),
                RaceSector: Number(d.raceSector ?? 0),
                IsHoleshot: Boolean(d.isHoleshot),
            }));
        const gamePoints = get(gamePointRecordsAtom)
            .filter((g) => g.race === raceRec?.id)
            .map((g) => ({
                ID: g.sourceId,
                Channel: String(g.channel ?? ''),
                Pilot: String(g.pilot ?? ''),
                Valid: Boolean(g.valid),
                Time: String(g.time ?? ''),
            }));

        const race: ComputedRace = {
            ID: raceRec?.sourceId ?? raceSourceId,
            Laps: laps,
            Detections: detections,
            GamePoints: gamePoints,
            Start: String(raceRec?.start ?? ''),
            End: String(raceRec?.end ?? ''),
            TotalPausedTime: String(raceRec?.totalPausedTime ?? ''),
            PilotChannels: [],
            RaceNumber: Number(raceRec?.raceNumber ?? 0),
            Round: roundGuid,
            TargetLaps: Number((raceRec as any)?.targetLaps ?? 0),
            PrimaryTimingSystemLocation: toPTSL(raceRec?.primaryTimingSystemLocation),
            Valid: Boolean(raceRec?.valid),
            AutoAssignNumbers: undefined,
            Event: eventGuid,
            Bracket: String(raceRec?.bracket ?? ''),
        };

        const processedLaps = calculateProcessedLaps(race);
        return { ...race, processedLaps } as RaceWithProcessedLaps;
    }),
);

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
export { updateAtom, useUpdater, findEliminatedPilots };

export const overallBestTimesAtom = atom(async (get) => {
    const races = await get(racesAtom);
    return calculateOverallBestTimes(races);
});
