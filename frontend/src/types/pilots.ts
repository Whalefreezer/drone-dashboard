import { DbObject } from './common.ts';

export interface Pilot extends DbObject {
    Name: string;
    Phonetic?: string;
    FirstName?: string;
    LastName?: string;
    SillyName?: string;
    DiscordID?: string;
    Aircraft?: string;
    CatchPhrase?: string;
    BestResult?: string;
    TimingSensitivityPercent?: number;
    PracticePilot: boolean;
    PhotoPath?: string;
}

/** GET /events/{eventId}/Pilots.json */
export type PilotsJson = Pilot[];

export type PilotsFile = PilotsJson;
