import React from 'react';
import { ChannelSquare } from '../common/ChannelSquare.tsx';
import { CONSECUTIVE_LAPS } from '../race/race-utils.ts';
import { LeaderboardEntry } from './leaderboard-types.ts';
import {
    useLeaderboardState,
    useLeaderboardCalculations,
    useLeaderboardAnimation,
} from './leaderboard-hooks.ts';
import './Leaderboard.css';
import { RaceWithProcessedLaps } from '../state/atoms.ts';
import { Channel, Round } from '../types/types.ts';

// Helper function remains here for now
function formatTimeDifference(newTime: number, oldTime: number): string {
    const diff = oldTime - newTime;
    return diff > 0 ? `-${diff.toFixed(3)}` : `+${(-diff).toFixed(3)}`;
}

// --- Internal Sub-components defined within Leaderboard.tsx ---

interface PositionCellProps {
    pilotId: string;
    currentPosition: number;
    positionChanges: Map<string, number>;
}

const PositionCell: React.FC<PositionCellProps> = (
    { pilotId, currentPosition, positionChanges },
) => {
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
                {/* Optionally add indicator for position decrease if needed */}
            </div>
        </td>
    );
};

interface TimeDisplayCellProps {
    currentTime: { time: number; roundId: string; raceNumber: number } | null;
    previousTime: { time: number; roundId: string; raceNumber: number } | null;
    roundDataValue: Round[];
    currentRaceIndex: number;
    races: RaceWithProcessedLaps[]; // Need races to check if time is recent
}

const TimeDisplayCell: React.FC<TimeDisplayCellProps> = (
    { currentTime, previousTime, roundDataValue, currentRaceIndex, races },
) => {
    if (!currentTime) {
        return <td>-</td>;
    }

    // Logic from isRecentTime callback
    const raceIndex = races.findIndex((race) =>
        race.Round === currentTime.roundId && race.RaceNumber === currentTime.raceNumber
    );
    const isRecent = raceIndex === currentRaceIndex || raceIndex === currentRaceIndex - 1;

    const showDiff = previousTime && previousTime.time !== currentTime.time && isRecent;
    const roundInfo = roundDataValue.find((r) => r.ID === currentTime.roundId);
    const roundDisplay = roundInfo ? roundInfo.RoundNumber : '?';

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
};

interface ChannelDisplayCellProps {
    channel: Channel | null;
}

const ChannelDisplayCell: React.FC<ChannelDisplayCellProps> = ({ channel }) => {
    if (!channel) {
        return <td>-</td>;
    }
    return (
        <td>
            <div className='channel-display'>
                {channel.ShortBand}
                {channel.Number}
                <ChannelSquare channelID={channel.ID} />
            </div>
        </td>
    );
};

interface NextRaceCellProps {
    racesUntilNext: number;
    isEliminated: boolean;
}

const NextRaceCell: React.FC<NextRaceCellProps> = (
    { racesUntilNext, isEliminated },
) => {
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
};

interface LeaderboardRowProps {
    entry: LeaderboardEntry;
    previousEntry: LeaderboardEntry | undefined;
    isEliminated: boolean;
    isAnimating: boolean;
    position: number;
    positionChanges: Map<string, number>;
    roundDataValue: Round[];
    currentRaceIndex: number;
    races: RaceWithProcessedLaps[];
}

const LeaderboardRow: React.FC<LeaderboardRowProps> = (
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
    },
) => {
    return (
        <tr className={isAnimating ? 'position-improved' : ''}>
            <PositionCell
                pilotId={entry.pilot.ID}
                currentPosition={position}
                positionChanges={positionChanges}
            />
            <td>{entry.pilot.Name}</td>
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
            <TimeDisplayCell
                currentTime={entry.consecutiveLaps || null}
                previousTime={previousEntry?.consecutiveLaps || null}
                roundDataValue={roundDataValue}
                currentRaceIndex={currentRaceIndex}
                races={races}
            />
            <NextRaceCell racesUntilNext={entry.racesUntilNext} isEliminated={isEliminated} />
        </tr>
    );
};

interface LeaderboardTableProps {
    currentLeaderboard: LeaderboardEntry[];
    previousLeaderboard: LeaderboardEntry[];
    eliminatedPilots: { name: string }[];
    animatingRows: Set<string>;
    positionChanges: Map<string, number>;
    roundDataValue: Round[];
    currentRaceIndex: number;
    races: RaceWithProcessedLaps[];
}

const LeaderboardTable: React.FC<LeaderboardTableProps> = (
    {
        currentLeaderboard,
        previousLeaderboard,
        eliminatedPilots,
        animatingRows,
        positionChanges,
        roundDataValue,
        currentRaceIndex,
        races,
    },
) => {
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
                    const position = index + 1;

                    return (
                        <LeaderboardRow
                            key={entry.pilot.ID}
                            entry={entry}
                            previousEntry={previousEntry}
                            isEliminated={isEliminated}
                            isAnimating={animatingRows.has(entry.pilot.ID)}
                            position={position}
                            positionChanges={positionChanges}
                            roundDataValue={roundDataValue}
                            currentRaceIndex={currentRaceIndex}
                            races={races}
                        />
                    );
                })}
            </tbody>
        </table>
    );
};

// --- Main Exported Component ---

export const Leaderboard: React.FC = () => {
    // --- Hooks --- Use the new custom hooks
    const state = useLeaderboardState();
    const {
        currentRaceIndex,
        eliminatedPilots,
        currentLeaderboard,
        previousLeaderboard,
        positionChanges,
    } = useLeaderboardCalculations(state);
    const animatingRows = useLeaderboardAnimation(currentLeaderboard, positionChanges);

    // Destructure state needed by internal components
    const { roundDataValue, races } = state;

    // --- Render Logic --- Render the internal table component
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
                roundDataValue={roundDataValue}
                currentRaceIndex={currentRaceIndex}
                races={races} // Pass races down for isRecentTime logic
            />
        </div>
    );
};