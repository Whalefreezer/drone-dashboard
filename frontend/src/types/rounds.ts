import type { DbObject, RoundType } from './common.ts';

export interface PointSummary {
    RoundPositionRollover: boolean;
    DropWorstRound: boolean;
}

export interface TimeSummary {
    IncludeAllRounds: boolean;
    TimeSummaryType: string; // "PB" | "EventLap" | "RaceTime"
}

/** GET /events/{eventId}/Rounds.json */
export interface Round extends DbObject {
    Name: string;
    RoundNumber: number;
    EventType: string; // see EventType
    RoundType: RoundType | string;
    Valid: boolean;

    PointSummary?: PointSummary;
    TimeSummary?: TimeSummary;

    LapCountAfterRound?: boolean;
    Order: number;
    SheetFormatFilename?: string;
    ScheduledStart?: string; // date string
    GameTypeName?: string;
}

export type RoundsFile = Round[];
