import React from 'react';
import { ChannelSquare } from '../common/ChannelSquare.tsx';
import { LeaderboardEntry } from './leaderboard-types.ts';
import {
    useLeaderboardAnimation,
    useLeaderboardCalculations,
    useLeaderboardState,
} from './leaderboard-hooks.ts';
import './Leaderboard.css';
import { RaceWithProcessedLaps, consecutiveLapsAtom } from '../state/atoms.ts';
import type { PBChannelRecord, PBRoundRecord } from '../api/pbTypes.ts';
import { useAtomValue } from 'jotai';

export function Leaderboard() {
    const state = useLeaderboardState();
    const consecutiveLaps = useAtomValue(consecutiveLapsAtom);
    const {
        currentRaceIndex,
        eliminatedPilots,
        currentLeaderboard,
        previousLeaderboard,
        positionChanges,
    } = useLeaderboardCalculations(state);
    const animatingRows = useLeaderboardAnimation(currentLeaderboard, positionChanges);

    if (state.races.length === 0) {
        return (
            <div className='leaderboard-container'>
                <h3>Fastest Laps Overall</h3>
                <div>No races available</div>
            </div>
        );
    }

    return (
        <div className='leaderboard-container'>
            <LeaderboardTable
                currentLeaderboard={currentLeaderboard}
                previousLeaderboard={previousLeaderboard}
                eliminatedPilots={eliminatedPilots}
                animatingRows={animatingRows}
                positionChanges={positionChanges}
                roundDataValue={state.roundDataValue}
                currentRaceIndex={currentRaceIndex}
                races={state.races}
                consecutiveLaps={consecutiveLaps}
            />
        </div>
    );
}

interface LeaderboardTableProps {
    currentLeaderboard: LeaderboardEntry[];
    previousLeaderboard: LeaderboardEntry[];
    eliminatedPilots: { name: string }[];
    animatingRows: Set<string>;
    positionChanges: Map<string, number>;
    roundDataValue: PBRoundRecord[];
    currentRaceIndex: number;
    races: RaceWithProcessedLaps[];
    consecutiveLaps: number;
}

function LeaderboardTable(
    {
        currentLeaderboard,
        previousLeaderboard,
        eliminatedPilots,
        animatingRows,
        positionChanges,
        roundDataValue,
        currentRaceIndex,
        races,
        consecutiveLaps,
    }: LeaderboardTableProps,
) {
    return (
        <table className='leaderboard-table'>
            <thead>
                <tr>
                    <th>Pos</th>
                    <th>Pilot</th>
                    <th>Chan</th>
                    <th>Laps</th>
                    <th>Holeshot</th>
                    <th>Top Lap</th>
                    {consecutiveLaps > 1 && <th>Top {consecutiveLaps} Consec</th>}
                    <th>Fastest Race</th>
                    <th>Next Race In</th>
                </tr>
            </thead>
            <tbody>
                {currentLeaderboard.map((entry, index) => {
                    const previousEntry = previousLeaderboard.find((prev) => prev.pilot.id === entry.pilot.id);
                    const isEliminated = eliminatedPilots.some(
                        (pilot) =>
                            pilot.name.toLowerCase().replace(/\s+/g, '') ===
                                entry.pilot.name.toLowerCase().replace(/\s+/g, ''),
                    );
                    const position = index + 1;

                    return (
                        <LeaderboardRow
                            key={entry.pilot.id}
                            entry={entry}
                            previousEntry={previousEntry}
                            isEliminated={isEliminated}
                            isAnimating={animatingRows.has(entry.pilot.id)}
                            position={position}
                            positionChanges={positionChanges}
                            roundDataValue={roundDataValue}
                            currentRaceIndex={currentRaceIndex}
                            races={races}
                            consecutiveLaps={consecutiveLaps}
                        />
                    );
                })}
            </tbody>
        </table>
    );
}

interface LeaderboardRowProps {
    entry: LeaderboardEntry;
    previousEntry: LeaderboardEntry | undefined;
    isEliminated: boolean;
    isAnimating: boolean;
    position: number;
    positionChanges: Map<string, number>;
    roundDataValue: PBRoundRecord[];
    currentRaceIndex: number;
    races: RaceWithProcessedLaps[];
    consecutiveLaps: number;
}

