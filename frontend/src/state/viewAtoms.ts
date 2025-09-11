import { atomWithStorage } from 'jotai/utils';

export type DashboardPane = 'leaderboard' | 'races' | 'brackets' | 'eliminated';

export const activePaneAtom = atomWithStorage<DashboardPane>('activePane', 'leaderboard');
