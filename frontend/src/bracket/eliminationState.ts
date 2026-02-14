import { atom } from 'jotai';
import { atomFamily } from 'jotai/utils';
import { z } from 'zod';
import { channelsDataAtom, clientKVRecordsAtom, currentEventAtom, pilotsAtom, racesAtom } from '../state/pbAtoms.ts';
import type { PBClientKVRecord, PBRaceRecord } from '../api/pbTypes.ts';
import { racePilotChannelsAtom, raceSortedRowsAtom, raceStatusAtom } from '../race/race-atoms.ts';
import { DOUBLE_ELIM_6P_V1_FORMAT } from './formats/double-elim-6p-v1.ts';
import { DEFAULT_BRACKET_FORMAT_ID, getBracketFormatById } from './formats/registry.ts';
import type { BracketEdgeDefinition, BracketFormatDefinition, BracketNodeDefinition } from './formats/types.ts';

export const BRACKET_KV_NAMESPACE = 'bracket';
export const ELIMINATION_CONFIG_KV_KEY = 'eliminationConfig';

const eliminationConfigSchema = z.object({
	formatId: z.string().trim().min(1).default(DEFAULT_BRACKET_FORMAT_ID),
	anchors: z.array(z.object({
		bracketOrder: z.number().int().min(1),
		raceOrder: z.number().int().optional(),
		raceSourceId: z.string().trim().min(1).optional(),
	})).default([]),
	runSequence: z.array(z.number().int().positive()).optional(),
	notes: z.string().optional(),
});

export interface BracketAnchorConfig {
	formatId: string;
	anchors: BracketAnchor[];
	runSequence?: number[];
	record: PBClientKVRecord | null;
}

export interface BracketAnchor {
	bracketOrder: number;
	raceOrder?: number;
	raceSourceId?: string;
}

export interface BracketNodeSlot {
	id: string;
	pilotId: string | null;
	name: string;
	channelLabel: string;
	channelId: string | null;
	position: number | null;
	isWinner: boolean;
	isEliminated: boolean;
	isPredicted: boolean;
	destinationLabel: string | null;
	heatPoints: Array<number | null>;
	totalPoints: number | null;
}

export type NodeStatus = 'unassigned' | 'scheduled' | 'active' | 'completed';

export interface BracketNodeViewModel {
	definition: BracketNodeDefinition;
	race: PBRaceRecord | null;
	raceIds: string[];
	status: NodeStatus;
	headline: string;
	subline: string;
	expectedHeatCount: number;
	assignedHeatCount: number;
	slots: BracketNodeSlot[];
}

export interface BracketEdgeViewModel {
	definition: BracketEdgeDefinition;
	source: BracketNodeViewModel;
	target: BracketNodeViewModel;
	state: 'pending' | 'active' | 'completed';
}

export interface BracketDiagramViewModel {
	nodes: BracketNodeViewModel[];
	edges: BracketEdgeViewModel[];
	rounds: { id: string; label: string; centerX: number }[];
	anchors: BracketAnchorConfig;
	runSequence?: number[];
}

export const bracketEnabledAtom = atom((get): boolean => {
	const config = get(bracketAnchorConfigAtom);
	return config.record != null;
});

function parseAnchorConfig(
	record: PBClientKVRecord | null,
): BracketAnchorConfig {
	if (!record?.value) {
		return { formatId: DEFAULT_BRACKET_FORMAT_ID, anchors: [], record };
	}
	try {
		const parsed = eliminationConfigSchema.parse(JSON.parse(record.value));
		return {
			formatId: getBracketFormatById(parsed.formatId).id,
			anchors: parsed.anchors ?? [],
			runSequence: parsed.runSequence,
			record,
		};
	} catch (error) {
		console.error('[bracket] Failed to parse elimination config', error);
		return { formatId: DEFAULT_BRACKET_FORMAT_ID, anchors: [], record };
	}
}

