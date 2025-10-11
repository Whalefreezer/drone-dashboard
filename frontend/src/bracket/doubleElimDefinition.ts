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
	advanceTo?: number;
	dropTo?: number;
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

const COLUMN_UNIT = 300;
const ROW_UNIT = 90;

function pos(column: number, row: number): { x: number; y: number } {
	return { x: column * COLUMN_UNIT, y: row * ROW_UNIT };
}

export const BRACKET_NODES: BracketNodeDefinition[] = [
	{
		order: 1,
		code: 'R1-1',
		name: 'Race 1',
		roundId: 'round1',
		roundLabel: 'Round 1',
		stage: 'winners',
		description: 'Initial heat — winners bracket',
		position: pos(0, 0),
		advanceTo: 9,
		dropTo: 13,
	},
	{
		order: 2,
		code: 'R1-2',
		name: 'Race 2',
		roundId: 'round1',
		roundLabel: 'Round 1',
		stage: 'winners',
		description: 'Initial heat — winners bracket',
		position: pos(0, 4),
		advanceTo: 9,
		dropTo: 13,
	},
	{
		order: 3,
		code: 'R1-3',
		name: 'Race 3',
		roundId: 'round1',
		roundLabel: 'Round 1',
		stage: 'winners',
		description: 'Initial heat — winners bracket',
		position: pos(0, 8),
		advanceTo: 10,
		dropTo: 14,
	},
	{
		order: 4,
		code: 'R1-4',
		name: 'Race 4',
		roundId: 'round1',
		roundLabel: 'Round 1',
		stage: 'winners',
		description: 'Initial heat — winners bracket',
		position: pos(0, 12),
		advanceTo: 10,
		dropTo: 14,
	},
	{
		order: 5,
		code: 'R1-5',
		name: 'Race 5',
		roundId: 'round1',
		roundLabel: 'Round 1',
		stage: 'winners',
		description: 'Initial heat — winners bracket',
		position: pos(0, 16),
		advanceTo: 11,
		dropTo: 15,
	},
	{
		order: 6,
		code: 'R1-6',
		name: 'Race 6',
		roundId: 'round1',
		roundLabel: 'Round 1',
		stage: 'winners',
		description: 'Initial heat — winners bracket',
		position: pos(0, 20),
		advanceTo: 11,
		dropTo: 15,
	},
	{
		order: 7,
		code: 'R1-7',
		name: 'Race 7',
		roundId: 'round1',
		roundLabel: 'Round 1',
		stage: 'winners',
		description: 'Initial heat — winners bracket',
		position: pos(0, 24),
		advanceTo: 12,
		dropTo: 16,
	},
	{
		order: 8,
		code: 'R1-8',
		name: 'Race 8',
		roundId: 'round1',
		roundLabel: 'Round 1',
		stage: 'winners',
		description: 'Initial heat — winners bracket',
		position: pos(0, 28),
		advanceTo: 12,
		dropTo: 16,
	},
	{
		order: 9,
		code: 'R2-1',
		name: 'Race 9',
		roundId: 'round2',
		roundLabel: 'Round 2',
		stage: 'winners',
		description: 'Winners bracket — quarterfinal',
		position: pos(1, 2),
		advanceTo: 23,
		dropTo: 17,
	},
	{
		order: 10,
		code: 'R2-2',
		name: 'Race 10',
		roundId: 'round2',
		roundLabel: 'Round 2',
		stage: 'winners',
		description: 'Winners bracket — quarterfinal',
		position: pos(1, 10),
		advanceTo: 23,
		dropTo: 18,
	},
	{
		order: 11,
		code: 'R2-3',
		name: 'Race 11',
		roundId: 'round2',
		roundLabel: 'Round 2',
		stage: 'winners',
		description: 'Winners bracket — quarterfinal',
		position: pos(1, 18),
		advanceTo: 24,
		dropTo: 19,
	},
	{
		order: 12,
		code: 'R2-4',
		name: 'Race 12',
		roundId: 'round2',
		roundLabel: 'Round 2',
		stage: 'winners',
		description: 'Winners bracket — quarterfinal',
		position: pos(1, 26),
		advanceTo: 24,
		dropTo: 20,
	},
	{
		order: 13,
		code: 'R3-1',
		name: 'Race 13',
		roundId: 'round3',
		roundLabel: 'Round 3',
		stage: 'redemption',
		description: 'Redemption entry — top three survive',
		position: pos(0, 32),
		advanceTo: 17,
	},
	{
		order: 14,
		code: 'R3-2',
		name: 'Race 14',
		roundId: 'round3',
		roundLabel: 'Round 3',
		stage: 'redemption',
		description: 'Redemption entry — top three survive',
		position: pos(0, 36),
		advanceTo: 18,
	},
	{
		order: 15,
		code: 'R3-3',
		name: 'Race 15',
		roundId: 'round3',
		roundLabel: 'Round 3',
		stage: 'redemption',
		description: 'Redemption entry — top three survive',
		position: pos(0, 40),
		advanceTo: 19,
	},
	{
		order: 16,
		code: 'R3-4',
		name: 'Race 16',
		roundId: 'round3',
		roundLabel: 'Round 3',
		stage: 'redemption',
		description: 'Redemption entry — top three survive',
		position: pos(0, 44),
		advanceTo: 20,
	},
	{
		order: 17,
		code: 'R4-1',
		name: 'Race 17',
		roundId: 'round4',
		roundLabel: 'Round 4',
		stage: 'redemption',
		description: 'Redemption consolidation',
		position: pos(1, 34),
		advanceTo: 21,
	},
	{
		order: 18,
		code: 'R4-2',
		name: 'Race 18',
		roundId: 'round4',
		roundLabel: 'Round 4',
		stage: 'redemption',
		description: 'Redemption consolidation',
		position: pos(1, 38),
		advanceTo: 21,
	},
	{
		order: 19,
		code: 'R4-3',
		name: 'Race 19',
		roundId: 'round4',
		roundLabel: 'Round 4',
		stage: 'redemption',
		description: 'Redemption consolidation',
		position: pos(1, 42),
		advanceTo: 22,
	},
	{
		order: 20,
		code: 'R4-4',
		name: 'Race 20',
		roundId: 'round4',
		roundLabel: 'Round 4',
		stage: 'redemption',
		description: 'Redemption consolidation',
		position: pos(1, 46),
		advanceTo: 22,
	},
	{
		order: 21,
		code: 'R5-1',
		name: 'Race 21',
		roundId: 'round5',
		roundLabel: 'Round 5',
		stage: 'redemption',
		description: 'Redemption qualifier final',
		position: pos(2, 36),
		advanceTo: 25,
	},
	{
		order: 22,
		code: 'R5-2',
		name: 'Race 22',
		roundId: 'round5',
		roundLabel: 'Round 5',
		stage: 'redemption',
		description: 'Redemption qualifier final',
		position: pos(2, 44),
		advanceTo: 26,
	},
	{
		order: 23,
		code: 'R6-1',
		name: 'Race 23',
		roundId: 'round6',
		roundLabel: 'Round 6',
		stage: 'winners',
		description: 'Winners semifinal',
		position: pos(2, 6),
		advanceTo: 28,
		dropTo: 25,
	},
	{
		order: 24,
		code: 'R6-2',
		name: 'Race 24',
		roundId: 'round6',
		roundLabel: 'Round 6',
		stage: 'winners',
		description: 'Winners semifinal',
		position: pos(2, 20),
		advanceTo: 28,
		dropTo: 26,
	},
	{
		order: 25,
		code: 'R7-1',
		name: 'Race 25',
		roundId: 'round7',
		roundLabel: 'Round 7',
		stage: 'redemption',
		description: 'Redemption semifinal',
		position: pos(3, 36),
		advanceTo: 27,
	},
	{
		order: 26,
		code: 'R7-2',
		name: 'Race 26',
		roundId: 'round7',
		roundLabel: 'Round 7',
		stage: 'redemption',
		description: 'Redemption semifinal',
		position: pos(3, 44),
		advanceTo: 27,
	},
	{
		order: 27,
		code: 'R8-1',
		name: 'Race 27',
		roundId: 'round8',
		roundLabel: 'Round 8',
		stage: 'redemption',
		description: 'Redemption final qualifier',
		position: pos(4, 40),
		advanceTo: 29,
	},
	{
		order: 28,
		code: 'R9-1',
		name: 'Race 28',
		roundId: 'round9',
		roundLabel: 'Round 9',
		stage: 'winners',
		description: 'Winners bracket final — podium lock-in',
		position: pos(4, 14),
		dropTo: 29,
	},
	{
		order: 29,
		code: 'R10-1',
		name: 'Race 29',
		roundId: 'round10',
		roundLabel: 'Round 10',
		stage: 'redemption',
		description: 'Redemption grand final — feeds finals pool',
		position: pos(5, 40),
	},
];

