import React, { useEffect, useRef, useState } from 'react';
import type { Column } from '../common/tableColumns.tsx';
import { useAtomValue } from 'jotai';
import { leaderboardCalculationsAtom } from './leaderboard-state.ts';
import { racesAtom, roundsDataAtom } from '../state/index.ts';
import type { PBChannelRecord, PBPilotRecord } from '../api/pbTypes.ts';
import { ChannelSquare } from '../common/ChannelSquare.tsx';

export type TableContext = { consecutiveLaps: number };
export interface LeaderboardRowProps {
    pilot: PBPilotRecord;
}

// Small table cell that detects overflow and applies a fade class
export function OverflowFadeCell(
    { children, className = '', title }: {
        children: React.ReactNode;
        className?: string;
        title?: string;
    },
) {
    const [hasOverflow, setHasOverflow] = useState(false);
    const cellRef = useRef<HTMLTableCellElement>(null);

    useEffect(() => {
        const checkOverflow = () => {
            if (cellRef.current) {
                const { scrollWidth, clientWidth } = cellRef.current;
                setHasOverflow(scrollWidth > clientWidth);
            }
        };
        checkOverflow();
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

// Position cell uses calculated positionChanges from atom
function PositionCell(
    { pilotId, currentPosition }: { pilotId: string; currentPosition: number },
) {
    const { positionChanges } = useAtomValue(leaderboardCalculationsAtom);
    const prevPos = positionChanges.get(pilotId);
    const showChange = prevPos && prevPos !== currentPosition;
    const change = showChange ? prevPos - currentPosition : 0;

    return (
        <OverflowFadeCell>
            <div className='position-container'>
                <div>{currentPosition}</div>
                {showChange && change > 0 && (
                    <span className='position-change'>↑{change} from {prevPos}</span>
                )}
            </div>
        </OverflowFadeCell>
    );
}

function ChannelDisplayCell({ channel }: { channel: PBChannelRecord | null }) {
    if (!channel) return <td>-</td>;
    return (
        <OverflowFadeCell>
            <div className='channel-display'>
                {channel.shortBand}
                {channel.number}
                <ChannelSquare channelID={channel.id} />
            </div>
        </OverflowFadeCell>
    );
}

type StatTime = { time: number; roundId: string; raceNumber: number } | null;

function RenderTimeCell(
    { currentTime, previousTime }: { currentTime: StatTime; previousTime: StatTime },
) {
    const { currentRaceIndex } = useAtomValue(leaderboardCalculationsAtom);
    const roundDataValue = useAtomValue(roundsDataAtom);
    const races = useAtomValue(racesAtom);

    if (!currentTime) return <td>-</td>;
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
                    <span className='source-info'>({roundDisplay}-{currentTime.raceNumber})</span>
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

function NextRaceCell(
    { racesUntilNext, isEliminated }: { racesUntilNext: number; isEliminated: boolean },
) {
    let content: React.ReactNode;
    if (racesUntilNext === -1 && isEliminated) content = <span className='done-text'>Done</span>;
    else if (racesUntilNext === -1) content = '-';
    else if (racesUntilNext === 0) content = <span className='next-text'>To Staging</span>;
    else if (racesUntilNext === -2) content = <span className='racing-text'>Racing</span>;
    else content = `${racesUntilNext}`;
    return <td>{content}</td>;
}

export function getLeaderboardColumns(
    ctx: TableContext,
): Array<Column<TableContext, LeaderboardRowProps>> {
    const cols: Array<Column<TableContext, LeaderboardRowProps>> = [
        {
            key: 'position',
            header: '',
            width: 12,
            cell: function PositionCellInline({ pilot }) {
                const { currentLeaderboard } = useAtomValue(leaderboardCalculationsAtom);
                const idx = currentLeaderboard.findIndex((e) => e.pilot.id === pilot.id);
                const pos = idx >= 0 ? idx + 1 : 0;
                return <PositionCell pilotId={pilot.id} currentPosition={pos} />;
            },
        },
        {
            key: 'pilot',
            header: 'Pilot',
            width: 200,
            cell: function PilotCellInline({ pilot }) {
                return (
                    <OverflowFadeCell className='pilot-col' title={pilot.name}>
                        {pilot.name}
                    </OverflowFadeCell>
                );
            },
        },
        {
            key: 'channel',
            header: 'Chan',
            width: 48,
            cell: function ChannelCellInline({ pilot }) {
                const { currentLeaderboard } = useAtomValue(leaderboardCalculationsAtom);
                const entry = currentLeaderboard.find((e) => e.pilot.id === pilot.id);
                return <ChannelDisplayCell channel={entry?.channel || null} />;
            },
        },
        {
            key: 'laps',
            header: 'Laps',
            width: 32,
            cell: function LapsCellInline({ pilot }) {
                const { currentLeaderboard } = useAtomValue(leaderboardCalculationsAtom);
                const entry = currentLeaderboard.find((e) => e.pilot.id === pilot.id);
                return <td>{entry?.totalLaps ?? 0}</td>;
            },
        },
        {
            key: 'holeshot',
            header: 'Holeshot',
            width: 64,
            cell: function HoleshotCellInline({ pilot }) {
                const { currentLeaderboard, previousLeaderboard } = useAtomValue(
                    leaderboardCalculationsAtom,
                );
                const current = currentLeaderboard.find((p) => p.pilot.id === pilot.id);
                const previous = previousLeaderboard.find((p) => p.pilot.id === pilot.id);
                return (
                    <RenderTimeCell
                        currentTime={current?.bestHoleshot || null}
                        previousTime={previous?.bestHoleshot || null}
                    />
                );
            },
        },
        {
            key: 'top-lap',
            header: 'Top Lap',
            width: 64,
            cell: function TopLapCellInline({ pilot }) {
                const { currentLeaderboard, previousLeaderboard } = useAtomValue(
                    leaderboardCalculationsAtom,
                );
                const current = currentLeaderboard.find((p) => p.pilot.id === pilot.id);
                const previous = previousLeaderboard.find((p) => p.pilot.id === pilot.id);
                return (
                    <RenderTimeCell
                        currentTime={current?.bestLap || null}
                        previousTime={previous?.bestLap || null}
                    />
                );
            },
        },
        ...(ctx.consecutiveLaps > 1
            ? [{
                key: 'consec',
                header: () => `Top ${ctx.consecutiveLaps} Consec`,
                width: 64,
                cell: function ConsecutiveCellInline({ pilot }) {
                    const { currentLeaderboard, previousLeaderboard } = useAtomValue(
                        leaderboardCalculationsAtom,
                    );
                    const current = currentLeaderboard.find((p) => p.pilot.id === pilot.id);
                    const previous = previousLeaderboard.find((p) => p.pilot.id === pilot.id);
                    return (
                        <RenderTimeCell
                            currentTime={current?.consecutiveLaps || null}
                            previousTime={previous?.consecutiveLaps || null}
                        />
                    );
                },
            } as Column<TableContext, LeaderboardRowProps>]
            : []),
        {
            key: 'fastest-race',
            header: 'Fastest Race',
            width: 64,
            cell: function FastestRaceCellInline({ pilot }) {
                const { currentLeaderboard, previousLeaderboard } = useAtomValue(
                    leaderboardCalculationsAtom,
                );
                const current = currentLeaderboard.find((p) => p.pilot.id === pilot.id);
                const previous = previousLeaderboard.find((p) => p.pilot.id === pilot.id);
                return (
                    <RenderTimeCell
                        currentTime={current?.fastestTotalRaceTime || null}
                        previousTime={previous?.fastestTotalRaceTime || null}
                    />
                );
            },
        },
        {
            key: 'next',
            header: 'Next Race In',
            width: 120,
            cell: function NextRaceStatusCellInline({ pilot }) {
                const { currentLeaderboard, eliminatedPilots } = useAtomValue(
                    leaderboardCalculationsAtom,
                );
                const entry = currentLeaderboard.find((e) => e.pilot.id === pilot.id);
                const isEliminated = eliminatedPilots.some((p) =>
                    p.name.toLowerCase().replace(/\s+/g, '') ===
                        pilot.name.toLowerCase().replace(/\s+/g, '')
                );
                return (
                    <NextRaceCell
                        racesUntilNext={entry?.racesUntilNext ?? -1}
                        isEliminated={isEliminated}
                    />
                );
            },
        },
    ];
    return cols;
}