export const bracketAnchorConfigAtom = atom((get): BracketAnchorConfig => {
	const event = get(currentEventAtom);
	if (!event) return { formatId: DEFAULT_BRACKET_FORMAT_ID, anchors: [], record: null };
	const kvRecords = get(clientKVRecordsAtom);
	const record = kvRecords.find((r) =>
		r.namespace === BRACKET_KV_NAMESPACE && r.key === ELIMINATION_CONFIG_KV_KEY &&
		r.event === event.id
	) ?? null;
	return parseAnchorConfig(record);
});

export const activeBracketFormatAtom = atom((get): BracketFormatDefinition => {
	const config = get(bracketAnchorConfigAtom);
	return getBracketFormatById(config.formatId);
});

interface AnchorPoint {
	bracketOrder: number;
	raceIndex: number;
}

const POINTS_BY_POSITION = new Map<number, number>([
	[1, 10],
	[2, 7],
	[3, 4],
	[4, 3],
	[5, 2],
	[6, 1],
]);

function pointsForPosition(position: number | null | undefined): number | null {
	if (position == null) return null;
	return POINTS_BY_POSITION.get(position) ?? null;
}

function getNodeExpectedHeatCounts(
	nodes: BracketNodeDefinition[],
	runSequence?: number[],
): Map<number, number> {
	const counts = new Map<number, number>(nodes.map((node) => [node.order, 0]));
	if (!runSequence || runSequence.length === 0) {
		return new Map(nodes.map((node) => [node.order, 1]));
	}
	for (const order of runSequence) {
		counts.set(order, (counts.get(order) ?? 0) + 1);
	}
	for (const order of counts.keys()) {
		if ((counts.get(order) ?? 0) < 1) {
			counts.set(order, 1);
		}
	}
	return counts;
}

function resolveSequenceStartRaceIndex(
	sortedRaces: PBRaceRecord[],
	runSequence: number[],
	config: BracketAnchorConfig,
): number {
	if (sortedRaces.length === 0 || runSequence.length === 0) {
		return 0;
	}
	const anchorPoints = buildAnchorPoints(sortedRaces, config)
		.filter((point) => runSequence.includes(point.bracketOrder));
	for (const anchor of anchorPoints) {
		const sequenceIdx = runSequence.indexOf(anchor.bracketOrder);
		if (sequenceIdx < 0) continue;
		const start = anchor.raceIndex - sequenceIdx;
		if (start >= 0) return start;
	}
	return 0;
}

export function buildAnchorPoints(
	races: PBRaceRecord[],
	config: BracketAnchorConfig,
): AnchorPoint[] {
	const sortedRaces = [...races].sort((a, b) => a.raceOrder - b.raceOrder);
	const indexByRaceOrder = new Map<number, number>();
	const indexBySourceId = new Map<string, number>();
	sortedRaces.forEach((race, index) => {
		indexByRaceOrder.set(race.raceOrder, index);
		if (race.sourceId) indexBySourceId.set(race.sourceId.trim(), index);
	});
	const points: AnchorPoint[] = [];
	for (const anchor of config.anchors) {
		let raceIndex: number | undefined;
		if (anchor.raceSourceId) {
			raceIndex = indexBySourceId.get(anchor.raceSourceId.trim());
		}
		if (raceIndex === undefined && anchor.raceOrder != null) {
			raceIndex = indexByRaceOrder.get(anchor.raceOrder);
		}
		if (raceIndex === undefined) continue;
		points.push({ bracketOrder: anchor.bracketOrder, raceIndex });
	}
	if (sortedRaces.length > 0) {
		const hasAnchorAtOne = points.some((p) => p.bracketOrder === 1);
		if (!hasAnchorAtOne) {
			points.push({ bracketOrder: 1, raceIndex: 0 });
		}
	}
	points.sort((a, b) => a.bracketOrder - b.bracketOrder || a.raceIndex - b.raceIndex);
	return points;
}

