#!/usr/bin/env -S deno run --allow-read --allow-write --allow-net
/**
 * PocketBase Snapshot Generator
 *
 * Generates realistic PocketBase snapshot files for stress-testing the drone dashboard
 * with configurable numbers of pilots, races, and other parameters.
 */

import { faker } from '@faker-js/faker';
import { parseArgs } from '@std/cli/parse-args';
import { ensureDir } from '@std/fs';
// Snapshot-specific interfaces that match the actual PocketBase snapshot format
interface SnapshotEvent extends PBBaseRecord {
	name: string;
	eventType: string;
	isCurrent?: boolean;
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
	start?: string;
	end?: string;
	source?: string;
	sourceId?: string;
	collectionId?: string;
	collectionName?: string;
}

interface SnapshotPilot extends PBBaseRecord {
	name: string;
	firstName?: string;
	lastName?: string;
	discordId?: string;
	practicePilot?: boolean;
	event?: string;
	source?: string;
	sourceId?: string;
	collectionId?: string;
	collectionName?: string;
}

interface SnapshotChannel extends PBBaseRecord {
	number?: number;
	band?: string;
	shortBand?: string;
	channelPrefix?: string;
	frequency?: number;
	channelColor?: string;
	displayName?: string;
	channelDisplayName?: string;
	event?: string;
	source?: string;
	sourceId?: string;
	collectionId?: string;
	collectionName?: string;
}

interface SnapshotRound extends PBBaseRecord {
	name?: string;
	order?: number;
	eventType?: string;
	event?: string;
	source?: string;
	sourceId?: string;
	collectionId?: string;
	collectionName?: string;
}

interface SnapshotRace extends PBBaseRecord {
	raceNumber?: number;
	source?: string;
	sourceId?: string;
	valid?: boolean;
	bracket?: string;
	targetLaps?: number;
	raceOrder?: number;
	event?: string;
	round?: string;
	collectionId?: string;
	collectionName?: string;
	laps?: number;
	minStartDelay?: string;
	order?: number;
	pilotCount?: number;
	startTime?: string | null;
	state?: string;
}

interface SnapshotPilotChannel extends PBBaseRecord {
	pilot?: string;
	channel?: string;
	event?: string;
	source?: string;
	sourceId?: string;
	collectionId?: string;
	collectionName?: string;
}

interface SnapshotLap extends PBBaseRecord {
	lap?: number;
	pilot?: string;
	race?: string;
	channel?: string;
	time?: number;
	source?: string;
	sourceId?: string;
	collectionId?: string;
	collectionName?: string;
}

interface SnapshotDetection extends PBBaseRecord {
	pilot?: string;
	race?: string;
	channel?: string;
	lap?: string;
	frequency?: number;
	rssi?: number;
	strength?: number;
	time?: number;
	source?: string;
	sourceId?: string;
	collectionId?: string;
	collectionName?: string;
}

interface SnapshotGamePoint extends PBBaseRecord {
	source?: string;
	sourceId?: string;
	collectionId?: string;
	collectionName?: string;
}

interface SnapshotClientKV extends PBBaseRecord {
	source?: string;
	sourceId?: string;
	collectionId?: string;
	collectionName?: string;
}

interface PBBaseRecord {
	id: string;
}

interface GeneratorOptions {
	pilotCount: number;
	raceCount: number;
	lapsPerRace: number;
	roundCount: number;
	seed?: string;
	outputPath: string;
	includeTelemetry: boolean;
}

interface CollectionsPayload {
	events: SnapshotEvent[];
	pilots: SnapshotPilot[];
	channels: SnapshotChannel[];
	rounds: SnapshotRound[];
	races: SnapshotRace[];
	pilotChannels: SnapshotPilotChannel[];
	laps: SnapshotLap[];
	detections: SnapshotDetection[];
	gamePoints: SnapshotGamePoint[];
	client_kv: SnapshotClientKV[];
}

interface Snapshot {
	version: string;
	snapshotTime: string;
	currentEventId: string;
	collections: CollectionsPayload;
}

// Generate a deterministic ID based on seed and counter
async function generateId(seed: string, counter: number): Promise<string> {
	const encoder = new TextEncoder();
	const data = encoder.encode(`${seed}-${counter}`);
	const hash = await crypto.subtle.digest('SHA-256', data);
	const hashArray = new Uint8Array(hash);
	return btoa(String.fromCharCode(...hashArray)).replace(/[^a-zA-Z0-9]/g, '')
		.toLowerCase().slice(0, 15);
}

