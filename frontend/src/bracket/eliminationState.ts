import { atom } from 'jotai';
import { atomFamily } from 'jotai/utils';
import { z } from 'zod';
import { channelsDataAtom, clientKVRecordsAtom, currentEventAtom, pilotsAtom, racesAtom, roundsDataAtom } from '../state/pbAtoms.ts';
import { BRACKET_EDGES, BRACKET_NODES, BRACKET_ROUNDS, BracketEdgeDefinition, BracketNodeDefinition } from './doubleElimDefinition.ts';
import type { PBRaceRecord } from '../api/pbTypes.ts';
import { racePilotChannelsAtom, racePilotFinishElapsedMsAtom, raceSortedRowsAtom, raceStatusAtom } from '../race/race-atoms.ts';
import type { PBClientKVRecord } from '../api/pbTypes.ts';

const BRACKET_ID = 'double-elim-6p-v1';

const bracketAnchorSchema = z.object({
	bracket: z.string(),
	anchors: z.array(z.object({
		bracketOrder: z.number().int().min(1).max(29),
		raceOrder: z.number().int().optional(),
		raceSourceId: z.string().trim().min(1).optional(),
	})).default([]),
	notes: z.string().optional(),
});

export interface BracketAnchorConfig {
	bracketId: string;
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
}

export type NodeStatus = 'unassigned' | 'scheduled' | 'active' | 'completed';

export interface BracketNodeViewModel {
	definition: BracketNodeDefinition;
	race: PBRaceRecord | null;
	status: NodeStatus;
	headline: string;
	subline: string;
	slots: BracketNodeSlot[];
	dropToLabel: string | null;
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
		return { bracketId: BRACKET_ID, anchors: [], record };
	}
	try {
		const parsed = bracketAnchorSchema.parse(JSON.parse(record.value));
		if (parsed.bracket !== BRACKET_ID) {
			return {
				bracketId: parsed.bracket,
				anchors: parsed.anchors ?? [],
				record,
			};
		}
		return { bracketId: parsed.bracket, anchors: parsed.anchors ?? [], record };
	} catch (error) {
		console.error('[double-elim] Failed to parse anchor config', error);
		return { bracketId: BRACKET_ID, anchors: [], record };
	}
}

export const bracketAnchorConfigAtom = atom((get): BracketAnchorConfig => {
	const event = get(currentEventAtom);
	if (!event) return { bracketId: BRACKET_ID, anchors: [], record: null };
	const kvRecords = get(clientKVRecordsAtom);
	const record = kvRecords.find((r) =>
		r.namespace === 'bracket' && r.key === 'doubleElimAnchors' &&
		r.event === event.id
	) ?? null;
	return parseAnchorConfig(record);
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
): Map<number, PBRaceRecord | null> {
	const sortedRaces = [...races].sort((a, b) => a.raceOrder - b.raceOrder);
	if (sortedRaces.length === 0) {
		return new Map(BRACKET_NODES.map((def) => [def.order, null]));
	}
	const anchorPoints = buildAnchorPoints(sortedRaces, config);
	if (anchorPoints.length === 0) {
		return new Map(
			BRACKET_NODES.map((def, idx) => [def.order, sortedRaces[idx] ?? null]),
		);
	}
	const mapping = new Map<number, PBRaceRecord | null>();
	let currentAnchor = anchorPoints[0];
	const orderedNodes = [...BRACKET_NODES].sort((a, b) => a.order - b.order);
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

export const bracketDiagramAtom = atom((get): BracketDiagramViewModel => {
	const config = get(bracketAnchorConfigAtom);
	const isBracketEnabled = get(bracketEnabledAtom);
	const races = get(racesAtom) as PBRaceRecord[];
	const rounds = get(roundsDataAtom);
	const pilots = get(pilotsAtom);
	const channels = get(channelsDataAtom);
	const mapping = mapRacesToBracket(races, config);
	const nodeViewModels: BracketNodeViewModel[] = BRACKET_NODES.map(
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
			const round = rounds.find((r) => r.id === race.round);
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
				const isWinner = finished && position != null && position <= 3;
				const isEliminated = finished && position != null && position > 3;
				const channelLabel = channel
					? (() => {
						const compact = `${channel.shortBand ?? ''}${channel.number ?? ''}`
							.trim();
						if (compact) return compact;
						return channel.channelDisplayName ?? '';
					})()
					: '';
				return {
					id: pc.id,
					pilotId: pc.pilotId,
					name: pilot?.name ?? '—',
					channelLabel: channelLabel || '—',
					channelId: pc.channelId ?? null,
					position: displayPosition,
					isWinner,
					isEliminated,
					isPredicted: false,
				};
			});
			while (slots.length < 6) {
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
				});
			}
			const raceLabel = definition.name;
			const headline = raceLabel;
			const subline = definition.code;
			const dropToNode = definition.dropTo ? BRACKET_NODES.find((n) => n.order === definition.dropTo) : null;
			const dropToLabel = dropToNode ? `Redemption: ${dropToNode.name}` : null;
			return {
				definition,
				race,
				status,
				headline,
				subline,
				slots,
				dropToLabel,
			};
		},
	);
	const nodeByOrder = new Map(
		nodeViewModels.map((node) => [node.definition.order, node]),
	);
	if (isBracketEnabled) {
		applyPredictedAssignments(nodeByOrder);
	}
	const edges: BracketEdgeViewModel[] = BRACKET_EDGES.map((edge) => {
		const source = nodeByOrder.get(edge.from)!;
		const target = nodeByOrder.get(edge.to)!;
		const state: 'pending' | 'active' | 'completed' = source.status === 'completed'
			? 'completed'
			: source.status === 'active'
			? 'active'
			: 'pending';
		return { definition: edge, source, target, state };
	});
	const roundsView = BRACKET_ROUNDS.map((round) => {
		const nodes = round.nodeOrders.map((order) => nodeByOrder.get(order)!.definition);
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
	const dropToNode = definition.dropTo ? BRACKET_NODES.find((n) => n.order === definition.dropTo) : null;
	const dropToLabel = dropToNode ? `Redemption: ${dropToNode.name}` : null;
	return {
		definition,
		race: null,
		status: 'unassigned',
		headline: definition.name,
		subline: definition.code,
		slots: Array.from({ length: 6 }).map((_, idx) => ({
			id: `${definition.order}-empty-${idx}`,
			pilotId: null,
			name: 'Awaiting assignment',
			channelLabel: '—',
			channelId: null,
			position: null,
			isWinner: false,
			isEliminated: false,
			isPredicted: false,
		})),
		dropToLabel,
	};
}

export function applyPredictedAssignments(
	nodeByOrder: Map<number, BracketNodeViewModel>,
) {
	const predictions = new Map<number, BracketNodeSlot[]>();
	for (const edge of BRACKET_EDGES) {
		const source = nodeByOrder.get(edge.from);
		const target = nodeByOrder.get(edge.to);
		if (!source || !target) continue;
		if (source.status !== 'completed') continue;
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
