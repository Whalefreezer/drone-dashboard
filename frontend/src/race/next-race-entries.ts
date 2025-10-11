import { atom } from 'jotai';
import type { PBRaceRecord } from '../api/pbTypes.ts';
import type { BracketNodeDefinition } from '../bracket/doubleElimDefinition.ts';
import type { BracketDiagramViewModel } from '../bracket/eliminationState.ts';
import { bracketDiagramAtom } from '../bracket/eliminationState.ts';
import { currentOrderKVAtom } from '../state/pbAtoms.ts';
import { nextRacesAtom } from './race-atoms.ts';

export interface NextRaceEntry {
	raceId: string;
	race: PBRaceRecord | null;
	definition: BracketNodeDefinition | null;
	isPredicted: boolean;
}

const MAX_NEXT_RACES = 8;

export function buildNextRaceEntries(
	nextRaces: PBRaceRecord[],
	diagram: BracketDiagramViewModel,
	currentOrder: number,
	maxEntries: number = MAX_NEXT_RACES,
): NextRaceEntry[] {
	const entries: NextRaceEntry[] = [];
	const seenIds = new Set<string>();

	for (const race of nextRaces) {
		const node = diagram.nodes.find((n) => n.race?.id === race.id) ?? null;
		entries.push({
			raceId: race.id,
			race,
			definition: node?.definition ?? null,
			isPredicted: false,
		});
		seenIds.add(race.id);
		if (entries.length >= maxEntries) {
			return entries;
		}
	}

	const predictedNodes = diagram.nodes
		.filter((node) =>
			!node.race &&
			node.slots.some((slot) => slot.isPredicted) &&
			node.definition.order > currentOrder
		)
		.sort((a, b) => a.definition.order - b.definition.order);

	for (const node of predictedNodes) {
		if (entries.length >= maxEntries) break;
		const predictedId = `predicted-race-${node.definition.order}`;
		if (seenIds.has(predictedId)) continue;
		entries.push({
			raceId: predictedId,
			race: null,
			definition: node.definition,
			isPredicted: true,
		});
		seenIds.add(predictedId);
	}

	return entries;
}

export const nextRaceEntriesAtom = atom((get): NextRaceEntry[] => {
	const nextRaces = get(nextRacesAtom);
	const diagram = get(bracketDiagramAtom);
	const currentOrder = get(currentOrderKVAtom)?.order ?? 0;
	return buildNextRaceEntries(nextRaces, diagram, currentOrder, MAX_NEXT_RACES);
});
