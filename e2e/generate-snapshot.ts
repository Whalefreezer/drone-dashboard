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
import { EventType } from '../frontend/src/api/pbTypes.ts';
import type {
	PBChannelRecord,
	PBClientKVRecord,
	PBDetectionRecord,
	PBEventRecord,
	PBGamePointRecord,
	PBLapRecord,
	PBPilotChannelRecord,
	PBPilotRecord,
	PBRaceRecord,
	PBRoundRecord,
} from '../frontend/src/api/pbTypes.ts';
// PocketBase internal fields that appear in snapshots but not in frontend API types
interface PBInternalFields {
	collectionId: string;
	collectionName: string;
	source: string;
	sourceId: string;
}

// Collection ID mappings for PocketBase collections
const COLLECTION_IDS = {
	events: 'pbc_1687431684',
	pilots: 'pbc_2851445954',
	channels: 'pbc_3009067695',
	rounds: 'pbc_225224730',
	races: 'pbc_2396323229',
	pilotChannels: 'pbc_3318446243',
	laps: 'pbc_1167523714',
	detections: 'pbc_2875209709',
} as const;

type SnapshotEvent = PBEventRecord & PBInternalFields;
type SnapshotPilot = PBPilotRecord & PBInternalFields;
type SnapshotChannel = PBChannelRecord & PBInternalFields;
type SnapshotRound = PBRoundRecord & PBInternalFields;
type SnapshotRace = PBRaceRecord & PBInternalFields;
type SnapshotPilotChannel = PBPilotChannelRecord & PBInternalFields;
type SnapshotLap = PBLapRecord & PBInternalFields;
type SnapshotDetection = PBDetectionRecord & PBInternalFields;
type SnapshotGamePoint = PBGamePointRecord & PBInternalFields;
type SnapshotClientKV = PBClientKVRecord & PBInternalFields;

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
		eventType: EventType.Race,
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
		lastOpened: '2025-09-23 12:00:00', // Fixed timestamp for deterministic output
		start: '2025-09-23 12:00:00', // Fixed timestamp for deterministic output
		end: '0001/01/01 0:00:00',
		// PocketBase snapshot fields
		collectionId: COLLECTION_IDS.events,
		collectionName: 'events',
		source: 'fpvtrackside',
		sourceId: await generateId(seed, 10000), // Use seeded ID for events
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
		let name: string;
		const firstName = faker.person.firstName();
		const lastName = faker.person.lastName();

		// Use callsign if available, otherwise use generated full name
		if (i < callsigns.length) {
			name = callsigns[i];
		} else {
			name = `${firstName} ${lastName}`;
		}

		pilots.push({
			id: await generateId(seed, 1000 + i),
			name,
			firstName,
			lastName,
			discordId: faker.datatype.boolean(0.3) ? faker.string.uuid() : undefined, // 30% chance of discord ID
			practicePilot: false,
			event: eventId,
			// PocketBase snapshot fields
			collectionId: COLLECTION_IDS.pilots,
			collectionName: 'pilots',
			source: 'fpvtrackside',
			sourceId: await generateId(seed, 1000 + i), // Use seeded ID for pilots
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

	// Only use specific channels: R1, R2, F2, F4, R7, R8
	const channelConfigs = [
		{ number: 1, band: 'R', frequency: 5658 },
		{ number: 2, band: 'R', frequency: 5695 },
		{ number: 2, band: 'F', frequency: 5362 }, // F2
		{ number: 4, band: 'F', frequency: 5436 }, // F4
		{ number: 7, band: 'R', frequency: 5880 },
		{ number: 8, band: 'R', frequency: 5917 },
	];

	const channelColors = [
		'#FF0000',
		'#00FF00',
		'#0000FF',
		'#FFFF00',
		'#FF00FF',
		'#00FFFF',
	];

	const maxChannels = Math.min(options.pilotCount, channelConfigs.length);

	for (let i = 0; i < maxChannels; i++) {
		const config = channelConfigs[i];

		channels.push({
			id: await generateId(seed, 2000 + i),
			number: config.number,
			band: config.band,
			shortBand: config.band,
			frequency: config.frequency,
			channelColor: channelColors[i % channelColors.length],
			channelPrefix: '\u0000',
			displayName: '',
			channelDisplayName: '',
			event: eventId,
			// PocketBase snapshot fields
			collectionId: COLLECTION_IDS.channels,
			collectionName: 'channels',
			source: 'fpvtrackside',
			sourceId: await generateId(seed, 2000 + i), // Use seeded ID for channels
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
			eventType: EventType.Race,
			event: eventId,
			// PocketBase snapshot fields
			collectionId: COLLECTION_IDS.rounds,
			collectionName: 'rounds',
			source: 'fpvtrackside',
			sourceId: await generateId(seed, 3000 + i), // Use seeded ID for rounds
		});
	}
	return rounds;
}

async function generateRaces(
	options: GeneratorOptions,
	rounds: SnapshotRound[],
	_pilots: SnapshotPilot[],
	seed: string,
): Promise<SnapshotRace[]> {
	const races: SnapshotRace[] = [];
	let raceCounter = 0;

	for (const round of rounds) {
		for (let i = 0; i < options.raceCount; i++) {
			races.push({
				id: await generateId(seed, 4000 + raceCounter),
				sourceId: await generateId(seed, 4000 + raceCounter), // Use seeded ID for races
				source: 'fpvtrackside',
				raceNumber: raceCounter + 1,
				valid: true,
				bracket: 'Main',
				targetLaps: options.lapsPerRace,
				raceOrder: i + 1,
				event: round.event!,
				round: round.id,
				// PocketBase snapshot fields
				collectionId: COLLECTION_IDS.races,
				collectionName: 'races',
			});
			raceCounter++;
		}
	}
	return races;
}

async function generatePilotChannels(
	pilots: SnapshotPilot[],
	channels: SnapshotChannel[],
	races: SnapshotRace[],
	seed: string,
): Promise<SnapshotPilotChannel[]> {
	const pilotChannels: SnapshotPilotChannel[] = [];

	// Distribute pilots across races, max 6 pilots per race
	const pilotsPerRace = 6;
	const totalPilots = Math.min(
		pilots.length,
		races.length * pilotsPerRace,
	);

	// Shuffle pilots for fair distribution (seeded)
	const shuffledPilots = [...pilots].sort((a, b) => {
		const hashA = seed + a.id;
		const hashB = seed + b.id;
		const randomA = seededRandom(hashA, 0);
		const randomB = seededRandom(hashB, 0);
		return randomA - randomB;
	}).slice(0, totalPilots);

	let pilotIndex = 0;

	for (const race of races) {
		const racePilots = [];
		const pilotsForThisRace = Math.min(
			pilotsPerRace,
			shuffledPilots.length - pilotIndex,
		);

		for (let i = 0; i < pilotsForThisRace; i++) {
			const pilot = shuffledPilots[pilotIndex++];
			const channelIndex = (pilotIndex - 1) % channels.length; // Cycle through available channels

			pilotChannels.push({
				id: await generateId(seed, 5000 + pilotIndex - 1),
				pilot: pilot.id,
				channel: channels[channelIndex].id,
				race: race.id, // Set raceId to define which race this pilot-channel belongs to
				event: race.event,
				// PocketBase snapshot fields
				collectionId: COLLECTION_IDS.pilotChannels,
				collectionName: 'pilotChannels',
				source: 'fpvtrackside',
				sourceId: await generateId(seed, 5000 + pilotIndex - 1), // Use seeded ID for pilotChannels
			});

			racePilots.push(pilot);
		}

		// If we've assigned all available pilots, stop assigning to more races
		if (pilotIndex >= shuffledPilots.length) {
			break;
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
): Promise<{ laps: SnapshotLap[]; detections: SnapshotDetection[] }> {
	const laps: SnapshotLap[] = [];
	const detections: SnapshotDetection[] = [];

	if (!options.includeTelemetry) {
		return { laps, detections };
	}

	let lapCounter = 0;
	let detectionCounter = 0;

	for (const race of races) {
		// Get pilots assigned to this race via pilotChannels
		const racePilotChannels = pilotChannels.filter((pc) => pc.race === race.id);
		const racePilots = racePilotChannels.map((pc) =>
			pilots.find((p) => p.id === pc.pilot)
		).filter((p) => p !== undefined);

		for (const pilot of racePilots) {
			const pilotChannel = pilotChannels.find((pc) => pc.pilot === pilot.id);
			if (!pilotChannel || !pilotChannel.channel) continue;

			// Reset race timing for each pilot
			let pilotRaceTimeMs = 0;

			for (let lapNum = 1; lapNum <= options.lapsPerRace; lapNum++) {
				let lapEndDetectionId: string | undefined;
				let lapStartTime: string | undefined;
				let lapEndTime: string | undefined;
				let lapLengthSeconds: number | undefined;

				// Generate detections for this lap first
				if (options.includeTelemetry) {
					const lapDetections = await generateDetectionsForLap(
						await generateId(seed, 6000 + lapCounter), // lapId
						pilot.id,
						pilotChannel.channel,
						race.id,
						race.event!,
						lapNum,
						seed,
						detectionCounter,
						pilotRaceTimeMs, // Pass current race time for this pilot
					);
					detections.push(...lapDetections);
					detectionCounter += lapDetections.length;

					// Calculate lap timing from detections
					if (lapDetections.length > 0) {
						const sortedDetections = lapDetections.sort((a, b) =>
							parseInt(a.time!) - parseInt(b.time!)
						);
						const firstDetection = sortedDetections[0];
						const lastDetection = sortedDetections[sortedDetections.length - 1];

						lapStartTime = firstDetection.time;
						lapEndTime = lastDetection.time;

						if (lapStartTime && lapEndTime) {
							const startMs = parseInt(lapStartTime);
							const endMs = parseInt(lapEndTime);
							lapLengthSeconds = Math.max((endMs - startMs) / 1000, 0.001); // Minimum 1ms duration
							// Update pilot's race time for next lap
							pilotRaceTimeMs = endMs;
						}

						// Find the lap end detection (isLapEnd: true)
						const lapEndDetection = lapDetections.find((d) => d.isLapEnd);
						if (lapEndDetection) {
							lapEndDetectionId = lapEndDetection.id;
						} else {
							// Fallback: use the last detection
							lapEndDetectionId = lastDetection.id;
						}
					}
				}

				const lapId = await generateId(seed, 6000 + lapCounter);
				laps.push({
					id: lapId,
					lapNumber: lapNum,
					detection: lapEndDetectionId ||
						await generateId(seed, 8000 + lapCounter), // Use real detection ID or fallback
					lengthSeconds: lapLengthSeconds,
					startTime: lapStartTime,
					endTime: lapEndTime,
					race: race.id,
					event: race.event,
					source: 'fpvtrackside',
					sourceId: await generateId(seed, 6000 + lapCounter), // Use seeded ID for laps
					collectionId: COLLECTION_IDS.laps,
					collectionName: 'laps',
				});

				lapCounter++;
			}
		}
	}
	return { laps, detections };
}

// Simple seeded random number generator with better entropy
function seededRandom(seed: string, index: number): number {
	const hash = seed + '-' + index;
	let h = 5381; // DJB2 hash start value
	for (let i = 0; i < hash.length; i++) {
		const char = hash.charCodeAt(i);
		h = ((h << 5) + h) + char; // DJB2 hash formula: h = ((h << 5) + h) + char
		h = h & 0xFFFFFFFF; // Keep as 32-bit
	}
	// Convert to 0-1 range, ensure positive
	return (h % 1000000) / 1000000;
}

async function generateDetectionsForLap(
	_lapId: string,
	pilotId: string,
	channelId: string,
	raceId: string,
	eventId: string,
	lapNumber: number,
	seed: string,
	detectionCounter: number,
	raceStartTimeMs: number,
): Promise<SnapshotDetection[]> {
	const detections: SnapshotDetection[] = [];

	// Generate deterministic detection count (2-4) based on seed
	const detectionCount = Math.max(
		2,
		2 +
			Math.floor(
				seededRandom(`${seed}-detections-${pilotId}-${lapNumber}`, 0) * 3,
			),
	);

	// Generate deterministic lap time (20-90 seconds) based on seed for more variation
	// Add more entropy by including raceId and detectionCounter for uniqueness
	const lapDurationMs = Math.max(
		5000,
		20000 +
			seededRandom(
					`${seed}-lap-duration-${pilotId}-${raceId}-${lapNumber}-${detectionCounter}`,
					0,
				) * 70000,
	); // Ensure minimum 5 seconds

	for (let i = 0; i < detectionCount; i++) {
		// Spread detections throughout the lap with seeded randomness
		const baseOffset = detectionCount > 1
			? (i / (detectionCount - 1)) * lapDurationMs
			: lapDurationMs / 2;
		const randomness =
			(seededRandom(`${seed}-detection-offset-${detectionCounter}-${i}`, 0) -
				0.5) * 500; // Reduce randomness range
		const timeOffsetWithinLap = Math.max(0, baseOffset + randomness); // Ensure non-negative
		const absoluteTimeMs = raceStartTimeMs + timeOffsetWithinLap;
		const isLastDetection = i === detectionCount - 1;

		detections.push({
			id: await generateId(seed, 7000 + detectionCounter + i),
			pilot: pilotId,
			race: raceId,
			channel: channelId,
			event: eventId,
			lapNumber: lapNumber,
			time: Math.floor(absoluteTimeMs).toString(),
			peak: Math.floor(
				seededRandom(`${seed}-peak-${detectionCounter}-${i}`, 0) * 1000,
			),
			isLapEnd: isLastDetection, // Only the last detection marks lap end
			valid: true,
			source: 'fpvtrackside',
			sourceId: await generateId(seed, 9000 + detectionCounter + i), // Use seeded ID instead of UUID
			collectionId: COLLECTION_IDS.detections,
			collectionName: 'detections',
		});
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
	const pilotChannels = await generatePilotChannels(
		pilots,
		channels,
		races,
		seed,
	);
	const { laps, detections } = await generateLaps(
		options,
		races,
		pilots,
		pilotChannels,
		seed,
	);

	return {
		version: 'pb-snapshot@v1',
		snapshotTime: '2025-09-23T12:00:00.000Z', // Fixed timestamp for deterministic output
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
			seed: 'default-seed-123',
			telemetry: true,
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
  -s, --seed <string>       Random seed for reproducible generation (default: default-seed-123)
  -o, --output <path>       Output file path (default: snapshots/generated-<seed>.json)
  -t, --telemetry           Include lap and detection telemetry data (default: true)
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

const callsigns = [
	'Robo',
	'JEGZ',
	'Add to cart',
	'JustHappyToBeHere',
	'uewepuep',
	'Beau Babe',
	'Bones',
	'CGO',
	'Tex',
	'Hitnstuff',
	'PropFPV',
	'Ethan FPV',
	'FLUX',
	'Wilf',
	'Le Star',
	'Red2Rotor',
	'IQ0',
	'Heepsy',
	'FalcoFPV',
	'BEAR',
	'NugNug',
	'Pitstop',
	'BlackWolf',
	'JWebb',
	'There Yet',
	'Whitephos',
	'MCQUEEN',
	'subb20',
	'Acquado',
	'ManMadeTree',
	'Davey FPV',
	'ironoid',
	'Phoenix FPV',
	'Lovers',
	'Wubbz',
	'Blondeangel',
	'ShutterSpeed.FPV',
	'AviationCraft',
	'Foxur',
	'Bread',
	'RacingLewis',
	'MacDaddy',
	'EB FPV',
	'SQuiD-FPV',
	'Cross',
	'CutnClose',
	'sugarK',
	'DimSim',
	'Sway On FPV',
	'WiWichoi',
	'Spark',
	'Dingo',
	'ShadowFPV',
	'Zappa',
	'Zop',
	'AeroplaneJelly',
	'Djay',
	'samtam',
	'Chippykyay',
	'SMILEYFPV',
	'SHAKAS',
	'Phix',
	'Starry',
	'Hopper',
	'JohnnyGMachine',
	'Cheesewaffle',
	'Nacho',
	'Gecko',
	'timmytron',
	'SuperDizzyDi',
	'Troystar',
	'Prop Out',
	'enjenir',
	'Spanna',
	'Snapper FPV',
	'Third Eye',
	'KONGFPV',
	'Whodeany',
	'SALLAD',
	'Ace',
	'bob9',
	'Willman',
	'ctzsnooze',
	'Yappasini',
	'JD',
	'Huddo',
	'KONGFPV',
	'Whodeany',
	'SALLAD',
	'Ace',
	'bob9',
	'Willman',
	'ctzsnooze',
	'Yappasini',
	'JD',
	'Huddo',
	'Wing Nut',
];

if (import.meta.main) {
	await main();
}
