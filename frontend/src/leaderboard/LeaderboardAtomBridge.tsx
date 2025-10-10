import { useAtomValue, useSetAtom } from 'jotai';
import { useEffect } from 'react';
import {
	leaderboardPilotIdsAtom,
	leaderboardPilotIdsStateAtom,
	previousLeaderboardPilotIdsAtom,
	previousLeaderboardPilotIdsStateAtom,
} from './leaderboard-atoms.ts';

export function LeaderboardAtomBridge(): null {
	const currentIds = useAtomValue(leaderboardPilotIdsAtom);
	const previousIds = useAtomValue(previousLeaderboardPilotIdsAtom);
	const setCurrentIds = useSetAtom(leaderboardPilotIdsStateAtom);
	const setPreviousIds = useSetAtom(previousLeaderboardPilotIdsStateAtom);

	useEffect(() => {
		setCurrentIds(currentIds);
	}, [currentIds, setCurrentIds]);

	useEffect(() => {
		setPreviousIds(previousIds);
	}, [previousIds, setPreviousIds]);

	return null;
}
