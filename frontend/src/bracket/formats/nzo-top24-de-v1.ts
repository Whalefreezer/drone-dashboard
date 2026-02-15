import rawDefinition from '../definitions/nzo-top24-de-v1.json' with { type: 'json' };
import { parseBracketFormatDefinition } from './parse.ts';
import { computeDiagramDimensions } from './types.ts';

const SOURCE_COLUMN_UNIT = 380;
const SOURCE_VERTICAL_PITCH = 360;

const COLUMN_UNIT = SOURCE_COLUMN_UNIT * 2;
const NODE_HEIGHT = 220;
const NODE_VERTICAL_GAP = 30;
const NODE_VERTICAL_PITCH = NODE_HEIGHT + NODE_VERTICAL_GAP;
const ROW_UNIT = NODE_VERTICAL_PITCH / 4;

const parsed = parseBracketFormatDefinition(
	rawDefinition,
	'nzo-top24-de-v1',
	'NZO Top 24 Double Elimination',
);

const nodes = parsed.nodes.map((node) => ({
	...node,
	position: {
		x: (node.position.x / SOURCE_COLUMN_UNIT) * COLUMN_UNIT,
		y: (node.position.y / SOURCE_VERTICAL_PITCH) * NODE_VERTICAL_PITCH,
	},
}));

const diagramDimensions = {
	...computeDiagramDimensions(nodes, COLUMN_UNIT, ROW_UNIT),
	nodeWidth: 500,
	nodeHeight: NODE_HEIGHT,
};

export const NZO_TOP24_DE_V1_FORMAT = {
	...parsed,
	nodes,
	diagramDimensions,
};
