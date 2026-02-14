import rawDefinition from '../definitions/nzo-top24-de-v1.json' with { type: 'json' };
import { parseBracketFormatDefinition } from './parse.ts';
import { computeDiagramDimensions } from './types.ts';

const parsed = parseBracketFormatDefinition(
	rawDefinition,
	'nzo-top24-de-v1',
	'NZO Top 24 Double Elimination',
);

const nodes = parsed.nodes.map((node) => ({
	...node,
	position: {
		x: node.position.x * 2,
		y: node.position.y,
	},
}));

const diagramDimensions = {
	...computeDiagramDimensions(nodes, 760, 90),
	nodeWidth: 500,
};

export const NZO_TOP24_DE_V1_FORMAT = {
	...parsed,
	nodes,
	diagramDimensions,
};
