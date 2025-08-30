import { useEffect, useState } from 'react';
import { LeaderboardEntry } from './leaderboard-types.ts';

export const useLeaderboardAnimation = (
    currentLeaderboard: LeaderboardEntry[],
    positionChanges: Map<string, number>,
): Set<string> => {
    const [animatingRows, setAnimatingRows] = useState<Set<string>>(new Set());

    useEffect(() => {
        const newAnimatingRows = new Set<string>();
        currentLeaderboard.forEach((entry, index) => {
            const prevPos = positionChanges.get(entry.pilot.id);
            // Animate if previous position exists and was worse (higher number) than current
            if (prevPos && prevPos > index + 1) {
                newAnimatingRows.add(entry.pilot.id);
            }
        });
        setAnimatingRows(newAnimatingRows);
        const timer = setTimeout(() => {
            setAnimatingRows(new Set());
        }, 1000); // Animation duration
        return () => clearTimeout(timer);
    }, [currentLeaderboard, positionChanges]);

    return animatingRows;
};
