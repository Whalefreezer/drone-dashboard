import type { Atom } from 'jotai';

// Sorting primitives for atom-based leaderboard ordering

export enum SortDirection {
    Ascending = 'asc',
    Descending = 'desc',
}

export enum NullHandling {
    First = 'first',
    Last = 'last',
}

export type EagerGetter = <Value>(anAtom: Atom<Value>) => Awaited<Value>;

export type ValueGetter = (get: EagerGetter, pilotId: string) => number | null;
export type Condition = (get: EagerGetter, pilotId: string) => boolean;

export interface SortCriterion {
    getValue: ValueGetter;
    direction: SortDirection;
    nullHandling: NullHandling;
}

export interface SortGroup {
    name: string;
    criteria: SortCriterion[];
    condition?: Condition;
    groups?: SortGroup[];
}

