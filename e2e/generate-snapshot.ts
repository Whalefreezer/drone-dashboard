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
	events: any[];
	pilots: any[];
	channels: any[];
	rounds: any[];
	races: any[];
	pilotChannels: any[];
	laps: any[];
	detections: any[];
	gamePoints: any[];
	client_kv: any[];
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
): Promise<any> {
	// Set faker seed for reproducible results if seed is provided
	if (seed) {
		faker.seed(seed.split('').reduce((a, b) => a + b.charCodeAt(0), 0));
	}

	const eventId = await generateId(seed, 0);
	return {
		collectionId: 'pbc_1687431684',
		collectionName: 'events',
		end: '0001/01/01 0:00:00',
		eventType: 'Race',
		id: eventId,
		isCurrent: true,
		laps: options.lapsPerRace,
		lastOpened: new Date().toISOString().replace('T', ' ').replace(
			/\.\d{3}Z$/,
			'',
		),
		maxStartDelay: '00:00:05',
		minLapTime: '00:00:05',
		minStartDelay: '00:00:00.5000000',
		name: faker.company.name() + ' ' +
			faker.company.buzzPhrase().split(' ').slice(0, 2).join(' ') + ' Race',
		packLimit: 0,
		pbLaps: 2,
		primaryTimingSystemLocation: 'Holeshot',
		raceLength: '00:02:00',
		raceStartIgnoreDetections: '00:00:00.5000000',
		source: 'fpvtrackside',
		sourceId: generateUUID(),
		start: new Date().toISOString().split('T')[0] + ' 0:00:00',
	};
}

async function generatePilots(
	options: GeneratorOptions,
	eventId: string,
	seed: string,
): Promise<any[]> {
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
			collectionId: 'pbc_2851445954',
			collectionName: 'pilots',
			discordId: faker.datatype.boolean(0.3) ? faker.string.uuid() : '', // 30% chance of discord ID
			event: eventId,
			firstName,
			id: await generateId(seed, 1000 + i),
			lastName,
			name: fullName,
			practicePilot: false,
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
): Promise<any[]> {
	const channels = [];
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
	const bands = ['R', 'F'];
	const shortBands = ['R', 'F'];
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
		const shortBand = band;
		const channelColor = channelColors[i % channelColors.length];

		channels.push({
			collectionId: 'pbc_3009067695',
			collectionName: 'channels',
			band,
			channelColor,
			channelDisplayName: '',
			channelPrefix: '\u0000',
			displayName: '',
			event: eventId,
			frequency: frequencies[i],
			id: await generateId(seed, 2000 + i),
			number: i + 1,
			shortBand,
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
): Promise<any[]> {
	const rounds = [];
	for (let i = 0; i < options.roundCount; i++) {
		rounds.push({
			collectionId: 'pbc_225224730',
			collectionName: 'rounds',
			event: eventId,
			eventType: 'Race',
			id: await generateId(seed, 3000 + i),
			name: `Round ${i + 1}`,
			order: i + 1,
			source: 'fpvtrackside',
			sourceId: generateUUID(),
		});
	}
	return rounds;
}

async function generateRaces(
	options: GeneratorOptions,
	rounds: any[],
	pilots: any[],
	seed: string,
): Promise<any[]> {
	const races = [];
	let raceCounter = 0;

	for (const round of rounds) {
		for (let i = 0; i < options.raceCount; i++) {
			races.push({
				collectionId: 'pbc_2396323229',
				collectionName: 'races',
				event: round.event,
				id: await generateId(seed, 4000 + raceCounter),
				laps: options.lapsPerRace,
				minStartDelay: '00:00:00.5000000',
				order: i + 1,
				pilotCount: Math.min(pilots.length, 8), // Typical heat size
				round: round.id,
				source: 'fpvtrackside',
				sourceId: generateUUID(),
				startTime: null,
				state: 'waiting',
			});
			raceCounter++;
		}
	}
	return races;
}

async function generatePilotChannels(
	pilots: any[],
	channels: any[],
	seed: string,
): Promise<any[]> {
	const pilotChannels = [];
	let counter = 0;

	for (const pilot of pilots) {
		if (counter < channels.length) {
			pilotChannels.push({
				collectionId: 'pbc_3318446243',
				collectionName: 'pilotChannels',
				channel: channels[counter].id,
				id: await generateId(seed, 5000 + counter),
				pilot: pilot.id,
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
	races: any[],
	pilots: any[],
	pilotChannels: any[],
	seed: string,
): Promise<any[]> {
	if (!options.includeTelemetry) return [];

	const laps = [];
	let lapCounter = 0;

	for (const race of races) {
		// Assign random pilots to this race (up to pilotCount)
		const racePilots = pilots
			.sort(() => Math.random() - 0.5)
			.slice(0, Math.min(race.pilotCount, pilots.length));

		for (const pilot of racePilots) {
			const pilotChannel = pilotChannels.find((pc) => pc.pilot === pilot.id);
			if (!pilotChannel) continue;

			for (let lapNum = 1; lapNum <= options.lapsPerRace; lapNum++) {
				const baseTime = 2000 + Math.random() * 3000; // 2-5 seconds per lap
				const lapTime = Math.round(baseTime + (lapNum - 1) * 100); // Getting slower each lap

				laps.push({
					collectionId: 'pbc_1167523714',
					collectionName: 'laps',
					channel: pilotChannel.channel,
					id: await generateId(seed, 6000 + lapCounter),
					lap: lapNum,
					pilot: pilot.id,
					race: race.id,
					source: 'fpvtrackside',
					sourceId: generateUUID(),
					time: lapTime,
				});
				lapCounter++;
			}
		}
	}
	return laps;
}

async function generateDetections(
	options: GeneratorOptions,
	laps: any[],
	seed: string,
): Promise<any[]> {
	if (!options.includeTelemetry) return [];

	const detections = [];
	let detectionCounter = 0;

	for (const lap of laps) {
		// Generate 2-4 detections per lap (entry and exit of timing gate)
		const detectionCount = 2 + Math.floor(Math.random() * 3);

		for (let i = 0; i < detectionCount; i++) {
			const offset = i * 50 + Math.random() * 100; // Spread detections over the lap time

			detections.push({
				collectionId: 'pbc_2875209709',
				collectionName: 'detections',
				channel: lap.channel,
				frequency: 5658000000 + Math.floor(Math.random() * 1000000), // Around 5.6GHz
				id: await generateId(seed, 7000 + detectionCounter),
				lap: lap.id,
				pilot: lap.pilot,
				race: lap.race,
				rssi: -30 - Math.floor(Math.random() * 40), // RSSI between -30 and -70
				source: 'fpvtrackside',
				sourceId: generateUUID(),
				strength: Math.floor(Math.random() * 100),
				time: Math.floor(offset),
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
