import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAtomValue } from 'jotai';
import { useQueryAtom } from '../state/hooks.ts';
import {
    bracketsDataAtom,
    channelsDataAtom,
    findEliminatedPilots,
    pilotsAtom,
    racesAtom,
    RaceWithProcessedLaps, // Import the correct type
    roundsDataAtom,
} from '../state/index.ts';
import { findIndexOfCurrentRace } from '../common/index.ts';
import { calculateLeaderboardData, getPositionChanges } from './leaderboard-logic.ts';
import { LeaderboardEntry } from './leaderboard-types.ts';
import { Bracket } from '../bracket/bracket-types.ts';
import { Channel, Pilot, Round } from '../types/types.ts';

// --- Hook 1: Fetching Raw State ---
interface LeaderboardState {
    races: RaceWithProcessedLaps[];
    pilots: Pilot[];
    channels: Channel[];
    roundDataValue: Round[];
    brackets: Bracket[];
}

export const useLeaderboardState = (): LeaderboardState => {
    const races = useAtomValue(racesAtom);
    const pilots = useAtomValue(pilotsAtom);
    const channels = useAtomValue(channelsDataAtom);
    const roundDataValue = useAtomValue(roundsDataAtom);
    const brackets = useQueryAtom(bracketsDataAtom);

    return { races, pilots, channels, roundDataValue, brackets };
};

// --- Hook 2: Performing Calculations ---
interface LeaderboardCalculations {
    currentRaceIndex: number;
    eliminatedPilots: { name: string }[];
    currentLeaderboard: LeaderboardEntry[];
    previousLeaderboard: LeaderboardEntry[];
    positionChanges: Map<string, number>;
}

export const useLeaderboardCalculations = (
    state: LeaderboardState,
): LeaderboardCalculations => {
    const { races, pilots, channels, brackets } = state;

    const currentRaceIndex = findIndexOfCurrentRace(races);
    const eliminatedPilots = findEliminatedPilots(brackets);

    const [currentLeaderboard, previousLeaderboard] = useMemo(() => {
        const current = calculateLeaderboardData(
            races,
            pilots,
            channels,
            currentRaceIndex,
            brackets,
        );
        // Calculate previous state based on races up to one before the current *displayed* race index
        // Note: currentRaceIndex is the index of the race *currently being fetched/processed*.
        // The leaderboard shows data *up to* this race.
        // So, the 'previous' state should be based on races *before* the one preceding the current.
        const previousRaceIndex = Math.max(0, currentRaceIndex - 1);
        const previous = calculateLeaderboardData(
            races.slice(0, previousRaceIndex),
            pilots,
            channels,
            // Pass the index relative to the sliced array, effectively the last index of the *previous* state
            previousRaceIndex - 1,
            brackets,
        );
        return [current, previous];
    }, [races, pilots, channels, currentRaceIndex, brackets]);

    const positionChanges = useMemo(
        () => getPositionChanges(currentLeaderboard, previousLeaderboard),
        [currentLeaderboard, previousLeaderboard],
    );

    return {
        currentRaceIndex,
        eliminatedPilots,
        currentLeaderboard,
        previousLeaderboard,
        positionChanges,
    };
};

// --- Hook 3: Handling Animation ---
export const useLeaderboardAnimation = (
    currentLeaderboard: LeaderboardEntry[],
    positionChanges: Map<string, number>,
): Set<string> => {
    const [animatingRows, setAnimatingRows] = useState<Set<string>>(new Set());

    useEffect(() => {
        const newAnimatingRows = new Set<string>();
        currentLeaderboard.forEach((entry, index) => {
            const prevPos = positionChanges.get(entry.pilot.ID);
            // Animate if previous position exists and was worse (higher number) than current
            if (prevPos && prevPos > index + 1) {
                newAnimatingRows.add(entry.pilot.ID);
            }
        });
        setAnimatingRows(newAnimatingRows);
        const timer = setTimeout(() => {
            setAnimatingRows(new Set());
        }, 1000); // Animation duration
        return () => clearTimeout(timer);
    }, [currentLeaderboard, positionChanges]);

    return animatingRows;
};
