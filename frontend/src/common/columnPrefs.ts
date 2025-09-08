import { atomWithStorage } from 'jotai/utils';
import type { PrimitiveAtom } from 'jotai';

// Cache atoms per table so all components share the same instance
const cache = new Map<string, PrimitiveAtom<string[]>>();

export function getColumnPrefsAtom(tableId: string, defaults: string[]) {
	const storageKey = `columns:${tableId}`;
	const existing = cache.get(storageKey);
	if (existing) return existing as PrimitiveAtom<string[]>;
	const atom = atomWithStorage<string[]>(storageKey, defaults);
	cache.set(storageKey, atom);
	return atom;
}
