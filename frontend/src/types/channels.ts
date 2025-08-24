import type { DbObject } from "./common.ts";

export interface Channel extends DbObject {
    Number: number;
    Band: string; // enum name
    ShortBand: string; // single-letter code
    ChannelPrefix: string;
    Frequency: number;
    DisplayName: string;
}

/** GET /httpfiles/Channels.json */
export type ChannelsJson = Channel[];

// alias
export type ChannelsFile = ChannelsJson;
