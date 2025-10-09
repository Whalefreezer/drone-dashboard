import type { Atom, Getter } from 'jotai';

// Sorting primitives for atom-based leaderboard ordering

export enum SortDirection {
	Ascending = 'asc',
	Descending = 'desc',
}

export enum NullHandling {
	First = 'first',
	Last = 'last',
}

export type EagerGetter = Getter;

export type ValueGetter<TContext = void> = (get: EagerGetter, pilotId: string, context: TContext) => number | null;
export type Condition<TContext = void> = (get: EagerGetter, pilotId: string, context: TContext) => boolean;

export interface SortCriterion<TContext = void> {
	getValue: ValueGetter<TContext>;
	direction: SortDirection;
	nullHandling: NullHandling;
}

export interface SortGroup<TContext = void> {
	name: string;
	criteria: SortCriterion<TContext>[];
	condition?: Condition<TContext>;
	groups?: SortGroup<TContext>[];
}
