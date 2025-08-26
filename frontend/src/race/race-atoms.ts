// PB-native race atoms
// This replaces the legacy raceFamilyAtom with a cleaner, more direct approach

import { atom } from 'jotai';
import { atomFamily } from 'jotai/utils';
import {
    currentEventAtom,
    detectionRecordsAtom,
    lapRecordsAtom,
    pilotChannelRecordsAtom,
    raceRecordsAtom,
    roundRecordsAtom,
} from '../state/pbAtoms.ts';
import {
    computePilotChannelAssociations,
    computeProcessedLaps,
    computeRaceStatus,
    findCurrentRaceIndex,
    RaceData,
    RaceStatus,
} from './race-types.ts';

/**
 * PB-native race atom family - much cleaner than the legacy ComputedRace approach
 */
export const raceDataAtom = atomFamily((raceId: string) =>
    atom(async (get): Promise<RaceData | null> => {
        const currentEvent = await get(currentEventAtom);
        if (!currentEvent) return null;

        // Get the PB race record directly
        const raceRecords = await get(raceRecordsAtom);
        const raceRecord = raceRecords.find(
            (r) => r.id === raceId && r.event === currentEvent.id,
        );
        if (!raceRecord) return null;

        // Get related PB records for this race
        const lapRecords = await get(lapRecordsAtom);
        const laps = lapRecords.filter((l) => l.race === raceId);
        const detectionRecords = await get(detectionRecordsAtom);
        const detections = detectionRecords.filter((d) => d.race === raceId);
        const pilotChannelRecords = await get(pilotChannelRecordsAtom);
        const racePilotChannels = pilotChannelRecords.filter(
            (pc) => pc.race === raceId,
        );

        // Compute processed data directly from PB records
        const processedLaps = computeProcessedLaps(laps, detections);
        const pilotChannels = computePilotChannelAssociations(racePilotChannels);

        return {
            id: raceRecord.id,
            raceNumber: raceRecord.raceNumber ?? 0,
            roundId: raceRecord.round ?? '',
            eventId: raceRecord.event ?? '',
            valid: raceRecord.valid ?? false,
            start: raceRecord.start,
            end: raceRecord.end,
            bracket: raceRecord.bracket,
            targetLaps: raceRecord.targetLaps,
            processedLaps,
            pilotChannels,
        };
    })
);

/**
 * Race status atom family for checking if a race is active/completed
 */
export const raceStatusAtom = atomFamily((raceId: string) =>
    atom(async (get): Promise<RaceStatus | null> => {
        const currentEvent = await get(currentEventAtom);
        if (!currentEvent) return null;

        const raceRecords = await get(raceRecordsAtom);
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
export const allRacesAtom = atom(async (get): Promise<RaceData[]> => {
    const currentEvent = await get(currentEventAtom);
    if (!currentEvent) return [];

    const raceRecords = await get(raceRecordsAtom);
    const validRaceRecords = raceRecords.filter(
        (r) => r.event === currentEvent.id && r.valid !== false,
    );

    const racePromises = validRaceRecords.map(async (record) => await get(raceDataAtom(record.id)));
    const races = await Promise.all(racePromises);
    return races.filter((race): race is RaceData => race !== null);
});

/**
 * Races ordered by round and race number - PB native
 */
export const orderedRacesAtom = atom(async (get): Promise<RaceData[]> => {
    const races = await get(allRacesAtom);
    const rounds = await get(roundRecordsAtom);

    return races.sort((a: RaceData, b: RaceData) => {
        const aRound = rounds.find((r) => r.id === a.roundId);
        const bRound = rounds.find((r) => r.id === b.roundId);
        const orderDiff = (aRound?.order ?? 0) - (bRound?.order ?? 0);
        if (orderDiff !== 0) return orderDiff;
        return a.raceNumber - b.raceNumber;
    });
});

/**
 * Current race detection - PB native
 * 
 * Uses identical logic to common/utils.ts findIndexOfCurrentRace():
 * 1. Find active race (valid, started, not ended)
 * 2. If none, find last completed race and return next one  
 * 3. Fallback to first race
 */
export const currentRaceAtom = atom(async (get): Promise<RaceData | null> => {
    const races = await get(orderedRacesAtom);
    
    if (!races || races.length === 0) {
        return null;
    }

    // Step 1: Find active race (valid, started, not ended) - same logic as findIndexOfCurrentRace
    const activeRaceIndex = races.findIndex((race) => {
        if (!race.valid) {
            return false;
        }
        if (!race.start || race.start.startsWith('0')) {
            return false;
        }
        if (!race.end || race.end.startsWith('0')) {
            return true; // Started but not ended = active
        }
        return false;
    });

    if (activeRaceIndex !== -1) {
        return races[activeRaceIndex];
    }

    // Step 2: Find last completed race and return next one - same logic as findIndexOfCurrentRace
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

    if (lastCompletedIndex !== -1) {
        const nextIndex = Math.min(lastCompletedIndex + 1, races.length - 1);
        return races[nextIndex];
    }

    // Step 3: Fallback to first race if no completed races - same logic as findIndexOfCurrentRace
    return races[0] || null;
});

/**
 * Helper to find current race index - uses same logic as findIndexOfCurrentRace
 */
export const currentRaceIndexAtom = atom(async (get): Promise<number> => {
    const races = await get(orderedRacesAtom);
    return findCurrentRaceIndex(races);
});

/**
 * Last completed race - computed at atom level to avoid hook violations
 */
export const lastCompletedRaceAtom = atom(async (get): Promise<RaceData | null> => {
    const races = await get(orderedRacesAtom);
    
    if (!races || races.length === 0) {
        return null;
    }

    // Find last completed race using same logic as findIndexOfCurrentRace
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
