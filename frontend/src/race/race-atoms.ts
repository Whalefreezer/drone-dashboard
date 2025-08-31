// PB-native race atoms
// This replaces the legacy raceFamilyAtom with a cleaner, more direct approach

import { atomFamily } from 'jotai/utils';
import {
    currentEventAtom,
    raceRecordsAtom,
    currentOrderKVAtom,
    roundsDataAtom,
    consecutiveLapsAtom,
    raceProcessedLapsAtom as baseRaceProcessedLapsAtom,
    racePilotChannelsAtom as baseRacePilotChannelsAtom,
} from '../state/pbAtoms.ts';
import { computeRaceStatus, RaceStatus } from './race-types.ts';
import type { PBRaceRecord } from '../api/pbTypes.ts';
import { eagerAtom } from 'jotai-eager';
import { EventType } from '../api/pbTypes.ts';

type PilotCalc = {
    pilotChannel: { id: string; pilotId: string; channelId: string };
    completedLaps: number;
    completionTime: number; // holeshot + first N laps (N = targetLaps), Infinity if not completed
    consecutiveTime: number; // best N-consecutive time (N = event pbLaps), Infinity if not enough
};

/**
 * Per-race pilot calculations used for ranking in LapsView
 */
export const racePilotCalcsAtom = atomFamily((raceId: string) =>
    eagerAtom((get): PilotCalc[] => {
        const race = get(raceDataAtom(raceId));
        if (!race) return [];

        const rounds = get(roundsDataAtom);
        const nConsec = get(consecutiveLapsAtom);

        const processedLaps = get(baseRaceProcessedLapsAtom(raceId));
        const pilotChannels = get(baseRacePilotChannelsAtom(raceId));

        return pilotChannels.map((pilotChannel) => {
            const lapsForPilot = processedLaps.filter((lap) => lap.pilotId === pilotChannel.pilotId);
            const holeshot = lapsForPilot.find((l) => l.isHoleshot) ?? null;
            const racingLaps = lapsForPilot.filter((l) => !l.isHoleshot);
            const completedLaps = racingLaps.length;

            // Completion time for targetLaps (Race rounds)
            const target = race.targetLaps ?? 0;
            let completionTime = Number.POSITIVE_INFINITY;
            if (target > 0 && holeshot && racingLaps.length >= target) {
                const hs = holeshot.lengthSeconds;
                const firstN = racingLaps.slice(0, target).reduce((s, l) => s + l.lengthSeconds, 0);
                completionTime = hs + firstN;
            }

            // Fastest N consecutive (Practice/TimeTrial/etc)
            let consecutiveTime = Number.POSITIVE_INFINITY;
            if (nConsec > 0 && racingLaps.length >= nConsec) {
                for (let i = 0; i <= racingLaps.length - nConsec; i++) {
                    const sum = racingLaps.slice(i, i + nConsec).reduce((s, l) => s + l.lengthSeconds, 0);
                    if (sum < consecutiveTime) consecutiveTime = sum;
                }
            }

            return { pilotChannel, completedLaps, completionTime, consecutiveTime };
        });
    })
);

/**
 * Sorted pilot rows for LapsView based on event type:
 * - Race: first to complete targetLaps, then by most laps
 * - Others: fastest N consecutive (N = pbLaps), then by most laps
 */
export const raceSortedRowsAtom = atomFamily((raceId: string) =>
    eagerAtom((get): { pilotChannel: { id: string; pilotId: string; channelId: string }; position: number }[] => {
        const race = get(raceDataAtom(raceId));
        if (!race) return [];
        const rounds = get(roundsDataAtom);
        const isRaceRound = (rounds.find((r) => r.id === (race.round ?? ''))?.eventType === EventType.Race);
        const calcs = get(racePilotCalcsAtom(raceId));

        let sorted: PilotCalc[];
        if (isRaceRound) {
            const completed = calcs.filter((p) => Number.isFinite(p.completionTime))
                .sort((a, b) => a.completionTime - b.completionTime);
            const notCompleted = calcs.filter((p) => !Number.isFinite(p.completionTime))
                .sort((a, b) => b.completedLaps - a.completedLaps);
            sorted = [...completed, ...notCompleted];
        } else {
            const haveConsec = calcs.filter((p) => Number.isFinite(p.consecutiveTime))
                .sort((a, b) => a.consecutiveTime - b.consecutiveTime);
            const noConsec = calcs.filter((p) => !Number.isFinite(p.consecutiveTime))
                .sort((a, b) => b.completedLaps - a.completedLaps);
            sorted = [...haveConsec, ...noConsec];
        }

        return sorted.map((p, idx) => ({ pilotChannel: p.pilotChannel, position: idx + 1 }));
    })
);

/**
 * Max lap number present in a race (for column count)
 */
export const raceMaxLapNumberAtom = atomFamily((raceId: string) =>
    eagerAtom((get): number => {
        const processedLaps = get(baseRaceProcessedLapsAtom(raceId));
        return Math.max(0, ...processedLaps.map((lap) => lap.lapNumber));
    })
);

// Re-export the dedicated atoms for convenience in race domain
export {
    baseRaceProcessedLapsAtom as raceProcessedLapsAtom,
    baseRacePilotChannelsAtom as racePilotChannelsAtom,
};

/**
 * PB-native race atom family - much cleaner than the legacy ComputedRace approach
 */
export const raceDataAtom = atomFamily((raceId: string) =>
    eagerAtom((get): PBRaceRecord | null => {
        const currentEvent = get(currentEventAtom);
        if (!currentEvent) return null;

        // Get the PB race record directly
        const raceRecords = get(raceRecordsAtom);
        const raceRecord = raceRecords.find(
            (r) => r.id === raceId && r.event === currentEvent.id,
        );
        if (!raceRecord) return null;
        return raceRecord;
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
export const allRacesAtom = eagerAtom((get): PBRaceRecord[] => {
    const currentEvent = get(currentEventAtom);
    if (!currentEvent) return [];

    const raceRecords = get(raceRecordsAtom);
    const validRaceRecords = raceRecords.filter(
        (r) => r.event === currentEvent.id && r.valid !== false,
    );

    return validRaceRecords.sort((a, b) => {
        return a.raceOrder - b.raceOrder;
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
export const currentRaceAtom = eagerAtom((get): PBRaceRecord | null => {
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
export const lastCompletedRaceAtom = eagerAtom((get): PBRaceRecord | null => {
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

/**
 * Next races atom - returns the next 8 races based on current order from KV store
 * Uses the order field from currentOrderKVAtom to find races with higher raceOrder values
 */
export const nextRacesAtom = eagerAtom((get): PBRaceRecord[] => {
    const races = get(allRacesAtom);
    const currentOrderKV = get(currentOrderKVAtom);

    if (!races || races.length === 0 || !currentOrderKV?.order) {
        return [];
    }

    const currentOrder = currentOrderKV.order;

    // Find all races with raceOrder greater than current order
    const nextRacesByOrder = races
        .filter((race) => race.raceOrder && race.raceOrder > currentOrder)
        .sort((a, b) => (a.raceOrder ?? 0) - (b.raceOrder ?? 0))
        .slice(0, 8); // Take first 8

    return nextRacesByOrder;
});