// Generate a UUID-like string
function generateUUID(): string {
	const array = new Uint8Array(16);
	crypto.getRandomValues(array);
	array[6] = (array[6] & 0x0f) | 0x40; // Version 4
	array[8] = (array[8] & 0x3f) | 0x80; // Variant 10
	return [...array].map((b, i) => {
		const hex = b.toString(16).padStart(2, '0');
		if (i === 4 || i === 6 || i === 8 || i === 10) return hex + '-';
		return hex;
	}).join('').slice(0, 36);
}

async function generateEvent(
	options: GeneratorOptions,
	seed: string,
): Promise<SnapshotEvent> {
	// Set faker seed for reproducible results if seed is provided
	if (seed) {
		faker.seed(seed.split('').reduce((a, b) => a + b.charCodeAt(0), 0));
	}

	const eventId = await generateId(seed, 0);
	return {
		id: eventId,
		name: faker.company.name() + ' ' +
			faker.company.buzzPhrase().split(' ').slice(0, 2).join(' ') + ' Race',
		eventType: 'Race',
		isCurrent: true,
		laps: options.lapsPerRace,
		pbLaps: 2,
		packLimit: 0,
		raceLength: '00:02:00',
		minStartDelay: '00:00:00.5000000',
		maxStartDelay: '00:00:05',
		primaryTimingSystemLocation: 'Holeshot',
		raceStartIgnoreDetections: '00:00:00.5000000',
		minLapTime: '00:00:05',
		lastOpened: new Date().toISOString().replace('T', ' ').replace(
			/\.\d{3}Z$/,
			'',
		),
		start: new Date().toISOString().split('T')[0] + ' 0:00:00',
		end: '0001/01/01 0:00:00',
		// PocketBase snapshot fields
		collectionId: 'pbc_1687431684',
		collectionName: 'events',
		source: 'fpvtrackside',
		sourceId: generateUUID(),
	};
}

async function generatePilots(
	options: GeneratorOptions,
	eventId: string,
	seed: string,
): Promise<SnapshotPilot[]> {
	// Set faker seed for reproducible results if seed is provided
	if (seed) {
		faker.seed(seed.split('').reduce((a, b) => a + b.charCodeAt(0), 0) + 1000);
	}

	const pilots = [];
	for (let i = 0; i < options.pilotCount; i++) {
		const firstName = faker.person.firstName();
		const lastName = faker.person.lastName();
		const fullName = `${firstName} ${lastName}`;

		pilots.push({
			id: await generateId(seed, 1000 + i),
			name: fullName,
			firstName,
			lastName,
			discordId: faker.datatype.boolean(0.3) ? faker.string.uuid() : undefined, // 30% chance of discord ID
			practicePilot: false,
			event: eventId,
			// PocketBase snapshot fields
			collectionId: 'pbc_2851445954',
			collectionName: 'pilots',
			source: 'fpvtrackside',
			sourceId: generateUUID(),
		});
	}
	return pilots;
}

async function generateChannels(
	options: GeneratorOptions,
	eventId: string,
	seed: string,
): Promise<SnapshotChannel[]> {
	const channels: SnapshotChannel[] = [];
	const frequencies = [
		5658,
		5695,
		5732,
		5769,
		5806,
		5843,
		5880,
		5917,
		5325,
		5362,
		5399,
		5436,
		5473,
		5510,
		5547,
		5584,
	];
	const channelColors = [
		'#FF0000',
		'#00FF00',
		'#0000FF',
		'#FFFF00',
		'#FF00FF',
		'#00FFFF',
		'#FFFFFF',
		'#FFA500',
	];

	for (let i = 0; i < Math.min(options.pilotCount, frequencies.length); i++) {
		const band = i < 8 ? 'R' : 'F';

		channels.push({
			id: await generateId(seed, 2000 + i),
			number: i + 1,
			band,
			shortBand: band,
			frequency: frequencies[i],
			channelColor: channelColors[i % channelColors.length],
			channelPrefix: '\u0000',
			displayName: '',
			channelDisplayName: '',
			event: eventId,
			// PocketBase snapshot fields
			collectionId: 'pbc_3009067695',
			collectionName: 'channels',
			source: 'fpvtrackside',
			sourceId: `000000${
				(i + 1).toString().padStart(2, '0')
			}-0000-0000-0000-000000000000`,
		});
	}
	return channels;
}