export function mapRacesToBracketHeats(
	races: PBRaceRecord[],
	config: BracketAnchorConfig,
	nodes: BracketNodeDefinition[] = DOUBLE_ELIM_6P_V1_FORMAT.nodes,
	runSequence?: number[],
): Map<number, PBRaceRecord[]> {
	const sortedRaces = [...races].sort((a, b) => a.raceOrder - b.raceOrder);
	const mapping = new Map<number, PBRaceRecord[]>(nodes.map((node) => [node.order, []]));
	if (sortedRaces.length === 0) {
		return mapping;
	}
	if (runSequence && runSequence.length > 0) {
		const startRaceIndex = resolveSequenceStartRaceIndex(sortedRaces, runSequence, config);
		for (let sequenceIndex = 0; sequenceIndex < runSequence.length; sequenceIndex++) {
			const race = sortedRaces[startRaceIndex + sequenceIndex] ?? null;
			if (!race) break;
			const bracketOrder = runSequence[sequenceIndex];
			const bucket = mapping.get(bracketOrder) ?? [];
			bucket.push(race);
			mapping.set(bracketOrder, bucket);
		}
		return mapping;
	}
	const anchorPoints = buildAnchorPoints(sortedRaces, config);
	if (anchorPoints.length === 0) {
		nodes.forEach((node, idx) => {
			const race = sortedRaces[idx] ?? null;
			mapping.set(node.order, race ? [race] : []);
		});
		return mapping;
	}
	let currentAnchor = anchorPoints[0];
	const orderedNodes = [...nodes].sort((a, b) => a.order - b.order);
	for (const node of orderedNodes) {
		for (const candidate of anchorPoints) {
			if (candidate.bracketOrder <= node.order) currentAnchor = candidate;
		}
		const offset = node.order - currentAnchor.bracketOrder;
		const race = sortedRaces[currentAnchor.raceIndex + offset] ?? null;
		mapping.set(node.order, race ? [race] : []);
	}
	return mapping;
}

export function mapRacesToBracket(
	races: PBRaceRecord[],
	config: BracketAnchorConfig,
	nodes: BracketNodeDefinition[] = DOUBLE_ELIM_6P_V1_FORMAT.nodes,
	runSequence?: number[],
): Map<number, PBRaceRecord | null> {
	const grouped = mapRacesToBracketHeats(races, config, nodes, runSequence);
	return new Map(nodes.map((node) => [node.order, grouped.get(node.order)?.[0] ?? null]));
}

function getDestinationLabel(
	definition: BracketNodeDefinition,
	nodes: BracketNodeDefinition[],
	position: number | null,
): string | null {
	if (position == null) return null;
	const rule = definition.progressionRules.find((r) => r.positions.includes(position));
	if (!rule) return null;
	if (rule.destination === 'out') return 'OUT';
	if (rule.destination === 'final') return 'FINAL';
	const destNode = nodes.find((n) => n.order === rule.destination);
	return destNode ? `-> ${destNode.name}` : null;
}

function getSlotOutcome(
	definition: BracketNodeDefinition,
	edges: BracketEdgeDefinition[],
	position: number | null,
): { isWinner: boolean; isEliminated: boolean } {
	if (position == null) return { isWinner: false, isEliminated: false };
	const rule = definition.progressionRules.find((entry) => entry.positions.includes(position));
	if (!rule) return { isWinner: false, isEliminated: false };
	if (rule.destination === 'out') return { isWinner: false, isEliminated: true };
	if (rule.destination === 'final') return { isWinner: true, isEliminated: false };
	const edge = edges.find((entry) => entry.from === definition.order && entry.to === rule.destination);
	if (edge?.type === 'advance') return { isWinner: true, isEliminated: false };
	if (edge?.type === 'drop') return { isWinner: false, isEliminated: true };
	return { isWinner: false, isEliminated: false };
}

function buildChannelLabel(
	channel: {
		shortBand?: string;
		number?: number;
		channelDisplayName?: string;
	} | null,
): string {
	if (!channel) return '—';
	const compact = `${channel.shortBand ?? ''}${channel.number ?? ''}`.trim();
	if (compact) return compact;
	return channel.channelDisplayName ?? '—';
}

