// PocketBase collection record types inferred from backend/migrations/1700000000_init_collections.go
// These mirror the fields created in the initial migration to aid type‑safe PB usage on the frontend.

// Common base for PocketBase records (frontend only needs PB id)
export interface PBBaseRecord {
	id: string;
}

// events
export interface PBEventRecord extends PBBaseRecord {
	name: string;
	eventType?: EventType;
	start?: string;
	end?: string;
	laps?: number;
	pbLaps?: number;
	packLimit?: number;
	raceLength?: string;
	minStartDelay?: string;
	maxStartDelay?: string;
	primaryTimingSystemLocation?: string;
	raceStartIgnoreDetections?: string;
	minLapTime?: string;
	lastOpened?: string;
	isCurrent?: boolean;
}

// rounds
export interface PBRoundRecord extends PBBaseRecord {
	name?: string;
	roundNumber?: number;
	eventType?: EventType;
	roundType?: string;
	valid?: boolean;
	order?: number;
	event?: string; // relation → events.id
}

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

// pilots
export interface PBPilotRecord extends PBBaseRecord {
	name: string;
	firstName?: string;
	lastName?: string;
	discordId?: string;
	practicePilot?: boolean;
	event?: string; // relation → events.id
}

// channels
export interface PBChannelRecord extends PBBaseRecord {
	number?: number;
	band?: string;
	shortBand?: string;
	channelPrefix?: string;
	frequency?: number;
	displayName?: string;
	channelColor?: string;
	channelDisplayName?: string;
	event?: string; // relation → events.id
}

// tracks
export interface PBTrackRecord extends PBBaseRecord {
	name?: string;
	length?: number;
	gridSize?: number;
	event?: string; // relation → events.id
}

// races
export interface PBRaceRecord extends PBBaseRecord {
	sourceId: string;
	source: string;
	raceNumber: number;
	start?: string;
	end?: string;
	totalPausedTime?: string;
	primaryTimingSystemLocation?: string;
	valid: boolean;
	bracket: string;
	targetLaps: number;
	raceOrder: number;
	event: string; // relation → events.id
	round: string; // relation → rounds.id
}

// client_kv (generic client-facing state)
export interface PBClientKVRecord extends PBBaseRecord {
	namespace: string;
	key: string;
	value?: string; // JSON payload
	event?: string; // relation → events.id
	expiresAt?: number;
}

// pilotChannels
export interface PBPilotChannelRecord extends PBBaseRecord {
	pilot?: string; // relation → pilots.id
	channel?: string; // relation → channels.id
	race?: string; // relation → races.id
	event?: string; // relation → events.id (context)
}

// detections
export interface PBDetectionRecord extends PBBaseRecord {
	timingSystemIndex?: number;
	time?: string;
	peak?: number;
	timingSystemType?: string;
	lapNumber?: number;
	valid?: boolean;
	validityType?: string;
	isLapEnd?: boolean;
	raceSector?: number;
	isHoleshot?: boolean;
	pilot?: string; // relation → pilots.id
	race?: string; // relation → races.id
	channel?: string; // relation → channels.id
	event?: string; // relation → events.id
}

// laps
export interface PBLapRecord extends PBBaseRecord {
	lapNumber?: number;
	lengthSeconds?: number;
	startTime?: string;
	endTime?: string;
	detection: string; // relation → detections.id
	race?: string; // relation → races.id
	event?: string; // relation → events.id
}

// gamePoints
export interface PBGamePointRecord extends PBBaseRecord {
	valid?: boolean;
	time?: string;
	pilot?: string; // relation → pilots.id
	race?: string; // relation → races.id
	channel?: string; // relation → channels.id
	event?: string; // relation → events.id
}

// results
export interface PBResultRecord extends PBBaseRecord {
	points?: number;
	position?: number;
	valid?: boolean;
	dnf?: boolean;
	resultType?: string;
	event?: string; // relation → events.id
	race?: string; // relation → races.id
	pilot?: string; // relation → pilots.id
}

// server_settings (generic key/value)
export interface PBServerSettingRecord extends PBBaseRecord {
	key: string;
	value?: string;
}

// Convenience union for any PB record our API deals with
export type AnyPBRecord =
	| PBEventRecord
	| PBRoundRecord
	| PBPilotRecord
	| PBChannelRecord
	| PBTrackRecord
	| PBRaceRecord
	| PBPilotChannelRecord
	| PBDetectionRecord
	| PBLapRecord
	| PBGamePointRecord
	| PBResultRecord;

// ingest_targets (stream/ingest endpoints configured on backend)
// Keep fields open-ended since backend may add properties; we render as-is.
export interface PBIngestTargetRecord extends PBBaseRecord {
	type: string; // kind of ingest, e.g., 'fpvtrackside', 'webhook'
	sourceId: string; // unique source identifier
	event?: string; // relation → events.id
	intervalMs?: number; // poll cadence in milliseconds
	nextDueAt?: number; // epoch millis for next scheduled run
	priority?: number; // scheduler priority
	enabled?: boolean; // whether scheduler should run this target
	lastFetchedAt?: number; // epoch millis of last successful fetch
	lastStatus?: string; // short status message from last run
}
