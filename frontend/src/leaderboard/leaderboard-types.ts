import { Pilot, Channel } from '../types/index.ts';

// Types specific to the Leaderboard feature

export interface LeaderboardEntry {
    pilot: Pilot;
    bestLap: {
        time: number;
        roundId: string;
        raceNumber: number;
    } | null;
    consecutiveLaps: {
        time: number;
        roundId: string;
        raceNumber: number;
    } | null;
    bestHoleshot: {
        time: number;
        roundId: string;
        raceNumber: number;
    } | null;
    channel: Channel | null;
    racesUntilNext: number;
    totalLaps: number;
    eliminatedInfo: {
        bracket: string;
        position: number;
        points: number;
    } | null;
}

export enum SortDirection {
    Ascending = 'asc',
    Descending = 'desc',
}

export enum NullHandling {
    First = 'NULLS_FIRST',
    Last = 'NULLS_LAST',
    Exclude = 'EXCLUDE',
}

export interface SortCriteria {
    getValue: (entry: LeaderboardEntry) => number | null;
    direction: SortDirection;
    nullHandling: NullHandling;
}

export interface SortGroup {
    name: string;
    criteria: SortCriteria[];
    condition?: (entry: LeaderboardEntry) => boolean;
    groups?: SortGroup[]; // Nested groups
} 