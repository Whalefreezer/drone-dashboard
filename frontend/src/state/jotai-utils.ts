import { atomFamily, selectAtom } from 'jotai/utils';
import { type Atom } from 'jotai';
import deepEqual from 'fast-deep-equal';

// Helper for atomFamily with deep equality comparison
export const deepEqualAtomFamily = <T, A extends Atom<unknown>>(fn: (param: T) => A) => atomFamily(fn, deepEqual);

const identity = <T>(x: T) => x;
export const withCompare = <T>(anAtom: Atom<T>) => {
	const selected = selectAtom(anAtom, identity, deepEqual);
	return selected;
};