async function generateRounds(
	options: GeneratorOptions,
	eventId: string,
	seed: string,
): Promise<SnapshotRound[]> {
	const rounds: SnapshotRound[] = [];
	for (let i = 0; i < options.roundCount; i++) {
		rounds.push({
			id: await generateId(seed, 3000 + i),
			name: `Round ${i + 1}`,
			order: i + 1,
			eventType: 'Race' as const,
			event: eventId,
			// PocketBase snapshot fields
			collectionId: 'pbc_225224730',
			collectionName: 'rounds',
			source: 'fpvtrackside',
			sourceId: generateUUID(),
		});
	}
	return rounds;
}

async function generateRaces(
	options: GeneratorOptions,
	rounds: SnapshotRound[],
	pilots: SnapshotPilot[],
	seed: string,
): Promise<SnapshotRace[]> {
	const races: SnapshotRace[] = [];
	let raceCounter = 0;

	for (const round of rounds) {
		for (let i = 0; i < options.raceCount; i++) {
			races.push({
				id: await generateId(seed, 4000 + raceCounter),
				sourceId: generateUUID(),
				source: 'fpvtrackside',
				raceNumber: raceCounter + 1,
				valid: true,
				bracket: 'Main',
				targetLaps: options.lapsPerRace,
				raceOrder: i + 1,
				event: round.event!,
				round: round.id,
				// PocketBase snapshot fields
				collectionId: 'pbc_2396323229',
				collectionName: 'races',
				laps: options.lapsPerRace,
				minStartDelay: '00:00:00.5000000',
				order: i + 1,
				pilotCount: Math.min(pilots.length, 8), // Typical heat size
				startTime: null,
				state: 'waiting',
			});
			raceCounter++;
		}
	}
	return races;
}

async function generatePilotChannels(
	pilots: SnapshotPilot[],
	channels: SnapshotChannel[],
	seed: string,
): Promise<SnapshotPilotChannel[]> {
	const pilotChannels: SnapshotPilotChannel[] = [];
	let counter = 0;

	for (const pilot of pilots) {
		if (counter < channels.length) {
			pilotChannels.push({
				id: await generateId(seed, 5000 + counter),
				pilot: pilot.id,
				channel: channels[counter].id,
				event: pilot.event,
				// PocketBase snapshot fields
				collectionId: 'pbc_3318446243',
				collectionName: 'pilotChannels',
				source: 'fpvtrackside',
				sourceId: generateUUID(),
			});
			counter++;
		}
	}
	return pilotChannels;
}

async function generateLaps(
	options: GeneratorOptions,
	races: SnapshotRace[],
	pilots: SnapshotPilot[],
	pilotChannels: SnapshotPilotChannel[],
	seed: string,
): Promise<SnapshotLap[]> {
	if (!options.includeTelemetry) return [];

	const laps: SnapshotLap[] = [];
	let lapCounter = 0;

	for (const race of races) {
		// Assign random pilots to this race (up to pilotCount)
		const racePilots = pilots
			.sort(() => Math.random() - 0.5)
			.slice(0, Math.min(race.pilotCount!, pilots.length));

		for (const pilot of racePilots) {
			const pilotChannel = pilotChannels.find((pc) => pc.pilot === pilot.id);
			if (!pilotChannel) continue;

			for (let lapNum = 1; lapNum <= options.lapsPerRace; lapNum++) {
				const baseTime = 2000 + Math.random() * 3000; // 2-5 seconds per lap
				const lapTime = Math.round(baseTime + (lapNum - 1) * 100); // Getting slower each lap

				laps.push({
					id: await generateId(seed, 6000 + lapCounter),
					lap: lapNum,
					race: race.id,
					channel: pilotChannel.channel,
					pilot: pilot.id,
					time: lapTime,
					source: 'fpvtrackside',
					sourceId: generateUUID(),
					collectionId: 'pbc_1167523714',
					collectionName: 'laps',
				});
				lapCounter++;
			}
		}
	}
	return laps;
}

async function generateDetections(
	options: GeneratorOptions,
	laps: SnapshotLap[],
	seed: string,
): Promise<SnapshotDetection[]> {
	if (!options.includeTelemetry) return [];

	const detections: SnapshotDetection[] = [];
	let detectionCounter = 0;

	for (const lap of laps) {
		// Generate 2-4 detections per lap (entry and exit of timing gate)
		const detectionCount = 2 + Math.floor(Math.random() * 3);

		for (let i = 0; i < detectionCount; i++) {
			const offset = i * 50 + Math.random() * 100; // Spread detections over the lap time

			detections.push({
				id: await generateId(seed, 7000 + detectionCounter),
				pilot: lap.pilot,
				race: lap.race,
				channel: lap.channel,
				lap: lap.id,
				frequency: 5658000000 + Math.floor(Math.random() * 1000000), // Around 5.6GHz
				rssi: -30 - Math.floor(Math.random() * 40), // RSSI between -30 and -70
				strength: Math.floor(Math.random() * 100),
				time: Math.floor(offset),
				source: 'fpvtrackside',
				sourceId: generateUUID(),
				collectionId: 'pbc_2875209709',
				collectionName: 'detections',
			});
			detectionCounter++;
		}
	}
	return detections;
}

