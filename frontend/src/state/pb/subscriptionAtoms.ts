import { atom } from 'jotai';
import { atomFamily } from 'jotai/utils';
import { pbSubscribeCollection } from '../../api/pb.ts';
import {
	PBChannelRecord,
	PBClientKVRecord,
	PBControlStatsRecord,
	PBDetectionRecord,
	PBEventPilotRecord,
	PBGamePointRecord,
	PBIngestTargetRecord,
	PBLapRecord,
	PBPilotChannelRecord,
	PBPilotRecord,
	PBRaceRecord,
	PBRoundRecord,
	PBServerSettingRecord,
} from '../../api/pbTypes.ts';
import { currentEventAtom } from './eventAtoms.ts';

// Pilots as PB records (no longer filtered by event directly)
export const pilotsRecordsAtom = pbSubscribeCollection<PBPilotRecord>('pilots');

// Event-pilot join table
const eventPilotsAtomFamily = atomFamily((eventId: string) =>
	pbSubscribeCollection<PBEventPilotRecord>('event_pilots', {
		filter: `event = "${eventId}"`,
		recordFilter: (record) => record.event === eventId,
		key: `event_pilots-event-${eventId}`,
	})
);

export const eventPilotsAtom = atom((get) => {
	const event = get(currentEventAtom);
	if (!event) return [];
	return get(eventPilotsAtomFamily(event.id));
});

// Pilots filtered by current event (via event_pilots join), excluding removed pilots
export const pilotsAtom = atom((get) => {
	const eventPilots = get(eventPilotsAtom);
	const allPilots = get(pilotsRecordsAtom);

	if (eventPilots.length === 0) return [];

	const pilotIds = new Set(eventPilots.filter((eventPilot) => !eventPilot.removed).map((eventPilot) => eventPilot.pilot));
	return allPilots.filter((pilot) => pilotIds.has(pilot.id));
});

export const pilotIdBySourceIdAtom = atomFamily((pilotSourceId: string) =>
	atom((get): string | null => {
		if (!pilotSourceId) return null;
		const pilots = get(pilotsAtom);
		const match = pilots.find((pilot) => pilot.sourceId === pilotSourceId || pilot.id === pilotSourceId);
		return match?.id ?? null;
	})
);

// Channels as PB records
export const channelRecordsAtom = pbSubscribeCollection<PBChannelRecord>('channels');
export const channelsDataAtom = atom((get) => get(channelRecordsAtom));

const pilotChannelRecordsAtomFamily = atomFamily((eventId: string) =>
	pbSubscribeCollection<PBPilotChannelRecord>('pilotChannels', {
		filter: `event = "${eventId}"`,
		recordFilter: (record) => record.event === eventId,
		key: `pilotChannels-event-${eventId}`,
	})
);

export const pilotChannelRecordsAtom = atom((get) => {
	const event = get(currentEventAtom);
	if (!event) return [];
	return get(pilotChannelRecordsAtomFamily(event.id));
});

const roundRecordsAtomFamily = atomFamily((eventId: string) =>
	pbSubscribeCollection<PBRoundRecord>('rounds', {
		filter: `event = "${eventId}"`,
		recordFilter: (record) => record.event === eventId,
		key: `rounds-event-${eventId}`,
	})
);

export const roundRecordsAtom = atom((get) => {
	const event = get(currentEventAtom);
	if (!event) return [];
	return get(roundRecordsAtomFamily(event.id));
});

export const roundsDataAtom = atom((get) => get(roundRecordsAtom));

// Live records for race and nested collections
const raceRecordsAtomFamily = atomFamily((eventId: string) =>
	pbSubscribeCollection<PBRaceRecord>('races', {
		filter: `event = "${eventId}"`,
		recordFilter: (record) => record.event === eventId,
		key: `races-event-${eventId}`,
	})
);

export const raceRecordsAtom = atom((get) => {
	const event = get(currentEventAtom);
	if (!event) return [];
	return get(raceRecordsAtomFamily(event.id));
});

const clientKVRecordsAtomFamily = atomFamily((eventId: string) =>
	pbSubscribeCollection<PBClientKVRecord>('client_kv', {
		filter: `event = "${eventId}"`,
		recordFilter: (record) => record.event === eventId,
		key: `client_kv-event-${eventId}`,
	})
);

export const clientKVRecordsAtom = atom((get) => {
	const event = get(currentEventAtom);
	if (!event) return [];
	return get(clientKVRecordsAtomFamily(event.id));
});

const lapRecordsAtomFamily = atomFamily((eventId: string) =>
	pbSubscribeCollection<PBLapRecord>('laps', {
		filter: `event = "${eventId}"`,
		recordFilter: (record) => record.event === eventId,
		key: `laps-event-${eventId}`,
	})
);

export const lapRecordsAtom = atom((get) => {
	const event = get(currentEventAtom);
	if (!event) return [];
	return get(lapRecordsAtomFamily(event.id));
});

const detectionRecordsAtomFamily = atomFamily((eventId: string) =>
	pbSubscribeCollection<PBDetectionRecord>('detections', {
		filter: `event = "${eventId}"`,
		recordFilter: (record) => record.event === eventId,
		key: `detections-event-${eventId}`,
	})
);

export const detectionRecordsAtom = atom((get) => {
	const event = get(currentEventAtom);
	if (!event) return [];
	return get(detectionRecordsAtomFamily(event.id));
});

const gamePointRecordsAtomFamily = atomFamily((eventId: string) =>
	pbSubscribeCollection<PBGamePointRecord>('gamePoints', {
		filter: `event = "${eventId}"`,
		recordFilter: (record) => record.event === eventId,
		key: `gamePoints-event-${eventId}`,
	})
);

export const gamePointRecordsAtom = atom((get) => {
	const event = get(currentEventAtom);
	if (!event) return [];
	return get(gamePointRecordsAtomFamily(event.id));
});

// Ingest targets (live subscription)
export const ingestTargetRecordsAtom = pbSubscribeCollection<PBIngestTargetRecord>('ingest_targets');
export const serverSettingsRecordsAtom = pbSubscribeCollection<PBServerSettingRecord>('server_settings');
export const controlStatsRecordsAtom = pbSubscribeCollection<PBControlStatsRecord>('control_stats');

export const DEFAULT_APP_TITLE = 'Drone Dashboard';

export const serverSettingRecordAtom = atomFamily((key: string) =>
	atom((get) => {
		const settings = get(serverSettingsRecordsAtom);
		const record = settings.find((setting) => setting.key === key);
		return record ?? null;
	})
);

export const appTitleAtom = atom((get) => {
	const record = get(serverSettingRecordAtom('ui.title'));
	const raw = record?.value;
	const text = raw == null ? '' : String(raw);
	const trimmed = text.trim();
	return trimmed || DEFAULT_APP_TITLE;
});
