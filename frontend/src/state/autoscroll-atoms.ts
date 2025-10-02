import { atomWithStorage } from 'jotai/utils';

// Atom for managing autoscroll state with localStorage persistence
export const leaderboardAutoscrollEnabledAtom = atomWithStorage<boolean>(
	'leaderboard-autoscroll-enabled',
	true,
);
