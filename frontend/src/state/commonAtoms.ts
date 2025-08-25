import { Atom, atom, useAtomValue, useSetAtom } from 'jotai';
import { loadable } from 'jotai/utils';
import { Race, Round } from '../types/index.ts';
import { Bracket, EliminatedPilot } from '../bracket/bracket-types.ts';
import { useEffect, useState } from 'react';
import { findIndexOfCurrentRace } from '../common/index.ts';

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

export interface RaceWithProcessedLaps extends Race {
    processedLaps: ProcessedLap[];
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
 */
export function isRaceActive(race: RaceWithProcessedLaps | undefined): boolean {
    if (!race) return false;
    const started = !!race.Start && !String(race.Start).startsWith('0');
    const ended = !!race.End && !String(race.End).startsWith('0');
    const raceStarted = started && !ended;
    return raceStarted;
}

/**
 * Calculates processed laps from a race, filtering out invalid detections and sorting by lap number
 */
export function calculateProcessedLaps(race: Race): ProcessedLap[] {
    return race.Laps
        .map((lap) => {
            const detection = race.Detections.find((d) => lap.Detection === d.ID);
            if (!detection || !detection.Valid) return null;

            return {
                id: lap.ID,
                lapNumber: lap.LapNumber,
                lengthSeconds: lap.LengthSeconds,
                pilotId: detection.Pilot,
                valid: true,
                startTime: lap.StartTime,
                endTime: lap.EndTime,
                isHoleshot: detection.IsHoleshot,
            } as ProcessedLap;
        })
        .filter((lap): lap is ProcessedLap => lap !== null)
        .sort((a, b) => a.lapNumber - b.lapNumber);
}

/**
 * Orders races by round order and race number
 */
export function orderRaces(races: Race[], rounds: Round[]) {
    return races.sort((a, b) => {
        const aRound = rounds.find((r) => r.ID === a.Round);
        const bRound = rounds.find((r) => r.ID === b.Round);
        const orderDiff = (aRound?.Order ?? 0) - (bRound?.Order ?? 0);
        if (orderDiff !== 0) return orderDiff;
        return (a.RaceNumber ?? 0) - (b.RaceNumber ?? 0);
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
 * Calculates overall best times from all races
 */
export function calculateOverallBestTimes(races: RaceWithProcessedLaps[]): OverallBestTimes {
    const overallBestTimes: OverallBestTimes = {
        overallFastestLap: Infinity,
        pilotBestLaps: new Map(),
    };

    races.forEach((race) => {
        race.processedLaps.forEach((lap) => {
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
    });

    return overallBestTimes;
}
