// PB-native race atoms
// This replaces the legacy raceFamilyAtom with a cleaner, more direct approach

import { atomFamily } from 'jotai/utils';
import {
    currentEventAtom,
    detectionRecordsAtom,
    lapRecordsAtom,
    pilotChannelRecordsAtom,
    raceRecordsAtom,
    currentOrderKVAtom,
} from '../state/pbAtoms.ts';
import {
    computePilotChannelAssociations,
    computeProcessedLaps,
    computeRaceStatus,
    RaceData,
    RaceStatus,
} from './race-types.ts';
import { eagerAtom } from 'jotai-eager';

/**
 * PB-native race atom family - much cleaner than the legacy ComputedRace approach
 */
export const raceDataAtom = atomFamily((raceId: string) =>
    eagerAtom((get): RaceData | null => {
        const currentEvent = get(currentEventAtom);
        if (!currentEvent) return null;

        // Get the PB race record directly
        const raceRecords = get(raceRecordsAtom);
        const raceRecord = raceRecords.find(
            (r) => r.id === raceId && r.event === currentEvent.id,
        );
        if (!raceRecord) return null;

        // Get related PB records for this race
        const lapRecords = get(lapRecordsAtom);
        const laps = lapRecords.filter((l) => l.race === raceId);
        const detectionRecords = get(detectionRecordsAtom);
        const detections = detectionRecords.filter((d) => d.race === raceId);
        const pilotChannelRecords = get(pilotChannelRecordsAtom);
        const racePilotChannels = pilotChannelRecords.filter(
            (pc) => pc.race === raceId,
        );

        // Compute processed data directly from PB records
        const processedLaps = computeProcessedLaps(laps, detections);
        const pilotChannels = computePilotChannelAssociations(racePilotChannels);

        return {
            id: raceRecord.id,
            sourceId: raceRecord.sourceId,
            raceNumber: raceRecord.raceNumber ?? 0,
            roundId: raceRecord.round ?? '',
            eventId: raceRecord.event ?? '',
            valid: raceRecord.valid ?? false,
            start: raceRecord.start,
            end: raceRecord.end,
            bracket: raceRecord.bracket,
            targetLaps: raceRecord.targetLaps,
            raceOrder: raceRecord.raceOrder,
            processedLaps,
            pilotChannels,
        };
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
export const allRacesAtom = eagerAtom((get): RaceData[] => {
    const currentEvent = get(currentEventAtom);
    if (!currentEvent) return [];

    const raceRecords = get(raceRecordsAtom);
    const validRaceRecords = raceRecords.filter(
        (r) => r.event === currentEvent.id && r.valid !== false,
    );

    const races = validRaceRecords.map((record) => get(raceDataAtom(record.id)));
    const validRaces = races.filter((race): race is RaceData => race !== null);
    
    return validRaces.sort((a: RaceData, b: RaceData) => {
        const ao = a.raceOrder ?? 0;
        const bo = b.raceOrder ?? 0;
        return ao - bo;
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
export const currentRaceAtom = eagerAtom((get): RaceData | null => {
    const races = get(allRacesAtom);
    if (!races || races.length === 0) return null;

    // Use backend-published current order (client_kv) only
    const kv = get(currentOrderKVAtom);
    if (kv) {
        // First try to match by sourceId
        if (kv.sourceId) {
            const bySourceId = races.find((r) => r.sourceId === kv.sourceId);
            if (bySourceId) return bySourceId;
        }
        // Fallback to raceOrder if sourceId match fails
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
export const lastCompletedRaceAtom = eagerAtom((get): RaceData | null => {
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
