import { Atom, atom, useAtomValue, useSetAtom } from 'jotai';
import { loadable } from 'jotai/utils';
import type { PBRoundRecord } from '../api/pbTypes.ts';
import { Bracket, EliminatedPilot } from '../bracket/bracket-types.ts';
import { useEffect, useState } from 'react';

// Common types and interfaces
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



export interface OverallBestTimes {
    overallFastestLap: number;
    pilotBestLaps: Map<string, number>;
}

// Common utility functions
export function useCachedAtom<T>(anAtom: Atom<T>) {
    const [cache, setCache] = useState<T | null>(null);

    const value = useAtomValue(loadable(anAtom));

    if (value.state === 'loading') {
        if (cache === null) {
            throw new Promise(() => {});
        } else {
            return cache;
        }
    }

    if (value.state === 'hasError') {
        throw value.error;
    }

    if (value.state === 'hasData') {
        setCache(value.data);
        return value.data;
    }
}

export const updateAtom = atom<
    (Record<string, { func: () => void; count: number }>)
>({});

export function useUpdater(key: string, updater: () => void) {
    const setUpdate = useSetAtom(updateAtom);
    useEffect(() => {
        setUpdate((update) => {
            update[key] = { func: updater, count: (update[key]?.count ?? 0) + 1 };
            return update;
        });
        return () => {
            setUpdate((update) => {
                update[key].count--;
                if (update[key].count === 0) {
                    delete update[key];
                }
                return update;
            });
        };
    }, [updater]);
}

/**
 * Determines if a race is currently active (started but not ended)
 * Updated to work with RaceData from race-types.ts
 */
export function isRaceActive(race: { start?: string; end?: string } | undefined): boolean {
    if (!race) return false;
    const started = !!race.start && !String(race.start).startsWith('0');
    const ended = !!race.end && !String(race.end).startsWith('0');
    const raceStarted = started && !ended;
    return raceStarted;
}



/**
 * Orders races by round order and race number
 * Updated to work with RaceData from race-types.ts
 */
export function orderRaces(races: { roundId: string; raceNumber: number }[], rounds: PBRoundRecord[]) {
    return races.sort((a, b) => {
        const aRound = rounds.find((r) => r.id === a.roundId);
        const bRound = rounds.find((r) => r.id === b.roundId);
        const orderDiff = (aRound?.order ?? 0) - (bRound?.order ?? 0);
        if (orderDiff !== 0) return orderDiff;
        return (a.raceNumber ?? 0) - (b.raceNumber ?? 0);
    });
}

/**
 * Finds eliminated pilots from completed brackets
 */
export function findEliminatedPilots(brackets: Bracket[]): EliminatedPilot[] {
    const eliminatedPilots: EliminatedPilot[] = [];

    brackets.forEach((bracket) => {
        // Check if bracket is complete by verifying all pilots have all rounds filled
        const isComplete = bracket.pilots.every((pilot) =>
            pilot.rounds.every((round) => round !== null)
        );

        if (isComplete) {
            // Sort pilots by points to find bottom two
            const sortedPilots = [...bracket.pilots].sort((a, b) => a.points - b.points);
            const bottomTwo = sortedPilots.slice(0, 2);

            // Add bottom two pilots to eliminated list
            bottomTwo.forEach((pilot, index) => {
                eliminatedPilots.push({
                    name: pilot.name,
                    bracket: bracket.name,
                    position: sortedPilots.length - 1 - index, // Convert to position from bottom
                    points: pilot.points,
                });
            });
        }
    });

    return eliminatedPilots;
}

/**
 * Calculates overall best times from all processed laps
 * Simplified to take processed laps directly instead of race objects
 */
export function calculateOverallBestTimes(processedLaps: ProcessedLap[]): OverallBestTimes {
    const overallBestTimes: OverallBestTimes = {
        overallFastestLap: Infinity,
        pilotBestLaps: new Map(),
    };

    processedLaps.forEach((lap) => {
        if (!lap.isHoleshot) {
            // Update overall fastest
            if (lap.lengthSeconds < overallBestTimes.overallFastestLap) {
                overallBestTimes.overallFastestLap = lap.lengthSeconds;
            }

            // Update pilot's personal best
            const currentBest = overallBestTimes.pilotBestLaps.get(lap.pilotId) ?? Infinity;
            if (lap.lengthSeconds < currentBest) {
                overallBestTimes.pilotBestLaps.set(lap.pilotId, lap.lengthSeconds);
            }
        }
    });

    return overallBestTimes;
}
