export type BracketStage = 'winners' | 'redemption';

export interface BracketNodeDefinition {
	order: number;
	code: string;
	name: string;
	roundId: string;
	roundLabel: string;
	stage: BracketStage;
	description: string;
	slotCount: number;
	position: { x: number; y: number };
	progressionRules: {
		positions: number[];
		destination: number | 'out' | 'final';
	}[];
}

export interface BracketRoundDefinition {
	id: string;
	label: string;
	nodeOrders: number[];
}

export interface BracketEdgeDefinition {
	from: number;
	to: number;
	type: 'advance' | 'drop';
}

export interface DiagramDimensions {
	width: number;
	height: number;
	nodeWidth: number;
	nodeHeight: number;
	columnUnit: number;
	rowUnit: number;
}

export interface BracketFormatDefinition {
	id: string;
	label: string;
	nodes: BracketNodeDefinition[];
	rounds: BracketRoundDefinition[];
	edges: BracketEdgeDefinition[];
	runSequence?: number[];
	diagramDimensions: DiagramDimensions;
}

export const DEFAULT_COLUMN_UNIT = 380;
export const DEFAULT_ROW_UNIT = 90;

export function computeDiagramDimensions(
	nodes: BracketNodeDefinition[],
	columnUnit: number = DEFAULT_COLUMN_UNIT,
	rowUnit: number = DEFAULT_ROW_UNIT,
): DiagramDimensions {
	const maxX = Math.max(...nodes.map((node) => node.position.x));
	const maxY = Math.max(...nodes.map((node) => node.position.y));
	return {
		width: maxX + columnUnit + 200,
		height: maxY + rowUnit + 300,
		nodeWidth: 300,
		nodeHeight: 220,
		columnUnit,
		rowUnit,
	};
}
