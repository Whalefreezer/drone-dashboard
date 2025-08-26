// PB-native race data structures
// This replaces the legacy ComputedRace and RaceWithProcessedLaps types

import type { PBRaceRecord, PBLapRecord, PBDetectionRecord, PBPilotChannelRecord } from '../api/pbTypes.ts';

/**
 * Processed lap data computed from PB records
 * This is the minimal data structure components actually need
 */
export interface ProcessedLap {
    id: string;
    lapNumber: number;
    lengthSeconds: number;
    pilotId: string;
    valid: boolean;
    startTime: string;
    endTime: string;
    isHoleshot: boolean;
}

/**
 * PB-native race data that components actually consume
 * No unnecessary intermediate transformations
 */
export interface RaceData {
    // Basic race metadata from PBRaceRecord
    id: string;
    raceNumber: number;
    roundId: string;
    eventId: string;
    valid: boolean;
    start?: string;
    end?: string;
    bracket?: string;
    targetLaps?: number;
    
    // Computed race data
    processedLaps: ProcessedLap[];
    pilotChannels: PilotChannelAssociation[];
}

/**
 * Simple pilot-channel association for a race
 */
export interface PilotChannelAssociation {
    id: string;
    pilotId: string;
    channelId: string;
}

/**
 * Race status computed from start/end times
 */
export interface RaceStatus {
    isActive: boolean;
    isCompleted: boolean;
    hasStarted: boolean;
}

/**
 * Computed from PB records - direct transformation without legacy intermediate steps
 * Note: PB records may have different relationship patterns than legacy data
 */
export function computeProcessedLaps(
    laps: PBLapRecord[], 
    detections: PBDetectionRecord[]
): ProcessedLap[] {
    return laps
        .map((lap) => {
            // For now, we'll match detections by lap number and race
            // This may need adjustment based on actual PB relationship structure
            const detection = detections.find((d) => 
                d.lapNumber === lap.lapNumber && d.race === lap.race
            );
            if (!detection || !detection.valid) return null;
            
            return {
                id: lap.id,
                lapNumber: lap.lapNumber ?? 0,
                lengthSeconds: lap.lengthSeconds ?? 0,
                pilotId: detection.pilot ?? '',
                valid: detection.valid ?? false,
                startTime: lap.startTime ?? '',
                endTime: lap.endTime ?? '',
                isHoleshot: detection.isHoleshot ?? false,
            } as ProcessedLap;
        })
        .filter((lap): lap is ProcessedLap => lap !== null)
        .sort((a, b) => a.lapNumber - b.lapNumber);
}

/**
 * Compute race status from PB race record
 */
export function computeRaceStatus(race: PBRaceRecord): RaceStatus {
    const hasStarted = !!(race.start && !race.start.startsWith('0'));
    const hasEnded = !!(race.end && !race.end.startsWith('0'));
    
    return {
        hasStarted,
        isActive: hasStarted && !hasEnded,
        isCompleted: hasStarted && hasEnded,
    };
}

/**
 * Transform PB pilot channel records to simple associations
 */
export function computePilotChannelAssociations(
    pilotChannels: PBPilotChannelRecord[]
): PilotChannelAssociation[] {
    return pilotChannels.map((pc) => ({
        id: pc.id,
        pilotId: pc.pilot ?? '',
        channelId: pc.channel ?? '',
    }));
}

/**
 * PB-native version of findIndexOfCurrentRace - same logic, RaceData input
 * This mirrors the logic in common/utils.ts findIndexOfCurrentRace exactly
 */
export function findCurrentRaceIndex(sortedRaces: RaceData[]): number {
    if (!sortedRaces || sortedRaces.length === 0) {
        return -1;
    }

    // Step 1: Find active race (valid, started, not ended)
    const activeRace = sortedRaces.findIndex((race) => {
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

    if (activeRace !== -1) {
        return activeRace;
    }

    // Step 2: Find last completed race and return next one
    const lastRace = sortedRaces.map((race, index) => ({ race, index }))
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

    if (lastRace !== -1) {
        return Math.min(lastRace + 1, sortedRaces.length - 1);
    }

    // Step 3: Fallback to first race if no completed races
    return sortedRaces.length > 0 ? 0 : -1;
}
