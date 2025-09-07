import { atomWithStorage } from 'jotai/utils';

export type DashboardPane = 'leaderboard' | 'current' | 'next' | 'brackets' | 'eliminated';

export const activePaneAtom = atomWithStorage<DashboardPane>('activePane', 'leaderboard');
