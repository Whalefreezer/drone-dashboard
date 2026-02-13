import { atomWithStorage } from 'jotai/utils';

export type DashboardPane = 'leaderboard' | 'races' | 'brackets' | 'eliminated' | 'prize';
export type RightPaneView = 'leaderboard' | 'brackets' | 'prize';

export const activePaneAtom = atomWithStorage<DashboardPane>('activePane', 'leaderboard');
export const rightPaneViewAtom = atomWithStorage<RightPaneView>('rightPaneView', 'leaderboard');
