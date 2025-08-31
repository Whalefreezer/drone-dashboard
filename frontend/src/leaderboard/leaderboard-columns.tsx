import React, { useEffect, useRef, useState } from 'react';
import type { Column } from '../common/tableColumns.tsx';
import { useAtomValue } from 'jotai';
import { leaderboardPilotIdsAtom, positionChangesAtom, pilotPreferredChannelAtom, pilotRacesUntilNextAtom, pilotEliminatedInfoAtom } from './leaderboard-atoms.ts';
import { racesAtom, roundsDataAtom } from '../state/index.ts';
import type { PBChannelRecord, PBPilotRecord } from '../api/pbTypes.ts';
import { ChannelSquare } from '../common/ChannelSquare.tsx';
import { pilotBestLapAtom, pilotConsecAtom, pilotHoleshotAtom, pilotFastestTotalRaceAtom, pilotTotalLapsAtom } from './metric-factory.ts';
import { currentRaceIndexAtom } from '../race/race-atoms.ts';

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
    const positionChanges = useAtomValue(positionChangesAtom);
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
    { metricAtom }: { metricAtom: any },
) {
    const currentRaceIndex = useAtomValue(currentRaceIndexAtom);
    const roundDataValue = useAtomValue(roundsDataAtom);
    const races = useAtomValue(racesAtom);

    const { current, previous } = useAtomValue(metricAtom) as { current: { time: number; raceId: string } | null; previous: { time: number; raceId: string } | null };

    const toStat = (val: { time: number; raceId: string } | null): StatTime => {
        if (!val) return null;
        const r = races.find((x) => x.id === val.raceId);
        if (!r) return null;
        return { time: val.time, roundId: r.round ?? '', raceNumber: r.raceNumber ?? 0 };
    };

    const currentTime = toStat(current);
    const previousTime = toStat(previous);
    if (!currentTime) return <td>-</td>;

    const raceIndex = races.findIndex((race) =>
        race.round === currentTime.roundId && race.raceNumber === currentTime.raceNumber
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

// eliminated info is provided by pilotEliminatedInfoAtom

// Type for leaderboard entry properties that are StatTime
// Removed createTimeComparisonCell; pass metric atoms directly to RenderTimeCell

export function getLeaderboardColumns(
    ctx: TableContext,
): Array<Column<TableContext, LeaderboardRowProps>> {
    const cols: Array<Column<TableContext, LeaderboardRowProps>> = [
        {
            key: 'position',
            header: '',
            width: 32,
            cell: function PositionCellInline({ pilot }) {
                const ids = useAtomValue(leaderboardPilotIdsAtom);
                const idx = ids.findIndex((id) => id === pilot.id);
                const pos = idx >= 0 ? idx + 1 : 0;
                return <PositionCell pilotId={pilot.id} currentPosition={pos} />;
            },
        },
        {
            key: 'pilot',
            header: 'Pilot',
            // Let the Pilot column flex to consume remaining space.
            // Keep a reasonable minimum so it doesn't collapse.
            minWidth: 100,
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
            width: 52,
            cell: function ChannelCellInline({ pilot }) {
                const channel = useAtomValue(pilotPreferredChannelAtom(pilot.id));
                return <ChannelDisplayCell channel={channel} />;
            },
        },
        {
            key: 'laps',
            header: 'Laps',
            width: 52,
            cell: function LapsCellInline({ pilot }) {
                const { current } = useAtomValue(pilotTotalLapsAtom(pilot.id));
                return <td>{current ?? 0}</td>;
            },
        },
        {
            key: 'holeshot',
            header: 'Hole shot',
            width: 64,
            cell: function HoleshotCell({ pilot }) {
                return <RenderTimeCell metricAtom={pilotHoleshotAtom(pilot.id)} />;
            },
        },
        {
            key: 'top-lap',
            header: 'Top Lap',
            width: 64,
            cell: function BestLapCell({ pilot }) {
                return <RenderTimeCell metricAtom={pilotBestLapAtom(pilot.id)} />;
            },
        },
        ...(ctx.consecutiveLaps > 1
            ? [{
                key: 'consec',
                header: () => `Top ${ctx.consecutiveLaps} Consec`,
                width: 64,
                cell: function ConsecCell({ pilot }) {
                    return <RenderTimeCell metricAtom={pilotConsecAtom(pilot.id)} />;
                },
            } as Column<TableContext, LeaderboardRowProps>]
            : []),
        {
            key: 'fastest-race',
            header: 'Fastest Race',
            width: 64,
            cell: function TotalRaceCell({ pilot }) {
                return <RenderTimeCell metricAtom={pilotFastestTotalRaceAtom(pilot.id)} />;
            },
        },
        {
            key: 'next',
            header: 'Next Race In',
            width: 96,
            cell: function NextRaceStatusCellInline({ pilot }) {
                const racesUntilNext = useAtomValue(pilotRacesUntilNextAtom(pilot.id));
                const elimInfo = useAtomValue(pilotEliminatedInfoAtom(pilot.id));
                const isEliminated = !!elimInfo;
                return (
                    <NextRaceCell
                        racesUntilNext={racesUntilNext}
                        isEliminated={isEliminated}
                    />
                );
            },
        },
    ];
    return cols;
}
