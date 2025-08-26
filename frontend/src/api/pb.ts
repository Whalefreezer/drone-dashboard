import PocketBase from 'npm:pocketbase';
import type { Channel, Pilot, Race, RaceEvent, Round } from '../types/index.ts';
import { PrimaryTimingSystemLocation, ValidityType } from '../types/common.ts';
import { Atom, atom, WritableAtom } from 'jotai';
import { PBBaseRecord } from './pbTypes.ts';

export const usePB: boolean = String(import.meta.env.VITE_USE_PB || '').toLowerCase() === 'true';
export const usePBRace: boolean =
    String(import.meta.env.VITE_USE_PB_RACE || '').toLowerCase() === 'true';

// Optional override to select event without scraping FPVTrackside
const ENV_EVENT_ID = (import.meta.env.VITE_EVENT_ID || '').trim();

type PBRecord = { id: string; sourceId: string } & Record<string, unknown>;

const pb = new PocketBase('/api');
pb.autoCancellation(false); // TODO(@user): Remove this when we can

export function pbSubscribeByID<T extends PBBaseRecord>(collection: string, id: string): Atom<Promise<T>> {
    const overrideAtom = atom<T | null>(null);
    const anAtom = atom<Promise<T>, [T], void>(
        async (get) => {
            return get(overrideAtom) ?? await pb.collection<T>(collection).getOne(id);
        },
        (get, set, update) => {
            set(overrideAtom, update);
        },
    );

    anAtom.onMount = (set) => {
        console.log(`Subscribing to ${collection}:${id}`);

        const unsubscribePromise = pb.collection<T>(collection).subscribe(id, (e) => {
            console.log(`Subscription event for ${collection}:${id}`, e.action);
            if (e.action === 'create' || e.action === 'update') {
                set(e.record as T);
            } else if (e.action === 'delete') {
                // setAtom(null);
            }
        });

        return () => {
            unsubscribePromise.then((unsub) => unsub());
        };
    };

    return anAtom;
}

export function pbSubscribeCollection<T extends PBBaseRecord>(collection: string): Atom<T[]> {
    const anAtom = atom<T[]>([]);

    anAtom.onMount = (set) => {
        console.log(`Subscribing to ${collection}`);

        const unsubscribePromise = pb.collection<T>(collection).subscribe('*', (e) => {
            console.log(`Subscription event for ${collection}`, e.action);
            set((prev) => {
                const newItems = [...prev];
                if (e.action === 'create' || e.action === 'update') {
                    const existingIndex = prev.findIndex((r) => r.id === e.record.id);
                    if (existingIndex !== -1) {
                        newItems[existingIndex] = e.record;
                    } else {
                        newItems.push(e.record);
                    }
                    return newItems;
                } else if (e.action === 'delete') {
                    return newItems.filter((r) => r.id !== e.record.id);
                }
                return newItems;
            });
        });

        return () => {
            unsubscribePromise.then((unsub) => unsub());
        };
    };

    return anAtom;
}

async function pbList(
    collection: string,
    params: Record<string, string> = {},
): Promise<PBRecord[]> {
    const page = Number(params.page || '1');
    const perPage = Number(params.perPage || '200');
    const filter = params.filter;
    const sort = params.sort;
    const result = await pb.collection(collection).getList(page, perPage, { filter, sort });
    return (result?.items ?? []) as unknown as PBRecord[];
}

async function pbFirst(collection: string, filter?: string): Promise<PBRecord | null> {
    if (!filter) {
        const list = await pb.collection(collection).getList(1, 1);
        return (list.items?.[0] as unknown as PBRecord) ?? null;
    }
    const rec = await pb.collection(collection).getFirstListItem(filter);
    return (rec as unknown as PBRecord) ?? null;
}

async function pbGetById(collection: string, id: string): Promise<PBRecord | null> {
    const rec = await pb.collection(collection).getOne(id);
    return (rec as unknown as PBRecord) ?? null;
}

export async function pbResolveEventPBId(eventId: string): Promise<string | null> {
    const rec = await pbFirst('events', `sourceId = "${eventId}"`);
    return rec?.id ?? null;
}

