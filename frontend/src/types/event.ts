import type {
    DbObject,
    EventType,
    Guid,
    PilotChannel,
    PrimaryTimingSystemLocation,
    Sector,
} from './common.ts';

/** GET /events/{eventId}/Event.json */
export interface RaceEvent extends DbObject {
    EventType: EventType | string;
    Name: string;
    Start: string; // yyyy/MM/dd H:mm:ss.FFF
    End: string; // yyyy/MM/dd H:mm:ss.FFF

    Laps: number;
    PBLaps: number; // Personal-best consecutive laps count
    PackLimit: number;

    RaceLength: string; // TimeSpan formatted as H:MM:SS.fff
    MinStartDelay: string; // TimeSpan
    MaxStartDelay: string; // TimeSpan
    PrimaryTimingSystemLocation: PrimaryTimingSystemLocation | string;
    RaceStartIgnoreDetections: string; // TimeSpan
    MinLapTime: string; // TimeSpan

    LastOpened: string; // yyyy/MM/dd H:mm:ss.FFF

    PilotChannels: PilotChannel[];
    RemovedPilots: Guid[];

    Rounds: Guid[];
    Races: Guid[];

    Club: Guid;

    Channels: Guid[];
    ChannelColors?: string[]; // hex color strings
    ChannelDisplayNames?: string[];

    Enabled: boolean;
    IsGQ?: boolean;
    MultiGPDisabledSlots?: number[];

    SyncWithFPVTrackside?: boolean;
    SyncWithMultiGP?: boolean;
    VisibleOnline?: boolean;
    RulesLocked?: boolean;

    Track?: Guid;
    Sectors?: Sector[];

    PilotsRegistered?: number;
    Flags?: string[]; // date strings
    GameTypeName?: string;
}

// File payload is an array with a single Event
export type EventFile = RaceEvent[];
