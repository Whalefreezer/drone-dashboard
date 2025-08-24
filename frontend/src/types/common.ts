// Shared JSON shapes used by browser endpoints

export type Guid = string; // 36-char GUID string

export interface DbObject {
    ID: Guid;
    ExternalID?: number;
}

export type JsonDate = string; // yyyy/MM/dd H:mm:ss.FFF

export type TimeSpan = string; // HH:mm:ss.fff

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

export enum PrimaryTimingSystemLocation {
    EndOfLap = 'EndOfLap',
    Holeshot = 'Holeshot',
}

export interface Sector {
    TrackElementStartIndex: number;
    TrackElementEndIndex: number;
    Length: number;
    // Color and Number are not serialized as friendly values; omit color
    Number?: number;
    CalculateSpeed: boolean;
}

export interface TrackElementDef {
    ElementType: string; // RaceLib.TrackElement.ElementTypes (string)
    X: number;
    Y: number;
    Z: number;
    Tilt: number;
    Scale: number;
    Rotation: number;
    Visible: boolean;
    Decorative: boolean;
    SplitEnd: boolean;
}

export interface Track extends DbObject {
    Name: string;
    Length: number;
    GridSize: number;
    TrackElements: TrackElementDef[];
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

export interface PilotChannel extends DbObject {
    Pilot: Guid;
    Channel: Guid;
}

export interface Detection extends DbObject {
    TimingSystemIndex: number;
    Channel: Guid;
    Time: JsonDate;
    Peak: number;
    TimingSystemType: string;
    Pilot: Guid;
    LapNumber: number;
    Valid: boolean;
    ValidityType: ValidityType;
    IsLapEnd: boolean;
    RaceSector: number;
    IsHoleshot: boolean;
}

export enum ValidityType {
    Auto = 'Auto',
    ManualOverride = 'ManualOverride',
    Marshall = 'Marshall',
}

export interface Lap extends DbObject {
    Detection: Guid;
    LengthSeconds: number;
    LapNumber: number;
    StartTime: JsonDate;
    EndTime: JsonDate;
}

export interface GamePoint extends DbObject {
    Channel: Guid;
    Pilot: Guid;
    Valid: boolean;
    Time: JsonDate;
}