function LeaderboardRow(
    {
        entry,
        previousEntry,
        isEliminated,
        isAnimating,
        position,
        positionChanges,
        roundDataValue,
        currentRaceIndex,
        races,
        consecutiveLaps,
    }: LeaderboardRowProps,
) {
    return (
        <tr className={isAnimating ? 'position-improved' : ''}>
            <PositionCell
                pilotId={entry.pilot.id}
                currentPosition={position}
                positionChanges={positionChanges}
            />
            <td>{entry.pilot.name}</td>
            <ChannelDisplayCell channel={entry.channel || null} />
            <td>{entry.totalLaps}</td>
            <TimeDisplayCell
                currentTime={entry.bestHoleshot || null}
                previousTime={previousEntry?.bestHoleshot || null}
                roundDataValue={roundDataValue}
                currentRaceIndex={currentRaceIndex}
                races={races}
            />
            <TimeDisplayCell
                currentTime={entry.bestLap || null}
                previousTime={previousEntry?.bestLap || null}
                roundDataValue={roundDataValue}
                currentRaceIndex={currentRaceIndex}
                races={races}
            />
            {consecutiveLaps > 1 && (
                <TimeDisplayCell
                    currentTime={entry.consecutiveLaps || null}
                    previousTime={previousEntry?.consecutiveLaps || null}
                    roundDataValue={roundDataValue}
                    currentRaceIndex={currentRaceIndex}
                    races={races}
                />
            )}
            <TimeDisplayCell
                currentTime={entry.fastestTotalRaceTime || null}
                previousTime={previousEntry?.fastestTotalRaceTime || null}
                roundDataValue={roundDataValue}
                currentRaceIndex={currentRaceIndex}
                races={races}
            />
            <NextRaceCell racesUntilNext={entry.racesUntilNext} isEliminated={isEliminated} />
        </tr>
    );
}

interface PositionCellProps {
    pilotId: string;
    currentPosition: number;
    positionChanges: Map<string, number>;
}

function PositionCell(
    { pilotId, currentPosition, positionChanges }: PositionCellProps,
) {
    const prevPos = positionChanges.get(pilotId);
    const showChange = prevPos && prevPos !== currentPosition;
    const change = showChange ? prevPos - currentPosition : 0;

    return (
        <td>
            <div className='position-container'>
                <div>{currentPosition}</div>
                {showChange && change > 0 && (
                    <span className='position-change'>
                        ↑{change} from {prevPos}
                    </span>
                )}
            </div>
        </td>
    );
}

interface ChannelDisplayCellProps {
    channel: PBChannelRecord | null;
}

function ChannelDisplayCell({ channel }: ChannelDisplayCellProps) {
    if (!channel) {
        return <td>-</td>;
    }
    return (
        <td>
            <div className='channel-display'>
                {channel.shortBand}
                {channel.number}
                {/* Prefer PB id; ChannelSquare will fallback to sourceId if needed */}
                <ChannelSquare channelID={channel.id} />
            </div>
        </td>
    );
}

interface TimeDisplayCellProps {
    currentTime: { time: number; roundId: string; raceNumber: number } | null;
    previousTime: { time: number; roundId: string; raceNumber: number } | null;
    roundDataValue: PBRoundRecord[];
    currentRaceIndex: number;
    races: RaceWithProcessedLaps[]; // Need races to check if time is recent
}

function TimeDisplayCell(
    { currentTime, previousTime, roundDataValue, currentRaceIndex, races }: TimeDisplayCellProps,
) {
    if (!currentTime) {
        return <td>-</td>;
    }

    // Logic from isRecentTime callback
    const raceIndex = races.findIndex((race) =>
        race.Round === currentTime.roundId && race.RaceNumber === currentTime.raceNumber
    );
    const isRecent = raceIndex === currentRaceIndex || raceIndex === currentRaceIndex - 1;

    const showDiff = previousTime && previousTime.time !== currentTime.time && isRecent;
    const roundInfo = roundDataValue.find((r) => r.id === currentTime.roundId);
    const roundDisplay = roundInfo ? roundInfo.roundNumber : '?';

    return (
        <td>
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
                {showDiff && previousTime && (
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
        </td>
    );
}

function formatTimeDifference(newTime: number, oldTime: number): string {
    const diff = oldTime - newTime;
    return diff > 0 ? `-${diff.toFixed(3)}` : `+${(-diff).toFixed(3)}`;
}

interface NextRaceCellProps {
    racesUntilNext: number;
    isEliminated: boolean;
}

function NextRaceCell(
    { racesUntilNext, isEliminated }: NextRaceCellProps,
) {
    let content: React.ReactNode;
    if (racesUntilNext === -1 && isEliminated) {
        content = <span className='done-text'>Done</span>;
    } else if (racesUntilNext === -1) {
        content = '-';
    } else if (racesUntilNext === 0) {
        content = <span className='next-text'>To Staging</span>;
    } else if (racesUntilNext === -2) {
        content = <span className='racing-text'>Racing</span>;
    } else {
        content = `${racesUntilNext}`;
    }

    return <td>{content}</td>;
}
