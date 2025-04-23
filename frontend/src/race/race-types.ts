import { Bracket } from '../types/index.ts';
import { RaceWithProcessedLaps } from '../state/index.ts';

export interface LapsViewProps {
    raceId: string;
}

export interface LapsTableProps {
    race: RaceWithProcessedLaps;
    matchingBracket: Bracket | null;
}

export interface Round {
    ID: string;
    RoundNumber: number;
}

export interface RoundData extends Round {
    // Add other round data properties as needed
}

export interface PilotLapData {
    pilotChannel: any; // TODO: Replace with proper PilotChannel type
    completedLaps: number;
} 