import rawDefinition from '../definitions/double-elim.json' with { type: 'json' };
import { parseBracketFormatDefinition } from './parse.ts';

export const DOUBLE_ELIM_6P_V1_FORMAT = parseBracketFormatDefinition(
	rawDefinition,
	'double-elim-6p-v1',
	'Double Elimination (6P v1)',
);