async function generateSnapshot(options: GeneratorOptions): Promise<Snapshot> {
	const seed = options.seed || Math.random().toString(36).substring(2);
	const event = await generateEvent(options, seed);
	const pilots = await generatePilots(options, event.id, seed);
	const channels = await generateChannels(options, event.id, seed);
	const rounds = await generateRounds(options, event.id, seed);
	const races = await generateRaces(options, rounds, pilots, seed);
	const pilotChannels = await generatePilotChannels(pilots, channels, seed);
	const laps = await generateLaps(options, races, pilots, pilotChannels, seed);
	const detections = await generateDetections(options, laps, seed);

	return {
		version: 'pb-snapshot@v1',
		snapshotTime: new Date().toISOString(),
		currentEventId: event.id,
		collections: {
			events: [event],
			pilots,
			channels,
			rounds,
			races,
			pilotChannels,
			laps,
			detections,
			gamePoints: [],
			client_kv: [],
		},
	};
}

async function main() {
	const args = parseArgs(Deno.args, {
		string: ['pilots', 'races', 'laps', 'rounds', 'seed', 'output'],
		boolean: ['telemetry', 'help'],
		default: {
			pilots: '96',
			races: '3',
			laps: '4',
			rounds: '1',
			telemetry: false,
			output: undefined,
		},
		alias: {
			pilots: 'p',
			races: 'r',
			laps: 'l',
			rounds: 'R',
			seed: 's',
			output: 'o',
			telemetry: 't',
			help: 'h',
		},
	});

	if (args.help) {
		console.log(`
PocketBase Snapshot Generator

Generates realistic PocketBase snapshot files for stress-testing the drone dashboard.

USAGE:
  deno run -A e2e/generate-snapshot.ts [OPTIONS]

OPTIONS:
  -p, --pilots <number>     Number of pilots to generate (default: 96)
  -r, --races <number>      Number of races per round (default: 3)
  -l, --laps <number>       Number of laps per race (default: 4)
  -R, --rounds <number>     Number of rounds (default: 1)
  -s, --seed <string>       Random seed for reproducible generation
  -o, --output <path>       Output file path (default: snapshots/generated-<seed>.json)
  -t, --telemetry           Include lap and detection telemetry data
  -h, --help                Show this help message

EXAMPLES:
  # Generate default 96-pilot snapshot
  deno run -A e2e/generate-snapshot.ts

  # Generate small test snapshot with 12 pilots
  deno run -A e2e/generate-snapshot.ts --pilots 12 --races 1

  # Generate with custom seed for reproducibility
  deno run -A e2e/generate-snapshot.ts --seed abc123
`);
		return;
	}

	const options: GeneratorOptions = {
		pilotCount: parseInt(args.pilots),
		raceCount: parseInt(args.races),
		lapsPerRace: parseInt(args.laps),
		roundCount: parseInt(args.rounds),
		seed: args.seed,
		outputPath: args.output ||
			`snapshots/generated-${args.seed || 'random'}.json`,
		includeTelemetry: args.telemetry,
	};

	console.log(`Generating snapshot with ${options.pilotCount} pilots...`);
	const snapshot = await generateSnapshot(options);

	await ensureDir('snapshots');
	await Deno.writeTextFile(
		options.outputPath,
		JSON.stringify(snapshot, null, 2),
	);

	console.log(`✅ Snapshot generated: ${options.outputPath}`);
	console.log(`   Events: ${snapshot.collections.events.length}`);
	console.log(`   Pilots: ${snapshot.collections.pilots.length}`);
	console.log(`   Channels: ${snapshot.collections.channels.length}`);
	console.log(`   Rounds: ${snapshot.collections.rounds.length}`);
	console.log(`   Races: ${snapshot.collections.races.length}`);
	console.log(
		`   Pilot-Channel assignments: ${snapshot.collections.pilotChannels.length}`,
	);
	if (options.includeTelemetry) {
		console.log(`   Laps: ${snapshot.collections.laps.length}`);
		console.log(`   Detections: ${snapshot.collections.detections.length}`);
	}
}

if (import.meta.main) {
	await main();
}
