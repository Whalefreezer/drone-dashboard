export interface RaceEvent {
    EventType:                   string;
    Name:                        string;
    Start:                       string;
    End:                         string;
    Laps:                        number;
    PBLaps:                      number;
    RaceLength:                  string;
    MinStartDelay:               string;
    MaxStartDelay:               string;
    PrimaryTimingSystemLocation: string;
    RaceStartIgnoreDetections:   string;
    MinLapTime:                  string;
    LastOpened:                  string;
    PilotChannels:               PilotChannel[];
    RemovedPilots:               string[];
    Rounds:                      string[];
    Club:                        string;
    Channels:                    string[];
    ChannelColors:               string[];
    ChannelDisplayNames:         null[];
    Enabled:                     boolean;
    MultiGPRaceFormat:           string;
    Races:                       string[];
    SyncWithFPVTrackside:        boolean;
    SyncWithMultiGP:             boolean;
    GenerateHeatsMultiGP:        boolean;
    VisibleOnline:               boolean;
    Locked:                      boolean;
    Track:                       string;
    Sectors:                     string[];
    PilotsRegistered:            number;
    ID:                          string;
    ExternalID:                  number;
}


export interface Race {
    Laps:                        Lap[];
    Detections:                  Detection[];
    Start:                       string;
    End:                         string;
    TotalPausedTime:             string;
    PilotChannels:               PilotChannel[];
    RaceNumber:                  number;
    Round:                       string;
    TargetLaps:                  number;
    PrimaryTimingSystemLocation: string;
    Valid:                       boolean;
    AutoAssignNumbers:           boolean;
    Event:                       string;
    Bracket:                     string;
    ID:                          string;
    ExternalID:                  number;
}

export interface Detection {
    TimingSystemIndex: number;
    Channel:           string;
    Time:              string;
    Peak:              number;
    TimingSystemType:  TimingSystemType;
    Pilot:             string;
    LapNumber:         number;
    Valid:             boolean;
    ValidityType:      ValidityType;
    IsLapEnd:          boolean;
    RaceSector:        number;
    IsHoleshot:        boolean;
    ID:                string;
    ExternalID:        number;
}

export enum TimingSystemType {
    LapRF = "LapRF",
}

export enum ValidityType {
    Auto = "Auto",
}

export interface Lap {
    Detection:     string;
    LengthSeconds: number;
    LapNumber:     number;
    StartTime:     string;
    EndTime:       string;
    ID:            string;
    ExternalID:    number;
}

export interface PilotChannel {
    Pilot:      string;
    Channel:    string;
    ID:         string;
    ExternalID: number;
}


export interface Round {
    Name:                string;
    RoundNumber:         number;
    EventType:           EventType;
    RoundType:           RoundType;
    Valid:               boolean;
    PointSummary:        null;
    TimeSummary:         null;
    LapCountAfterRound:  boolean;
    Order:               number;
    SheetFormatFilename: null;
    ID:                  string;
    ExternalID:          number;
}

export enum EventType {
    Race = "Race",
    TimeTrial = "TimeTrial",
}

export enum RoundType {
    Round = "Round",
}

export interface Pilot {
    Name:                     string;
    Phonetic:                 string;
    FirstName:                null;
    LastName:                 null;
    SillyName:                null;
    DiscordID:                null;
    Aircraft:                 null;
    CatchPhrase:              null;
    BestResult:               null;
    TimingSensitivityPercent: number;
    PracticePilot:            boolean;
    PhotoPath:                null;
    ID:                       string;
    ExternalID:               number;
}


export interface Channel {
    Number:        number;
    Band:          string;
    ChannelPrefix: ChannelPrefix;
    Frequency:     number;
    DisplayName:   null;
    ID:            string;
    ExternalID:    number;
    ShortBand:     ShortBand;
}

export enum ChannelPrefix {
    Empty = "\u0000",
    F = "F",
    R = "R",
}

export enum ShortBand {
    A = "A",
    B = "B",
    D = "D",
    E = "E",
    F = "F",
    L = "L",
    R = "R",
    Z = "Z",
}
