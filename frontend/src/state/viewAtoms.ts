import { atomWithStorage } from 'jotai/utils';

export type DashboardPane = 'timeline' | 'leaderboard' | 'races' | 'brackets' | 'eliminated';

export const activePaneAtom = atomWithStorage<DashboardPane>('activePane', 'timeline');
