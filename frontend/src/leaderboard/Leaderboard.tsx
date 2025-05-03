import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAtomValue } from 'jotai';
import { useQueryAtom } from '../state/hooks.ts';
import './Leaderboard.css'; // Import the moved styles
import {
    racesAtom,
    pilotsAtom,
    channelsDataAtom,
    roundsDataAtom,
    bracketsDataAtom,
    findEliminatedPilots,
} from '../state/index.ts';
import { findIndexOfCurrentRace } from '../common/index.ts';
import { CONSECUTIVE_LAPS } from '../common/utils.ts';
import { ChannelSquare } from '../common/ChannelSquare.tsx';
import { Pilot, Channel, Bracket, Round } from '../types/index.ts'; // Assuming Round is here
import { calculateLeaderboardData, getPositionChanges } from './leaderboard-logic.ts';
import { LeaderboardEntry } from './leaderboard-types.ts';

// Helper function moved from App.tsx
function formatTimeDifference(newTime: number, oldTime: number): string {
    const diff = oldTime - newTime;
    return diff > 0 ? `-${diff.toFixed(3)}` : `+${(-diff).toFixed(3)}`;
}

export const Leaderboard: React.FC = () => {
    // --- Hooks and State --- 
    const races = useAtomValue(racesAtom);
    const pilots = useAtomValue(pilotsAtom);
    const channels = useAtomValue(channelsDataAtom);
    const roundDataValue = useAtomValue(roundsDataAtom); // Renamed to avoid conflict with Round type
    const currentRaceIndex = findIndexOfCurrentRace(races);
    const brackets = useQueryAtom(bracketsDataAtom);
    const eliminatedPilots = findEliminatedPilots(brackets);
    const [animatingRows, setAnimatingRows] = useState<Set<string>>(new Set());

    // --- Memoized Calculations --- 
    const [currentLeaderboard, previousLeaderboard] = useMemo(() => {
        const current = calculateLeaderboardData(
            races,
            pilots,
            channels,
            currentRaceIndex,
            brackets,
        );
        const previous = calculateLeaderboardData(
            races.slice(0, Math.max(0, currentRaceIndex - 1)),
            pilots,
            channels,
            currentRaceIndex - 2,
            brackets,
        );
        return [current, previous];
    }, [races, pilots, channels, currentRaceIndex, brackets]);

    const positionChanges = useMemo(
        () => getPositionChanges(currentLeaderboard, previousLeaderboard),
        [currentLeaderboard, previousLeaderboard],
    );

    // --- Callbacks --- 
    const isRecentTime = useCallback((roundId: string, raceNumber: number) => {
        const raceIndex = races.findIndex((race) =>
            race.Round === roundId && race.RaceNumber === raceNumber
        );
        return raceIndex === currentRaceIndex || raceIndex === currentRaceIndex - 1;
    }, [races, currentRaceIndex]);

    const renderPositionChange = useCallback((pilotId: string, currentPos: number) => {
        const prevPos = positionChanges.get(pilotId);
        if (!prevPos || prevPos === currentPos) return null;
        const change = prevPos - currentPos;
        if (change <= 0) return null;
        return (
            <span className='position-change'>
                ↑{change} from {prevPos}
            </span>
        );
    }, [positionChanges]);

    const renderTimeWithDiff = useCallback((
        currentTime: { time: number; roundId: string; raceNumber: number } | null,
        previousTime: { time: number; roundId: string; raceNumber: number } | null,
        isRecent: boolean,
    ) => {
        if (!currentTime) return '-';
        const showDiff = previousTime &&
            previousTime.time !== currentTime.time &&
            isRecent;
        // Find round number - ensure roundDataValue is used
        const roundInfo = roundDataValue.find((r) => r.ID === currentTime.roundId);
        const roundDisplay = roundInfo ? roundInfo.RoundNumber : '?';

        return (
            <div
                className={isRecent ? 'recent-time' : ''}
                style={{ display: 'flex', flexDirection: 'column' }}
            >
                <div>
                    {currentTime.time.toFixed(3)}
                    <span className='source-info'>
                        ({roundDisplay}-{currentTime.raceNumber})
                    </span>
                </div>
                {showDiff && (
                    <div
                        style={{
                            fontSize: '0.8em',
                            color: previousTime.time > currentTime.time ? '#00ff00' : '#ff0000',
                        }}
                    >
                        {formatTimeDifference(currentTime.time, previousTime.time)}
                    </div>
                )}
            </div>
        );
    }, [roundDataValue]); // Dependency updated

    // --- Effect for Animation --- 
    useEffect(() => {
        const newAnimatingRows = new Set<string>();
        currentLeaderboard.forEach((entry, index) => {
            const prevPos = positionChanges.get(entry.pilot.ID);
            if (prevPos && prevPos > index + 1) {
                newAnimatingRows.add(entry.pilot.ID);
            }
        });
        setAnimatingRows(newAnimatingRows);
        const timer = setTimeout(() => {
            setAnimatingRows(new Set());
        }, 1000);
        return () => clearTimeout(timer);
    }, [currentLeaderboard, positionChanges]);

    // --- Render Logic --- 
    if (races.length === 0) {
        return (
            <div className='leaderboard-container'> {/* Use container class */} 
                <h3>Fastest Laps Overall</h3>
                <div>No races available</div>
            </div>
        );
    }

    return (
        <div className='leaderboard-container'> {/* Use container class */} 
            {/* Optional Title or other elements here */}
            <table className='leaderboard-table'>
                <thead>
                    <tr>
                        <th>Pos</th>
                        <th>Pilot</th>
                        <th>Chan</th>
                        <th>Laps</th>
                        <th>Holeshot</th>
                        <th>Top Lap</th>
                        <th>Top {CONSECUTIVE_LAPS} Consec</th>
                        <th>Next Race In</th>
                    </tr>
                </thead>
                <tbody>
                    {currentLeaderboard.map((entry, index) => {
                        const previousEntry = previousLeaderboard.find(
                            (prev) => prev.pilot.ID === entry.pilot.ID,
                        );
                        const isEliminated = eliminatedPilots.some(
                            (pilot) =>
                                pilot.name.toLowerCase().replace(/\s+/g, '') ===
                                    entry.pilot.Name.toLowerCase().replace(/\s+/g, ''),
                        );

                        return (
                            <tr
                                key={entry.pilot.ID}
                                className={animatingRows.has(entry.pilot.ID) ? 'position-improved' : ''}
                            >
                                <td>
                                    <div className='position-container'>
                                        <div>{index + 1}</div>
                                        {renderPositionChange(entry.pilot.ID, index + 1)}
                                    </div>
                                </td>
                                <td>{entry.pilot.Name}</td>
                                <td>
                                    {entry.channel
                                        ? (
                                            <div className='channel-display'>
                                                {entry.channel.ShortBand}
                                                {entry.channel.Number}
                                                <ChannelSquare channelID={entry.channel.ID} />
                                            </div>
                                        )
                                        : '-'}
                                </td>
                                <td>{entry.totalLaps}</td>
                                <td>
                                    {renderTimeWithDiff(
                                        entry.bestHoleshot || null,
                                        previousEntry?.bestHoleshot || null,
                                        entry.bestHoleshot
                                            ? isRecentTime(
                                                entry.bestHoleshot.roundId,
                                                entry.bestHoleshot.raceNumber,
                                            )
                                            : false,
                                    )}
                                </td>
                                <td>
                                    {renderTimeWithDiff(
                                        entry.bestLap || null,
                                        previousEntry?.bestLap || null,
                                        entry.bestLap
                                            ? isRecentTime(
                                                entry.bestLap.roundId,
                                                entry.bestLap.raceNumber,
                                            )
                                            : false,
                                    )}
                                </td>
                                <td>
                                    {renderTimeWithDiff(
                                        entry.consecutiveLaps || null,
                                        previousEntry?.consecutiveLaps || null,
                                        entry.consecutiveLaps
                                            ? isRecentTime(
                                                entry.consecutiveLaps.roundId,
                                                entry.consecutiveLaps.raceNumber,
                                            )
                                            : false,
                                    )}
                                </td>
                                <td>
                                    {entry.racesUntilNext === -1 && isEliminated
                                        ? <span className='done-text'>Done</span>
                                        : entry.racesUntilNext === -1
                                        ? '-'
                                        : entry.racesUntilNext === 0
                                        ? <span className='next-text'>To Staging</span>
                                        : entry.racesUntilNext === -2
                                        ? <span className='racing-text'>Racing</span>
                                        : `${entry.racesUntilNext}`}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}; 