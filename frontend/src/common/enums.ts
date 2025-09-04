// Shared enums and types for PocketBase-based data structures
// Migrated from legacy types/common.ts

export enum PrimaryTimingSystemLocation {
    EndOfLap = 'EndOfLap',
    Holeshot = 'Holeshot',
}

export enum ValidityType {
    Auto = 'Auto',
    ManualOverride = 'ManualOverride',
    Marshall = 'Marshall',
}

// Additional enums that may be useful in the future
export enum EventType {
    Unknown = 'Unknown',
    Practice = 'Practice',
    TimeTrial = 'TimeTrial',
    Race = 'Race',
    Freestyle = 'Freestyle',
    Endurance = 'Endurance',
    AggregateLaps = 'AggregateLaps',
    CasualPractice = 'CasualPractice',
    Game = 'Game',
}

export enum RoundType {
    Round = 'Round',
    Final = 'Final',
    DoubleElimination = 'DoubleElimination',
}

export enum ChannelPrefix {
    Empty = '\u0000',
    F = 'F',
    R = 'R',
}

export enum ShortBand {
    A = 'A',
    B = 'B',
    D = 'D',
    E = 'E',
    F = 'F',
    L = 'L',
    R = 'R',
    Z = 'Z',
}

// Type aliases
export type Guid = string; // 36-char GUID string
export type JsonDate = string; // yyyy/MM/dd H:mm:ss.FFF
export type TimeSpan = string; // HH:mm:ss.fff
