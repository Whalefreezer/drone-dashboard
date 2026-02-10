import { z } from 'zod';
import rawDoubleElim from './definitions/double-elim.json' with { type: 'json' };

export type BracketStage = 'winners' | 'redemption';

export interface BracketNodeDefinition {
	order: number;
	code: string;
	name: string;
	roundId: BracketRoundId;
	roundLabel: string;
	stage: BracketStage;
	description: string;
	position: { x: number; y: number };
	progressionRules: {
		positions: number[];
		destination: number | 'out' | 'final';
	}[];
}

export type BracketRoundId =
	| 'round1'
	| 'round2'
	| 'round3'
	| 'round4'
	| 'round5'
	| 'round6'
	| 'round7'
	| 'round8'
	| 'round9'
	| 'round10';

export interface BracketRoundDefinition {
	id: BracketRoundId;
	label: string;
	nodeOrders: number[];
}

export interface BracketEdgeDefinition {
	from: number;
	to: number;
	type: 'advance' | 'drop';
}

const COLUMN_UNIT = 380;
const ROW_UNIT = 90;

const bracketRoundIdSchema = z.enum([
	'round1',
	'round2',
	'round3',
	'round4',
	'round5',
	'round6',
	'round7',
	'round8',
	'round9',
	'round10',
]);

const bracketNodeSchema = z.object({
	order: z.number().int().positive(),
	code: z.string().min(1),
	name: z.string().min(1),
	roundId: bracketRoundIdSchema,
	roundLabel: z.string().min(1),
	stage: z.enum(['winners', 'redemption']),
	description: z.string().min(1),
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
	id: bracketRoundIdSchema,
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
});

const parsedBracketData = bracketDataSchema.parse(rawDoubleElim);
validateBracketData(parsedBracketData);

export const BRACKET_NODES: BracketNodeDefinition[] = parsedBracketData.nodes;
export const BRACKET_ROUNDS: BracketRoundDefinition[] = parsedBracketData.rounds;
export const BRACKET_EDGES: BracketEdgeDefinition[] = parsedBracketData.edges;

export const DIAGRAM_DIMENSIONS = (() => {
	const maxX = Math.max(...BRACKET_NODES.map((node) => node.position.x));
	const maxY = Math.max(...BRACKET_NODES.map((node) => node.position.y));
	return {
		width: maxX + COLUMN_UNIT + 200,
		height: maxY + ROW_UNIT + 300,
		nodeWidth: 300,
		nodeHeight: 330,
		columnUnit: COLUMN_UNIT,
		rowUnit: ROW_UNIT,
	};
})();

function validateBracketData(data: {
	nodes: BracketNodeDefinition[];
	rounds: BracketRoundDefinition[];
	edges: BracketEdgeDefinition[];
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
}
