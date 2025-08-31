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

export type Getter = <Value>(anAtom: Atom<Value>) => Awaited<Value>;

export type ValueGetter = (get: Getter, pilotId: string) => number | null;
export type Condition = (get: Getter, pilotId: string) => boolean;

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

