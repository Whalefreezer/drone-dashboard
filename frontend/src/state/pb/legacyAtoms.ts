import { atomWithSuspenseQuery } from 'jotai-tanstack-query';
import { Bracket } from '../../bracket/bracket-types.ts';

/**
 * @deprecated Legacy brackets data atom - bracket elimination logic now uses locked positions
 * Retained for backward compatibility with existing bracket display components
 */
export const bracketsDataAtom = atomWithSuspenseQuery<Bracket[]>(() => ({
	queryKey: ['bracketsData'],
	queryFn: () => {
		// const response = await axios.get(`/brackets/groups/0`);
		// return response.data as Bracket[];
		return [] as Bracket[];
	},
	// staleTime: 10_000,
	// refetchInterval: 10_000,
}));