function createPlaceholderSlot(
	definitionOrder: number,
	index: number,
	heatCount: number,
): BracketNodeSlot {
	return {
		id: `${definitionOrder}-placeholder-${index}`,
		pilotId: null,
		name: 'Awaiting assignment',
		channelLabel: '—',
		channelId: null,
		position: null,
		isWinner: false,
		isEliminated: false,
		isPredicted: false,
		destinationLabel: null,
		heatPoints: Array.from({ length: heatCount }).map(() => null),
		totalPoints: null,
	};
}

export const bracketDiagramAtom = atom((get): BracketDiagramViewModel => {
	const config = get(bracketAnchorConfigAtom);
	const format = get(activeBracketFormatAtom);
	const isBracketEnabled = get(bracketEnabledAtom);
	const races = get(racesAtom) as PBRaceRecord[];
	const pilots = get(pilotsAtom);
	const channels = get(channelsDataAtom);
	const pilotById = new Map(pilots.map((pilot) => [pilot.id, pilot]));
	const channelById = new Map(channels.map((channel) => [channel.id, channel]));
	const runSequence = config.runSequence ?? format.runSequence;
	const expectedHeatCounts = getNodeExpectedHeatCounts(format.nodes, runSequence);
	const groupedMapping = mapRacesToBracketHeats(races, config, format.nodes, runSequence);
	const nodeViewModels: BracketNodeViewModel[] = format.nodes.map(
		(definition) => {
			const assignedRaces = groupedMapping.get(definition.order) ?? [];
			const expectedHeatCount = expectedHeatCounts.get(definition.order) ?? 1;
			if (assignedRaces.length === 0) {
				return createEmptyNode(definition, expectedHeatCount);
			}

			const statuses = assignedRaces.map((race) => get(raceStatusAtom(race.id)));
			const activeRace = assignedRaces.find((race, idx) => statuses[idx]?.isActive) ?? null;
			const fallbackRace = assignedRaces[assignedRaces.length - 1] ?? null;
			const completedHeats = statuses.filter((status) => status?.isCompleted === true).length;
			const hasActive = statuses.some((status) => status?.isActive === true);
			const hasStarted = statuses.some((status) =>
				status?.hasStarted === true || status?.isActive === true || status?.isCompleted === true
			);
			const isCompleted = completedHeats >= expectedHeatCount && expectedHeatCount > 0;
			const status: NodeStatus = hasActive
				? 'active'
				: isCompleted
				? 'completed'
				: hasStarted || assignedRaces.length > 0
				? 'scheduled'
				: 'unassigned';

			const byPilot = new Map<string, {
				pilotId: string;
				name: string;
				channelId: string | null;
				channelLabel: string;
				heatPoints: Array<number | null>;
				totalPoints: number;
				latestHeatIndex: number;
				latestHeatPosition: number | null;
			}>();

			for (let heatIndex = 0; heatIndex < expectedHeatCount; heatIndex++) {
				const heatRace = assignedRaces[heatIndex] ?? null;
				if (!heatRace) continue;
				const heatStatus = statuses[heatIndex];
				const pilotChannels = get(racePilotChannelsAtom(heatRace.id));
				for (const pc of pilotChannels) {
					if (!pc.pilotId) continue;
					if (!byPilot.has(pc.pilotId)) {
						const pilot = pilotById.get(pc.pilotId);
						const channel = pc.channelId ? channelById.get(pc.channelId) ?? null : null;
						byPilot.set(pc.pilotId, {
							pilotId: pc.pilotId,
							name: pilot?.name ?? '—',
							channelId: pc.channelId ?? null,
							channelLabel: buildChannelLabel(channel),
							heatPoints: Array.from({ length: expectedHeatCount }).map(() => null),
							totalPoints: 0,
							latestHeatIndex: heatIndex,
							latestHeatPosition: null,
						});
					} else {
						const entry = byPilot.get(pc.pilotId)!;
						if (heatIndex >= entry.latestHeatIndex) {
							const channel = pc.channelId ? channelById.get(pc.channelId) ?? null : null;
							entry.channelId = pc.channelId ?? entry.channelId;
							entry.channelLabel = buildChannelLabel(channel ?? (entry.channelId ? channelById.get(entry.channelId) ?? null : null));
							entry.latestHeatIndex = heatIndex;
						}
					}
				}

				const sortedRows = get(raceSortedRowsAtom(heatRace.id));
				for (const row of sortedRows) {
					const pilotId = row.pilotChannel.pilotId;
					if (!pilotId) continue;
					if (!byPilot.has(pilotId)) {
						const pilot = pilotById.get(pilotId);
						byPilot.set(pilotId, {
							pilotId,
							name: pilot?.name ?? '—',
							channelId: null,
							channelLabel: '—',
							heatPoints: Array.from({ length: expectedHeatCount }).map(() => null),
							totalPoints: 0,
							latestHeatIndex: heatIndex,
							latestHeatPosition: null,
						});
					}
					const pilot = byPilot.get(pilotId)!;
					if (heatStatus?.isCompleted === true) {
						const heatPoints = pointsForPosition(row.position);
						pilot.heatPoints[heatIndex] = heatPoints;
						if (heatPoints != null) {
							pilot.totalPoints += heatPoints;
						}
					}
					pilot.latestHeatPosition = row.position;
				}
			}

			const rankedPilots = [...byPilot.values()].sort((a, b) => {
				if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
				const aBest = Math.max(...a.heatPoints.map((value) => value ?? 0));
				const bBest = Math.max(...b.heatPoints.map((value) => value ?? 0));
				if (bBest !== aBest) return bBest - aBest;
				const aPosition = a.latestHeatPosition ?? Number.POSITIVE_INFINITY;
				const bPosition = b.latestHeatPosition ?? Number.POSITIVE_INFINITY;
				if (aPosition !== bPosition) return aPosition - bPosition;
				return a.name.localeCompare(b.name);
			});

			const slots: BracketNodeSlot[] = rankedPilots.map((pilot, idx) => {
				const displayPosition = status === 'completed' ? idx + 1 : null;
				const outcome = getSlotOutcome(definition, format.edges, displayPosition);
				const hasPoints = pilot.heatPoints.some((value) => value != null);
				const destinationLabel = getDestinationLabel(definition, format.nodes, displayPosition);
				return {
					id: `${definition.order}-${pilot.pilotId}`,
					pilotId: pilot.pilotId,
					name: pilot.name,
					channelLabel: pilot.channelLabel || '—',
					channelId: pilot.channelId,
					position: displayPosition,
					isWinner: outcome.isWinner,
					isEliminated: outcome.isEliminated,
					isPredicted: false,
					destinationLabel,
					heatPoints: pilot.heatPoints,
					totalPoints: hasPoints ? pilot.totalPoints : null,
				};
			});

			while (slots.length < definition.slotCount) {
				slots.push(createPlaceholderSlot(definition.order, slots.length, expectedHeatCount));
			}
			const raceLabel = definition.name;
			const headline = raceLabel;
			const subline = definition.code;
			const currentRace = activeRace ?? fallbackRace;
			return {
				definition,
				race: currentRace,
				raceIds: assignedRaces.map((race) => race.id),
				status,
				headline,
				subline,
				expectedHeatCount,
				assignedHeatCount: assignedRaces.length,
				slots,
			};
		},
	);
	const nodeByOrder = new Map(
		nodeViewModels.map((node) => [node.definition.order, node]),
	);
	if (isBracketEnabled) {
		applyPredictedAssignments(nodeByOrder, format.edges);
	}
	const edges: BracketEdgeViewModel[] = format.edges.map((edge) => {
		const source = nodeByOrder.get(edge.from)!;
		const target = nodeByOrder.get(edge.to)!;
		const state: 'pending' | 'active' | 'completed' = source.status === 'completed'
			? 'completed'
			: source.status === 'active'
			? 'active'
			: 'pending';
		return { definition: edge, source, target, state };
	});
	const roundsView = format.rounds.map((round) => {
		const nodes = round.nodeOrders
			.map((order) => nodeByOrder.get(order)?.definition)
			.filter((node): node is BracketNodeDefinition => node != null);
		const centerX = nodes.reduce((sum, node) => sum + node.position.x, 0) /
			Math.max(nodes.length, 1);
		return { id: round.id, label: round.label, centerX };
	});
	return {
		nodes: nodeViewModels,
		edges,
		rounds: roundsView,
		anchors: config,
		runSequence,
	};
});

