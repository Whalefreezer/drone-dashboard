import { z } from 'zod';
import {
	BracketEdgeDefinition,
	BracketFormatDefinition,
	BracketNodeDefinition,
	BracketRoundDefinition,
	computeDiagramDimensions,
} from './types.ts';

const bracketNodeSchema = z.object({
	order: z.number().int().positive(),
	code: z.string().min(1),
	name: z.string().min(1),
	roundId: z.string().min(1),
	roundLabel: z.string().min(1),
	stage: z.enum(['winners', 'redemption']),
	description: z.string().min(1),
	slotCount: z.number().int().min(2).max(16).default(6),
	position: z.object({
		x: z.number(),
		y: z.number(),
	}),
	progressionRules: z.array(z.object({
		positions: z.array(z.number().int().positive()).min(1),
		destination: z.union([z.number().int().positive(), z.literal('out'), z.literal('final')]),
	})),
});

const bracketRoundSchema = z.object({
	id: z.string().min(1),
	label: z.string().min(1),
	nodeOrders: z.array(z.number().int().positive()),
});

const bracketEdgeSchema = z.object({
	from: z.number().int().positive(),
	to: z.number().int().positive(),
	type: z.enum(['advance', 'drop']),
});

const bracketDataSchema = z.object({
	nodes: z.array(bracketNodeSchema).min(1),
	rounds: z.array(bracketRoundSchema).min(1),
	edges: z.array(bracketEdgeSchema),
	runSequence: z.array(z.number().int().positive()).optional(),
});

export function parseBracketFormatDefinition(raw: unknown, id: string, label: string): BracketFormatDefinition {
	const parsed = bracketDataSchema.parse(raw);
	validateBracketData(parsed);
	return {
		id,
		label,
		nodes: parsed.nodes,
		rounds: parsed.rounds,
		edges: parsed.edges,
		runSequence: parsed.runSequence,
		diagramDimensions: computeDiagramDimensions(parsed.nodes),
	};
}

function validateBracketData(data: {
	nodes: BracketNodeDefinition[];
	rounds: BracketRoundDefinition[];
	edges: BracketEdgeDefinition[];
	runSequence?: number[];
}) {
	const nodeOrderSet = new Set<number>();
	for (const node of data.nodes) {
		if (nodeOrderSet.has(node.order)) {
			throw new Error(`Duplicate bracket node order detected: ${node.order}`);
		}
		nodeOrderSet.add(node.order);
	}

	for (const node of data.nodes) {
		for (const rule of node.progressionRules) {
			if (typeof rule.destination === 'number' && !nodeOrderSet.has(rule.destination)) {
				throw new Error(
					`Node ${node.order} has progression destination ${rule.destination}, which does not exist in nodes`,
				);
			}
		}
	}

	const roundIdSet = new Set(data.rounds.map((round) => round.id));
	for (const node of data.nodes) {
		if (!roundIdSet.has(node.roundId)) {
			throw new Error(`Node ${node.order} references missing round ${node.roundId}`);
		}
	}

	for (const round of data.rounds) {
		for (const nodeOrder of round.nodeOrders) {
			if (!nodeOrderSet.has(nodeOrder)) {
				throw new Error(`Round ${round.id} includes missing node order ${nodeOrder}`);
			}
		}
	}

	for (const edge of data.edges) {
		if (!nodeOrderSet.has(edge.from)) {
			throw new Error(`Edge source ${edge.from} does not exist in nodes`);
		}
		if (!nodeOrderSet.has(edge.to)) {
			throw new Error(`Edge destination ${edge.to} does not exist in nodes`);
		}
	}

	if (data.runSequence) {
		for (const order of data.runSequence) {
			if (!nodeOrderSet.has(order)) {
				throw new Error(`runSequence includes missing node order ${order}`);
			}
		}
	}
}