export async function pbGetCurrentEvent(): Promise<RaceEvent | null> {
    const rec = await pbFirst('events', 'isCurrent = true');
    if (!rec) return null;
    return {
        ID: rec.sourceId,
        EventType: rec.eventType ?? '',
        Name: String(rec.name ?? ''),
        Start: String(rec.start ?? ''),
        End: String(rec.end ?? ''),
    } as RaceEvent;
}

export async function pbFetchEvent(eventId: string): Promise<RaceEvent[]> {
    const event = await pbFirst('events', `sourceId = "${eventId}"`);
    if (!event) return [];
    // Fetch races for this event and map to source GUIDs
    const races = await pbList('races', { filter: `event.id = "${event.id}"` });
    const raceIds: string[] = races.map((r) => r.sourceId);
    // Minimal Event shape to satisfy current UI usage
    const e: RaceEvent = {
        ID: event.sourceId,
        EventType: String(event.eventType ?? ''),
        Name: String(event.name ?? ''),
        Start: String(event.start ?? ''),
        End: String(event.end ?? ''),
        Laps: Number(event.laps ?? 0),
        PBLaps: Number(event.pbLaps ?? 3),
        PackLimit: Number(event.packLimit ?? 0),
        RaceLength: String(event.raceLength ?? ''),
        MinStartDelay: String(event.minStartDelay ?? ''),
        MaxStartDelay: String(event.maxStartDelay ?? ''),
        PrimaryTimingSystemLocation: String(event.primaryTimingSystemLocation ?? ''),
        RaceStartIgnoreDetections: String(event.raceStartIgnoreDetections ?? ''),
        MinLapTime: String(event.minLapTime ?? ''),
        LastOpened: String(event.lastOpened ?? ''),
        PilotChannels: [],
        RemovedPilots: [],
        Rounds: [],
        Races: raceIds,
        Club: '',
        Channels: [],
        Enabled: true,
        VisibleOnline: true,
    } as RaceEvent;
    return [e];
}

export interface PBRaceEvent extends PBRecord {
    isCurrent: boolean;
    sourceId: string;
    eventType: string;
    name: string;
    start: string;
    end: string;
    laps: number;
    pbLaps: number;
    packLimit: number;
    raceLength: string;
    minStartDelay: string;
    maxStartDelay: string;
    primaryTimingSystemLocation: string;
    raceStartIgnoreDetections: string;
    minLapTime: string;
    lastOpened: string;
    pilotChannels: string[];
    removedPilots: string[];
    rounds: string[];
    club: string;
    channels: string[];
    enabled: boolean;
    visibleOnline: boolean;
}

export async function pbFetchRounds(eventId: string): Promise<Round[]> {
    const eventPBId = await pbResolveEventPBId(eventId);
    if (!eventPBId) return [];
    const rounds = await pbList('rounds', { filter: `event.id = "${eventPBId}"`, sort: 'order' });
    return rounds.map((r) => ({
        ID: r.sourceId,
        Name: String(r.name ?? ''),
        RoundNumber: Number(r.roundNumber ?? 0),
        EventType: String(r.eventType ?? ''),
        RoundType: String(r.roundType ?? ''),
        Valid: Boolean(r.valid),
        Order: Number(r.order ?? 0),
    }));
}

export async function pbFetchChannels(): Promise<Channel[]> {
    const items = await pbList('channels');
    return items.map((c) => ({
        ID: c.sourceId,
        Number: Number(c.number ?? 0),
        Band: String(c.band ?? ''),
        ShortBand: String(c.shortBand ?? ''),
        ChannelPrefix: String(c.channelPrefix ?? ''),
        Frequency: Number(c.frequency ?? 0),
        DisplayName: String(c.displayName ?? ''),
    }));
}

export async function pbFetchPilots(_eventId: string): Promise<Pilot[]> {
    // For now return all pilots; later we can scope by event via pilotChannels
    const items = await pbList('pilots');
    return items.map((p) => ({
        ID: p.sourceId,
        Name: String(p.name ?? ''),
        FirstName: p.firstName,
        LastName: p.lastName,
        DiscordID: p.discordId,
        PracticePilot: Boolean(p.practicePilot),
        PhotoPath: p.photoPath,
    } as Pilot));
}

