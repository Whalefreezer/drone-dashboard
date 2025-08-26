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
    PBPilotChannelRecord,
} from '../api/pbTypes.ts';
import { PrimaryTimingSystemLocation, ValidityType } from '../common/enums.ts';



// Live events collection; we filter locally for the current event
export const eventsAtom = pbSubscribeCollection<PBEventRecord>('events');

// Current event PocketBase record (marked by isCurrent)
export const currentEventAtom = atom(async (get) => {
    const events = await get(eventsAtom);
    const currentEvent = events.find((event) => event.isCurrent);
    return currentEvent || null;
});

// Expose current event ID (prefer PB id; fallback to sourceId only for interop)
export const eventIdAtom = atom(async (get) => {
    const ev = await get(currentEventAtom);
    return ev?.id ?? ev?.sourceId ?? getEnvEventIdFallback();
});

// Derived: race ids for the current event (prefer PB id)
export const eventRaceIdsAtom = atom(async (get): Promise<string[]> => {
    const ev = await get(currentEventAtom);
    if (!ev) return [];
    const races = await get(raceRecordsAtom);
    return races.filter((r) => r.event === ev.id).map((r) => r.id);
});

export const consecutiveLapsAtom = atom(async (get) => {
    const ev = await get(currentEventAtom);
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
export const pilotsAtom = atom(async (get) => await get(pilotsRecordsAtom));

// Re-export from common
export { useCachedAtom };

// Channels as PB records
export const channelRecordsAtom = pbSubscribeCollection<PBChannelRecord>('channels');
export const channelsDataAtom = atom(async (get) => await get(channelRecordsAtom));

export const pilotChannelRecordsAtom = pbSubscribeCollection<PBPilotChannelRecord>('pilotChannels');

export const roundRecordsAtom = pbSubscribeCollection<PBRoundRecord>('rounds');
export const roundsDataAtom = atom(async (get): Promise<PBRoundRecord[]> => {
    const ev = await get(currentEventAtom);
    if (!ev) return [];
    const rounds = await get(roundRecordsAtom);
    return rounds.filter((r) => r.event === ev.id);
});

// Live records for race and nested collections
export const raceRecordsAtom = pbSubscribeCollection<PBRaceRecord>('races');
export const lapRecordsAtom = pbSubscribeCollection<PBLapRecord>('laps');
export const detectionRecordsAtom = pbSubscribeCollection<PBDetectionRecord>('detections');
export const gamePointRecordsAtom = pbSubscribeCollection<PBGamePointRecord>('gamePoints');

export const racesAtom = atom(async (get) => {
    const raceIds = await get(eventRaceIdsAtom);
    const races = await Promise.all(
        raceIds.map(async (raceId) => await get(raceFamilyAtom(raceId)))
    );
    const validRaces = races.filter((r) => r.Valid);
    const rounds = await get(roundsDataAtom);
    orderRaces(validRaces, rounds);
    return validRaces;
});

export const currentRaceAtom = atom(async (get) => {
    const races = await get(racesAtom);
    const currentRace = findIndexOfCurrentRace(races);
    return races[currentRace];
});

// Re-export types and functions from common
export type { ProcessedLap, RaceWithProcessedLaps, OverallBestTimes };
export { orderRaces, isRaceActive, calculateProcessedLaps };

export const raceFamilyAtom = atomFamily((raceId: string) =>
    atom(async (get): Promise<RaceWithProcessedLaps> => {
        const ev = await get(currentEventAtom);
        const raceRecords = await get(raceRecordsAtom);
        const raceRec = raceRecords.find(
            (r) => r.id === raceId && (!ev || r.event === ev.id),
        );
        const roundRecords = await get(roundRecordsAtom);
        const roundGuid = (() => {
            if (!raceRec?.round) return '';
            const roundRec = roundRecords.find((rr) => rr.id === raceRec.round);
            return roundRec?.id ?? '';
        })();
        const eventGuid = ev?.id ?? '';
        const lapRecords = await get(lapRecordsAtom);
        const laps = lapRecords
            .filter((l) => l.race === raceRec?.id)
            .map((l) => ({
                ID: l.id,
                Detection: '',
                LengthSeconds: Number(l.lengthSeconds ?? 0),
                LapNumber: Number(l.lapNumber ?? 0),
                StartTime: String(l.startTime ?? ''),
                EndTime: String(l.endTime ?? ''),
            }));
        const detectionRecords = await get(detectionRecordsAtom);
        const detections = detectionRecords
            .filter((d) => d.race === raceRec?.id)
            .map((d) => ({
                ID: d.id,
                TimingSystemIndex: Number(d.timingSystemIndex ?? 0),
                Channel: String(d.channel ?? ''), // PB id
                Time: String(d.time ?? ''),
                Peak: Number(d.peak ?? 0),
                TimingSystemType: String(d.timingSystemType ?? ''),
                Pilot: String(d.pilot ?? ''), // PB id
                LapNumber: Number(d.lapNumber ?? 0),
                Valid: Boolean(d.valid),
                ValidityType: toValidityType(d.validityType),
                IsLapEnd: Boolean(d.isLapEnd),
                RaceSector: Number(d.raceSector ?? 0),
                IsHoleshot: Boolean(d.isHoleshot),
            }));
        const gamePointRecords = await get(gamePointRecordsAtom);
        const gamePoints = gamePointRecords
            .filter((g) => g.race === raceRec?.id)
            .map((g) => ({
                ID: g.id,
                Channel: String(g.channel ?? ''), // PB id
                Pilot: String(g.pilot ?? ''), // PB id
                Valid: Boolean(g.valid),
                Time: String(g.time ?? ''),
            }));

        const pilotChannelRecords = await get(pilotChannelRecordsAtom);
        const race: ComputedRace = {
            ID: raceRec?.id ?? raceId,
            Laps: laps,
            Detections: detections,
            GamePoints: gamePoints,
            Start: String(raceRec?.start ?? ''),
            End: String(raceRec?.end ?? ''),
            TotalPausedTime: String(raceRec?.totalPausedTime ?? ''),
            PilotChannels: pilotChannelRecords
                .filter((pc) => (!ev || pc.event === ev.id))
                .map((pc) => ({
                    ID: pc.id,
                    Pilot: String(pc.pilot ?? ''), // PB id
                    Channel: String(pc.channel ?? ''), // PB id
                })),
            RaceNumber: Number(raceRec?.raceNumber ?? 0),
            Round: roundGuid,
            TargetLaps: Number((raceRec as unknown as { targetLaps?: number })?.targetLaps ?? 0),
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
