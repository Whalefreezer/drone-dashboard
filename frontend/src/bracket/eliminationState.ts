import { atom } from 'jotai';
import { atomFamily } from 'jotai/utils';
import { z } from 'zod';
import { channelsDataAtom, clientKVRecordsAtom, currentEventAtom, pilotsAtom, racesAtom } from '../state/pbAtoms.ts';
import type { PBClientKVRecord, PBRaceRecord } from '../api/pbTypes.ts';
import { racePilotChannelsAtom, racePilotFinishElapsedMsAtom, raceSortedRowsAtom, raceStatusAtom } from '../race/race-atoms.ts';
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
	notes: z.string().optional(),
});

export interface BracketAnchorConfig {
	formatId: string;
	anchors: BracketAnchor[];
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
}

export type NodeStatus = 'unassigned' | 'scheduled' | 'active' | 'completed';

export interface BracketNodeViewModel {
	definition: BracketNodeDefinition;
	race: PBRaceRecord | null;
	status: NodeStatus;
	headline: string;
	subline: string;
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

export function mapRacesToBracket(
	races: PBRaceRecord[],
	config: BracketAnchorConfig,
	nodes: BracketNodeDefinition[] = DOUBLE_ELIM_6P_V1_FORMAT.nodes,
): Map<number, PBRaceRecord | null> {
	const sortedRaces = [...races].sort((a, b) => a.raceOrder - b.raceOrder);
	if (sortedRaces.length === 0) {
		return new Map(nodes.map((def) => [def.order, null]));
	}
	const anchorPoints = buildAnchorPoints(sortedRaces, config);
	if (anchorPoints.length === 0) {
		return new Map(
			nodes.map((def, idx) => [def.order, sortedRaces[idx] ?? null]),
		);
	}
	const mapping = new Map<number, PBRaceRecord | null>();
	let currentAnchor = anchorPoints[0];
	const orderedNodes = [...nodes].sort((a, b) => a.order - b.order);
	for (const node of orderedNodes) {
		for (const candidate of anchorPoints) {
			if (candidate.bracketOrder <= node.order) currentAnchor = candidate;
		}
		const offset = node.order - currentAnchor.bracketOrder;
		const race = sortedRaces[currentAnchor.raceIndex + offset] ?? null;
		mapping.set(node.order, race ?? null);
	}
	return mapping;
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

export const bracketDiagramAtom = atom((get): BracketDiagramViewModel => {
	const config = get(bracketAnchorConfigAtom);
	const format = get(activeBracketFormatAtom);
	const isBracketEnabled = get(bracketEnabledAtom);
	const races = get(racesAtom) as PBRaceRecord[];
	const pilots = get(pilotsAtom);
	const channels = get(channelsDataAtom);
	const mapping = mapRacesToBracket(races, config, format.nodes);
	const nodeViewModels: BracketNodeViewModel[] = format.nodes.map(
		(definition) => {
			const race = mapping.get(definition.order) ?? null;
			if (!race) {
				return createEmptyNode(definition);
			}
			const statusInfo = get(raceStatusAtom(race.id));
			const status: NodeStatus = statusInfo?.isActive
				? 'active'
				: statusInfo?.isCompleted
				? 'completed'
				: statusInfo?.hasStarted
				? 'scheduled'
				: 'scheduled';
			const pilotChannels = get(racePilotChannelsAtom(race.id));
			const sortedRows = get(raceSortedRowsAtom(race.id));
			const positionByPilot = new Map<string, number>();
			sortedRows.forEach((row) => {
				if (row.pilotChannel.pilotId) {
					positionByPilot.set(row.pilotChannel.pilotId, row.position);
				}
			});
			const raceCompleted = statusInfo?.isCompleted === true;
			const slots: BracketNodeSlot[] = pilotChannels.map((pc) => {
				const pilot = pilots.find((p) => p.id === pc.pilotId);
				const channel = channels.find((c) => c.id === pc.channelId);
				const position = pc.pilotId ? positionByPilot.get(pc.pilotId) ?? null : null;
				const finishElapsed = pc.pilotId ? get(racePilotFinishElapsedMsAtom([race.id, pc.pilotId])) : null;
				const finished = finishElapsed != null || raceCompleted;
				const displayPosition = finished && position != null ? position : null;
				const outcome = getSlotOutcome(definition, format.edges, displayPosition);
				const channelLabel = channel
					? (() => {
						const compact = `${channel.shortBand ?? ''}${channel.number ?? ''}`
							.trim();
						if (compact) return compact;
						return channel.channelDisplayName ?? '';
					})()
					: '';
				const destinationLabel = getDestinationLabel(definition, format.nodes, displayPosition);
				return {
					id: pc.id,
					pilotId: pc.pilotId,
					name: pilot?.name ?? '—',
					channelLabel: channelLabel || '—',
					channelId: pc.channelId ?? null,
					position: displayPosition,
					isWinner: outcome.isWinner,
					isEliminated: outcome.isEliminated,
					isPredicted: false,
					destinationLabel,
				};
			});
			while (slots.length < definition.slotCount) {
				slots.push({
					id: `${definition.order}-placeholder-${slots.length}`,
					pilotId: null,
					name: 'Awaiting assignment',
					channelLabel: '—',
					channelId: null,
					position: null,
					isWinner: false,
					isEliminated: false,
					isPredicted: false,
					destinationLabel: null,
				});
			}
			const raceLabel = definition.name;
			const headline = raceLabel;
			const subline = definition.code;
			return {
				definition,
				race,
				status,
				headline,
				subline,
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
	};
});

function createEmptyNode(
	definition: BracketNodeDefinition,
): BracketNodeViewModel {
	return {
		definition,
		race: null,
		status: 'unassigned',
		headline: definition.name,
		subline: definition.code,
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
		const node = diagram.nodes.find((n) => n.race?.id === raceId) ??
			diagram.nodes.find((n) => `predicted-race-${n.definition.order}` === raceId) ??
			null;
		return node?.slots ?? [];
	})
);