export interface BracketRoundDefinition {
	id: BracketRoundId;
	label: string;
	nodeOrders: number[];
}

export const BRACKET_ROUNDS: BracketRoundDefinition[] = [
	{ id: 'round1', label: 'Round 1', nodeOrders: [1, 2, 3, 4, 5, 6, 7, 8] },
	{ id: 'round2', label: 'Round 2', nodeOrders: [9, 10, 11, 12] },
	{
		id: 'round3',
		label: 'Round 3 (Redemption Entry)',
		nodeOrders: [13, 14, 15, 16],
	},
	{
		id: 'round4',
		label: 'Round 4 (Redemption Consolidation)',
		nodeOrders: [17, 18, 19, 20],
	},
	{ id: 'round5', label: 'Round 5', nodeOrders: [21, 22] },
	{ id: 'round6', label: 'Round 6 (Winners Semifinals)', nodeOrders: [23, 24] },
	{ id: 'round7', label: 'Round 7', nodeOrders: [25, 26] },
	{ id: 'round8', label: 'Round 8', nodeOrders: [27] },
	{ id: 'round9', label: 'Round 9 (Winners Final)', nodeOrders: [28] },
	{ id: 'round10', label: 'Round 10 (Redemption Final)', nodeOrders: [29] },
];

export interface BracketEdgeDefinition {
	from: number;
	to: number;
	type: 'advance' | 'drop';
}

