import { eagerAtom } from 'jotai-eager';
import { calculateLeaderboardData, getPositionChanges } from './leaderboard-logic.ts';
import { LeaderboardEntry } from './leaderboard-types.ts';
import {
    bracketsDataAtom,
    channelsDataAtom,
    consecutiveLapsAtom,
    findEliminatedPilots,
    pilotsAtom,
    racesAtom,
} from '../state/index.ts';
import { currentRaceIndexAtom } from '../race/race-atoms.ts';

export interface LeaderboardCalculationsValue {
    currentRaceIndex: number;
    eliminatedPilots: { name: string }[];
    currentLeaderboard: LeaderboardEntry[];
    previousLeaderboard: LeaderboardEntry[];
    positionChanges: Map<string, number>;
}

export const leaderboardCalculationsAtom = eagerAtom((get): LeaderboardCalculationsValue => {
    const races = get(racesAtom);
    const pilots = get(pilotsAtom);
    const channels = get(channelsDataAtom);
    const bracketsResult = get(bracketsDataAtom);
    const brackets = bracketsResult?.data ?? [];
    const consecutiveLaps = get(consecutiveLapsAtom);
    const currentRaceIndex = get(currentRaceIndexAtom);

    const eliminatedPilots = findEliminatedPilots(brackets);

    const currentLeaderboard = calculateLeaderboardData(
        races,
        pilots,
        channels,
        currentRaceIndex,
        brackets,
        consecutiveLaps,
    );

    const previousRaceIndex = Math.max(0, currentRaceIndex - 1);
    const previousLeaderboard = calculateLeaderboardData(
        races.slice(0, previousRaceIndex),
        pilots,
        channels,
        previousRaceIndex - 1,
        brackets,
        consecutiveLaps,
    );

    const positionChanges = getPositionChanges(currentLeaderboard, previousLeaderboard);

    return {
        currentRaceIndex,
        eliminatedPilots,
        currentLeaderboard,
        previousLeaderboard,
        positionChanges,
    };
});
