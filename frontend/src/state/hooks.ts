import { Atom, useAtomValue } from 'jotai';
import { AtomWithSuspenseQueryResult } from 'jotai-tanstack-query';

// Custom hook to simplify accessing data from atoms created with atomWithSuspenseQuery
export function useQueryAtom<T>(queryAtom: Atom<AtomWithSuspenseQueryResult<T, Error>>): T {
    const { data } = useAtomValue(queryAtom);
    return data;
} 