import { atomWithStorage } from 'jotai/utils';

export type DashboardPane = 'leaderboard' | 'races' | 'brackets' | 'eliminated';
export type RightPaneView = 'leaderboard' | 'brackets';

export const activePaneAtom = atomWithStorage<DashboardPane>('activePane', 'leaderboard');
export const rightPaneViewAtom = atomWithStorage<RightPaneView>('rightPaneView', 'leaderboard');