export async function pbFetchRace(eventId: string, raceId: string): Promise<Race[]> {
    // Find the race record by sourceId
    const raceRec = await pbFirst('races', `sourceId = "${raceId}"`);
    if (!raceRec) return [];
    const racePBId = raceRec.id;
    // Resolve Round and Event GUIDs from relations
    let roundGuid = '';
    if (raceRec.round) {
        const roundRec = await pbGetById('rounds', String(raceRec.round));
        roundGuid = roundRec?.sourceId ?? '';
    }
    let eventGuid = '';
    if (raceRec.event) {
        const eventRec = await pbGetById('events', String(raceRec.event));
        eventGuid = eventRec?.sourceId ?? '';
    }
    // Fetch nested collections by race relation
    const [laps, detections, gamePoints] = await Promise.all([
        pbList('laps', { filter: `race.id = "${racePBId}"` }),
        pbList('detections', { filter: `race.id = "${racePBId}"` }),
        pbList('gamePoints', { filter: `race.id = "${racePBId}"` }),
    ]);

    const r: Race = {
        ID: raceRec.sourceId,
        Laps: laps.map((l) => ({
            ID: l.sourceId,
            Detection: String(l.detection ?? ''),
            LengthSeconds: Number(l.lengthSeconds ?? 0),
            LapNumber: Number(l.lapNumber ?? 0),
            StartTime: String(l.startTime ?? ''),
            EndTime: String(l.endTime ?? ''),
        })),
        Detections: detections.map((d) => ({
            ID: d.sourceId,
            TimingSystemIndex: Number(d.timingSystemIndex ?? 0),
            Channel: String(d.channel ?? ''),
            Time: String(d.time ?? ''),
            Peak: Number(d.peak ?? 0),
            TimingSystemType: String(d.timingSystemType ?? ''),
            Pilot: String(d.pilot ?? ''),
            LapNumber: Number(d.lapNumber ?? 0),
            Valid: Boolean(d.valid),
            ValidityType: toValidityType(d.validityType),
            IsLapEnd: Boolean(d.isLapEnd),
            RaceSector: Number(d.raceSector ?? 0),
            IsHoleshot: Boolean(d.isHoleshot),
        })),
        GamePoints: gamePoints.map((g) => ({
            ID: g.sourceId,
            Channel: String(g.channel ?? ''),
            Pilot: String(g.pilot ?? ''),
            Valid: Boolean(g.valid),
            Time: String(g.time ?? ''),
        })),
        Start: String(raceRec.start ?? ''),
        End: String(raceRec.end ?? ''),
        TotalPausedTime: String(raceRec.totalPausedTime ?? ''),
        PilotChannels: [],
        RaceNumber: Number(raceRec.raceNumber ?? 0),
        Round: roundGuid,
        TargetLaps: Number(raceRec.targetLaps ?? 0),
        PrimaryTimingSystemLocation: toPTSL(raceRec.primaryTimingSystemLocation),
        Valid: Boolean(raceRec.valid),
        AutoAssignNumbers: undefined,
        Event: eventGuid,
        Bracket: String(raceRec.bracket ?? ''),
    };

    return [r];
}

function toValidityType(v: unknown): ValidityType {
    switch (String(v)) {
        case ValidityType.Auto:
            return ValidityType.Auto;
        case ValidityType.ManualOverride:
            return ValidityType.ManualOverride;
        case ValidityType.Marshall:
            return ValidityType.Marshall;
        default:
            return ValidityType.Auto;
    }
}

function toPTSL(v: unknown): PrimaryTimingSystemLocation {
    switch (String(v)) {
        case PrimaryTimingSystemLocation.Holeshot:
            return PrimaryTimingSystemLocation.Holeshot;
        case PrimaryTimingSystemLocation.EndOfLap:
        default:
            return PrimaryTimingSystemLocation.EndOfLap;
    }
}

export function getEnvEventIdFallback(): string | null {
    return ENV_EVENT_ID || null;
}

// Export the new subscription functions with Suspense support
export {
    pbSubscribeRecord,
    pbSubscribeRecords,
    pbSubscribeWithSuspense,
} from './pbSubscription.ts';
