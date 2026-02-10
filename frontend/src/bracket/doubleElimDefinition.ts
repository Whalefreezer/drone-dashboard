import { DOUBLE_ELIM_6P_V1_FORMAT } from './formats/double-elim-6p-v1.ts';

export type {
	BracketEdgeDefinition,
	BracketFormatDefinition,
	BracketNodeDefinition,
	BracketRoundDefinition,
	BracketStage,
	DiagramDimensions,
} from './formats/types.ts';

export const BRACKET_NODES = DOUBLE_ELIM_6P_V1_FORMAT.nodes;
export const BRACKET_ROUNDS = DOUBLE_ELIM_6P_V1_FORMAT.rounds;
export const BRACKET_EDGES = DOUBLE_ELIM_6P_V1_FORMAT.edges;
export const DIAGRAM_DIMENSIONS = DOUBLE_ELIM_6P_V1_FORMAT.diagramDimensions;