function createEmptyNode(
	definition: BracketNodeDefinition,
	expectedHeatCount: number,
): BracketNodeViewModel {
	return {
		definition,
		race: null,
		raceIds: [],
		status: 'unassigned',
		headline: definition.name,
		subline: definition.code,
		expectedHeatCount,
		assignedHeatCount: 0,
		slots: Array.from({ length: definition.slotCount }).map((_, idx) => ({
			id: `${definition.order}-empty-${idx}`,
			pilotId: null,
			name: 'Awaiting assignment',
			channelLabel: '—',
			channelId: null,
			position: null,
			isWinner: false,
			isEliminated: false,
			isPredicted: false,
			destinationLabel: null,
			heatPoints: Array.from({ length: expectedHeatCount }).map(() => null),
			totalPoints: null,
		})),
	};
}

export function applyPredictedAssignments(
	nodeByOrder: Map<number, BracketNodeViewModel>,
	edges: BracketEdgeDefinition[] = DOUBLE_ELIM_6P_V1_FORMAT.edges,
) {
	const predictions = new Map<number, BracketNodeSlot[]>();
	for (const edge of edges) {
		const source = nodeByOrder.get(edge.from);
		const target = nodeByOrder.get(edge.to);
		if (!source || !target) continue;
		if (source.status !== 'completed' && source.status !== 'active') continue;
		const candidates = source.slots.filter((slot) => {
			if (!slot.pilotId) return false;
			return edge.type === 'advance' ? slot.isWinner : slot.isEliminated;
		});
		if (candidates.length === 0) continue;
		const bucket = predictions.get(target.definition.order) ?? [];
		for (const slot of candidates) {
			bucket.push({
				id: `prediction-${edge.from}-${slot.id}-${edge.to}`,
				pilotId: slot.pilotId,
				name: slot.name,
				channelLabel: '—',
				channelId: null,
				position: null,
				isWinner: false,
				isEliminated: false,
				isPredicted: true,
				destinationLabel: null,
				heatPoints: Array.from({ length: target.expectedHeatCount }).map(() => null),
				totalPoints: null,
			});
		}
		predictions.set(target.definition.order, bucket);
	}
	for (const [order, predictedSlots] of predictions) {
		const targetNode = nodeByOrder.get(order);
		if (!targetNode) continue;
		const existingPilotIds = new Set<string>(
			targetNode.slots
				.map((slot) => slot.pilotId)
				.filter((pilotId): pilotId is string => pilotId != null),
		);
		const updatedSlots = targetNode.slots.map((slot) => ({ ...slot }));
		for (const predicted of predictedSlots) {
			if (!predicted.pilotId || existingPilotIds.has(predicted.pilotId)) continue;
			const openIndex = updatedSlots.findIndex((slot) => slot.pilotId == null);
			if (openIndex === -1) break;
			updatedSlots[openIndex] = predicted;
			existingPilotIds.add(predicted.pilotId);
		}
		targetNode.slots = updatedSlots;
	}
}

export const raceBracketSlotsAtom = atomFamily((raceId: string) =>
	atom((get): BracketNodeSlot[] => {
		if (!get(bracketEnabledAtom)) {
			return [];
		}
		const diagram = get(bracketDiagramAtom);
		const node = diagram.nodes.find((n) => n.raceIds.includes(raceId)) ??
			diagram.nodes.find((n) => `predicted-race-${n.definition.order}` === raceId) ??
			null;
		return node?.slots ?? [];
	})
);