export const BRACKET_EDGES: BracketEdgeDefinition[] = [
	{ from: 1, to: 9, type: 'advance' },
	{ from: 2, to: 9, type: 'advance' },
	{ from: 3, to: 10, type: 'advance' },
	{ from: 4, to: 10, type: 'advance' },
	{ from: 5, to: 11, type: 'advance' },
	{ from: 6, to: 11, type: 'advance' },
	{ from: 7, to: 12, type: 'advance' },
	{ from: 8, to: 12, type: 'advance' },
	{ from: 1, to: 13, type: 'drop' },
	{ from: 2, to: 13, type: 'drop' },
	{ from: 3, to: 14, type: 'drop' },
	{ from: 4, to: 14, type: 'drop' },
	{ from: 5, to: 15, type: 'drop' },
	{ from: 6, to: 15, type: 'drop' },
	{ from: 7, to: 16, type: 'drop' },
	{ from: 8, to: 16, type: 'drop' },
	{ from: 9, to: 23, type: 'advance' },
	{ from: 10, to: 23, type: 'advance' },
	{ from: 11, to: 24, type: 'advance' },
	{ from: 12, to: 24, type: 'advance' },
	{ from: 9, to: 17, type: 'drop' },
	{ from: 10, to: 18, type: 'drop' },
	{ from: 11, to: 19, type: 'drop' },
	{ from: 12, to: 20, type: 'drop' },
	{ from: 13, to: 17, type: 'advance' },
	{ from: 14, to: 18, type: 'advance' },
	{ from: 15, to: 19, type: 'advance' },
	{ from: 16, to: 20, type: 'advance' },
	{ from: 17, to: 21, type: 'advance' },
	{ from: 18, to: 21, type: 'advance' },
	{ from: 19, to: 22, type: 'advance' },
	{ from: 20, to: 22, type: 'advance' },
	{ from: 23, to: 28, type: 'advance' },
	{ from: 24, to: 28, type: 'advance' },
	{ from: 21, to: 25, type: 'advance' },
	{ from: 22, to: 26, type: 'advance' },
	{ from: 23, to: 25, type: 'drop' },
	{ from: 24, to: 26, type: 'drop' },
	{ from: 25, to: 27, type: 'advance' },
	{ from: 26, to: 27, type: 'advance' },
	{ from: 27, to: 29, type: 'advance' },
	{ from: 28, to: 29, type: 'drop' },
];

export const DIAGRAM_DIMENSIONS = (() => {
	const maxX = Math.max(...BRACKET_NODES.map((n) => n.position.x));
	const maxY = Math.max(...BRACKET_NODES.map((n) => n.position.y));
	return {
		width: maxX + COLUMN_UNIT + 200,
		height: maxY + ROW_UNIT + 300,
		nodeWidth: 240,
		nodeHeight: 300,
		columnUnit: COLUMN_UNIT,
		rowUnit: ROW_UNIT,
	};
})();
