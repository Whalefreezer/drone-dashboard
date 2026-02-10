import rawDefinition from '../definitions/nzo-top24-de-v1.json' with { type: 'json' };
import { parseBracketFormatDefinition } from './parse.ts';

export const NZO_TOP24_DE_V1_FORMAT = parseBracketFormatDefinition(
	rawDefinition,
	'nzo-top24-de-v1',
	'NZO Top 24 Double Elimination',
);
