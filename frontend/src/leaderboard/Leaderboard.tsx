import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChannelSquare } from '../common/ChannelSquare.tsx';
import { LeaderboardEntry } from './leaderboard-types.ts';
import {
    useLeaderboardAnimation,
    useLeaderboardCalculations,
    useLeaderboardState,
} from './leaderboard-hooks.ts';
import './Leaderboard.css';
import { consecutiveLapsAtom } from '../state/atoms.ts';
import type { RaceData } from '../race/race-types.ts';
import type { PBChannelRecord, PBRoundRecord } from '../api/pbTypes.ts';
import { useAtomValue } from 'jotai';

interface OverflowFadeCellProps {
    children: React.ReactNode;
    className?: string;
    title?: string;
}

function OverflowFadeCell({ children, className = '', title }: OverflowFadeCellProps) {
    const [hasOverflow, setHasOverflow] = useState(false);
    const cellRef = useRef<HTMLTableCellElement>(null);

    useEffect(() => {
        const checkOverflow = () => {
            if (cellRef.current) {
                const { scrollWidth, clientWidth } = cellRef.current;
                setHasOverflow(scrollWidth > clientWidth);
            }
        };

        // Check overflow after component mounts and when content changes
        checkOverflow();

        // Also check on window resize
        globalThis.addEventListener('resize', checkOverflow);
        return () => globalThis.removeEventListener('resize', checkOverflow);
    }, [children]);

    return (
        <td
            ref={cellRef}
            className={`${className} ${hasOverflow ? 'fade-overflow' : ''}`.trim()}
            title={title}
        >
            {children}
        </td>
    );
}

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
    races: RaceData[];
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
    // Build a single source-of-truth column definition used by header and rows
    const columns = useMemo(() => getColumns({ consecutiveLaps }), [consecutiveLaps]);

    return (
        <table className='leaderboard-table'>
            <thead>
                <tr>
                    {columns.map((col) => (
                        <th key={col.key}>
                            {typeof col.header === 'function'
                                ? col.header({ consecutiveLaps })
                                : col.header}
                        </th>
                    ))}
                </tr>
            </thead>
            <tbody>
                {currentLeaderboard.map((entry, index) => {
                    const previousEntry = previousLeaderboard.find((prev) =>
                        prev.pilot.id === entry.pilot.id
                    );
                    const isEliminated = eliminatedPilots.some(
                        (pilot) =>
                            pilot.name.toLowerCase().replace(/\s+/g, '') ===
                                entry.pilot.name.toLowerCase().replace(/\s+/g, ''),
                    );
                    const position = index + 1;

                    const rowContext: LeaderboardRowProps = {
                        entry,
                        previousEntry,
                        isEliminated,
                        isAnimating: animatingRows.has(entry.pilot.id),
                        position,
                        positionChanges,
                        roundDataValue,
                        currentRaceIndex,
                        races,
                        consecutiveLaps,
                    };

                    return (
                        <tr
                            key={entry.pilot.id}
                            className={rowContext.isAnimating ? 'position-improved' : ''}
                        >
                            {columns.map((col) => (
                                <React.Fragment key={`${entry.pilot.id}-${col.key}`}>
                                    {col.cell(rowContext)}
                                </React.Fragment>
                            ))}
                        </tr>
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
    races: RaceData[];
    consecutiveLaps: number;
}

// Central column definition
type TableContext = { consecutiveLaps: number };
type Column = {
    key: string;
    header: string | ((ctx: TableContext) => React.ReactNode);
    cell: (ctx: LeaderboardRowProps) => React.ReactNode;
};

function getColumns(ctx: TableContext): Column[] {
    const cols: Column[] = [
        {
            key: 'position',
            header: 'Pos',
            cell: ({ entry, position, positionChanges }) => (
                <PositionCell
                    pilotId={entry.pilot.id}
                    currentPosition={position}
                    positionChanges={positionChanges}
                />
            ),
        },
        {
            key: 'pilot',
            header: 'Pilot',
            cell: ({ entry }) => (
                <OverflowFadeCell title={entry.pilot.name}>{entry.pilot.name}</OverflowFadeCell>
            ),
        },
        {
            key: 'channel',
            header: 'Chan',
            cell: ({ entry }) => <ChannelDisplayCell channel={entry.channel || null} />,
        },
        {
            key: 'laps',
            header: 'Laps',
            cell: ({ entry }) => <td>{entry.totalLaps}</td>,
        },
        {
            key: 'holeshot',
            header: 'Holeshot',
            cell: ({ entry, previousEntry, roundDataValue, currentRaceIndex, races }) => (
                <TimeDisplayCell
                    currentTime={entry.bestHoleshot || null}
                    previousTime={previousEntry?.bestHoleshot || null}
                    roundDataValue={roundDataValue}
                    currentRaceIndex={currentRaceIndex}
                    races={races}
                />
            ),
        },
        {
            key: 'top-lap',
            header: 'Top Lap',
            cell: ({ entry, previousEntry, roundDataValue, currentRaceIndex, races }) => (
                <TimeDisplayCell
                    currentTime={entry.bestLap || null}
                    previousTime={previousEntry?.bestLap || null}
                    roundDataValue={roundDataValue}
                    currentRaceIndex={currentRaceIndex}
                    races={races}
                />
            ),
        },
        // consecutive laps column is conditional
        ...(ctx.consecutiveLaps > 1
            ? [{
                key: 'consec',
                header: () => `Top ${ctx.consecutiveLaps} Consec`,
                cell: ({ entry, previousEntry, roundDataValue, currentRaceIndex, races }) => (
                    <TimeDisplayCell
                        currentTime={entry.consecutiveLaps || null}
                        previousTime={previousEntry?.consecutiveLaps || null}
                        roundDataValue={roundDataValue}
                        currentRaceIndex={currentRaceIndex}
                        races={races}
                    />
                ),
            } as Column]
            : []),
        {
            key: 'fastest-race',
            header: 'Fastest Race',
            cell: ({ entry, previousEntry, roundDataValue, currentRaceIndex, races }) => (
                <TimeDisplayCell
                    currentTime={entry.fastestTotalRaceTime || null}
                    previousTime={previousEntry?.fastestTotalRaceTime || null}
                    roundDataValue={roundDataValue}
                    currentRaceIndex={currentRaceIndex}
                    races={races}
                />
            ),
        },
        {
            key: 'next',
            header: 'Next Race In',
            cell: ({ entry, isEliminated }) => (
                <NextRaceCell racesUntilNext={entry.racesUntilNext} isEliminated={isEliminated} />
            ),
        },
    ];

    return cols;
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
        <OverflowFadeCell>
            <div className='position-container'>
                <div>{currentPosition}</div>
                {showChange && change > 0 && (
                    <span className='position-change'>
                        ↑{change} from {prevPos}
                    </span>
                )}
            </div>
        </OverflowFadeCell>
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
        <OverflowFadeCell>
            <div className='channel-display'>
                {channel.shortBand}
                {channel.number}
                {/* Prefer PB id; ChannelSquare will fallback to sourceId if needed */}
                <ChannelSquare channelID={channel.id} />
            </div>
        </OverflowFadeCell>
    );
}

interface TimeDisplayCellProps {
    currentTime: { time: number; roundId: string; raceNumber: number } | null;
    previousTime: { time: number; roundId: string; raceNumber: number } | null;
    roundDataValue: PBRoundRecord[];
    currentRaceIndex: number;
    races: RaceData[]; // Need races to check if time is recent
}

function TimeDisplayCell(
    { currentTime, previousTime, roundDataValue, currentRaceIndex, races }: TimeDisplayCellProps,
) {
    if (!currentTime) {
        return <td>-</td>;
    }

    // Logic from isRecentTime callback
    const raceIndex = races.findIndex((race) =>
        race.roundId === currentTime.roundId && race.raceNumber === currentTime.raceNumber
    );
    const isRecent = raceIndex === currentRaceIndex || raceIndex === currentRaceIndex - 1;

    const showDiff = previousTime && previousTime.time !== currentTime.time && isRecent;
    const roundInfo = roundDataValue.find((r) => r.id === currentTime.roundId);
    const roundDisplay = roundInfo ? roundInfo.roundNumber : '?';

    return (
        <OverflowFadeCell>
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
        </OverflowFadeCell>
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
