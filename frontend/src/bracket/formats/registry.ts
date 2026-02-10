import { BracketFormatDefinition } from './types.ts';
import { DOUBLE_ELIM_6P_V1_FORMAT } from './double-elim-6p-v1.ts';
import { NZO_TOP24_DE_V1_FORMAT } from './nzo-top24-de-v1.ts';

export const DEFAULT_BRACKET_FORMAT_ID = DOUBLE_ELIM_6P_V1_FORMAT.id;

const FORMATS: BracketFormatDefinition[] = [
	DOUBLE_ELIM_6P_V1_FORMAT,
	NZO_TOP24_DE_V1_FORMAT,
];

const FORMAT_BY_ID = new Map(FORMATS.map((format) => [format.id, format]));

export function getBracketFormatById(formatId: string | null | undefined): BracketFormatDefinition {
	if (!formatId) return DOUBLE_ELIM_6P_V1_FORMAT;
	return FORMAT_BY_ID.get(formatId) ?? DOUBLE_ELIM_6P_V1_FORMAT;
}

export function listBracketFormats(): BracketFormatDefinition[] {
	return FORMATS;
}
