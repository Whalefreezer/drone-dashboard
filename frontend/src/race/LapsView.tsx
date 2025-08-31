import React, { useMemo } from 'react';
import { useAtomValue } from 'jotai';
import {
    channelsDataAtom,
    overallBestTimesAtom,
    pilotsAtom,
    roundsDataAtom,
} from '../state/index.ts';
import { raceDataAtom } from './race-atoms.ts';
import type { RaceData } from './race-types.ts';
// PilotChannel type is inline now - using { ID: string; Pilot: string; Channel: string }
import { getLapClassName, getPositionWithSuffix } from '../common/index.ts';
import { ChannelSquare } from '../common/ChannelSquare.tsx';
import type { Bracket, BracketPilot } from '../bracket/bracket-types.ts';
import './LapsView.css';
import { GenericTable, type Column } from '../common/tableColumns.tsx';
import { OverflowFadeCell } from '../leaderboard/leaderboard-columns.tsx';
import { EventType } from '../api/pbTypes.ts';

const POSITION_POINTS: Record<number, number> = {
    1: 10,
    2: 7,
    3: 4,
    4: 3,
};

interface LapsViewProps {
    raceId: string;
}

export function LapsView({ raceId }: LapsViewProps) {
    const roundData = useAtomValue(roundsDataAtom);
    const race = useAtomValue(raceDataAtom(raceId));
    const pilots = useAtomValue(pilotsAtom);

    if (!race) return null;

    const round = roundData.find((r) => r.id === race.roundId);

    const getBracketData = (): Bracket | null => {
        const normalizeString = (str: string) => str.toLowerCase().replace(/\s+/g, '');

        const racePilotNames = new Set(
            race.pilotChannels
                .map((pc) => pilots.find((p) => p.id === pc.pilotId)?.name ?? '')
                .filter((name) => name !== '')
                .map(normalizeString),
        );

        return null;
    };

    const matchingBracket = getBracketData();

    return (
        <div className='laps-view'>
            <div className='race-info'>
                <div className='race-number'>
                    {round?.roundNumber}-{race.raceNumber}
                    {matchingBracket && (
                        <span style={{ marginLeft: '8px', color: '#888' }}>
                            ({matchingBracket.name})
                        </span>
                    )}
                </div>
                <LapsTable race={race} matchingBracket={matchingBracket} />
            </div>
        </div>
    );
}

type LapsTableContext = {
    race: RaceData;
    matchingBracket: Bracket | null;
    maxLaps: number;
};

type LapsRow = {
    pilotChannel: { id: string; pilotId: string; channelId: string };
    position: number;
};

function useLapsTableColumns(
    race: RaceData,
    matchingBracket: Bracket | null,
    maxLaps: number,
): { columns: Array<Column<LapsTableContext, LapsRow>>; ctx: LapsTableContext } {
    const rounds = useAtomValue(roundsDataAtom);
    const roundRec = rounds.find((r) => r.id === race.roundId) ?? null;
    const isRaceRound = roundRec?.eventType === EventType.Race;

    const ctx = useMemo(() => ({ race, matchingBracket, maxLaps }), [race, matchingBracket, maxLaps]);

    const columns: Array<Column<LapsTableContext, LapsRow>> = [];

    // Position
    columns.push({
        key: 'pos',
        header: 'Pos',
        width: 56,
        cell: function PosCell({ position }: LapsRow) {
            return (
                <td>
                    {maxLaps > 0
                        ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                {getPositionWithSuffix(position)}
                                {isRaceRound && POSITION_POINTS[position] && (
                                    <span style={{ fontSize: '0.8em', color: '#888' }}>
                                        +{POSITION_POINTS[position]}
                                    </span>
                                )}
                            </div>
                        )
                        : '-'}
                </td>
            );
        },
    });

    // Pilot name (flex)
    columns.push({
        key: 'name',
        header: 'Name',
        minWidth: 64,
        cell: function NameCell({ pilotChannel }: LapsRow) {
            const pilots = useAtomValue(pilotsAtom);
            const pilot = pilots.find((p) => p.id === pilotChannel.pilotId);
            return (
                <OverflowFadeCell title={pilot?.name}>
                    {pilot?.name ?? '-'}
                </OverflowFadeCell>
            );
        },
    });

    // Channel
    columns.push({
        key: 'chan',
        header: 'Chan',
        width: 52,
        cell: function ChanCell({ pilotChannel }: LapsRow) {
            const channels = useAtomValue(channelsDataAtom);
            const channel = channels.find((c) => c.id === pilotChannel.channelId);
            return (
                <td>
                    <div className='flex-row'>
                        {channel?.shortBand}
                        {channel?.number}
                        <ChannelSquare channelID={pilotChannel.channelId} />
                    </div>
                </td>
            );
        },
    });

    // Points + Bracket rounds (if any)
    if (matchingBracket) {
        // Points
        columns.push({
            key: 'points',
            header: 'Points',
            width: 64,
            cell: function PointsCell({ pilotChannel }: LapsRow) {
                const pilots = useAtomValue(pilotsAtom);
                const pilot = pilots.find((p) => p.id === pilotChannel.pilotId);
                const bracketPilot = matchingBracket?.pilots.find((bp: BracketPilot) =>
                    bp.name.toLowerCase().replace(/\s+/g, '') === (pilot?.name ?? '').toLowerCase().replace(/\s+/g, '')
                );
                return (
                    <td style={{ color: '#00ff00' }}>
                        {bracketPilot ? bracketPilot.points : '-'}
                    </td>
                );
            },
        });

        const roundsCount = matchingBracket.pilots?.[0]?.rounds?.length ?? 0;
        for (let r = 0; r < roundsCount; r++) {
            const key = `br${r + 1}`;
            columns.push({
                key,
                header: `R${r + 1}`,
                width: 48,
                cell: function BracketRoundCell({ pilotChannel }: LapsRow) {
                    const pilots = useAtomValue(pilotsAtom);
                    const pilot = pilots.find((p) => p.id === pilotChannel.pilotId);
                    const bracketPilot = matchingBracket?.pilots.find((bp: BracketPilot) =>
                        bp.name.toLowerCase().replace(/\s+/g, '') === (pilot?.name ?? '').toLowerCase().replace(/\s+/g, '')
                    );
                    const roundVal = bracketPilot?.rounds?.[r] ?? null;
                    return (
                        <td>
                            {roundVal
                                ? (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        {roundVal}
                                        {isRaceRound && POSITION_POINTS[roundVal] && (
                                            <span style={{ fontSize: '0.8em', color: '#888' }}>
                                                +{POSITION_POINTS[roundVal]}
                                            </span>
                                        )}
                                    </div>
                                )
                                : '-'}
                        </td>
                    );
                },
            });
        }
    }

    // Lap cells: HS + L1..Lmax (show HS only if any holeshot exists)
    const hasHoleshot = race.processedLaps.some((lap) => lap.isHoleshot);
    for (let i = hasHoleshot ? 0 : 1; i <= maxLaps; i++) {
        const isHS = i === 0;
        columns.push({
            key: isHS ? 'hs' : `l${i}`,
            header: isHS ? 'HS' : `L${i}`,
            width: 52,
            cell: function LapCell({ pilotChannel }: LapsRow) {
                const { race } = ctx;
                const overallBestTimes = useAtomValue(overallBestTimesAtom);
                const pilotLaps = race.processedLaps.filter((lap) => lap.pilotId === pilotChannel.pilotId);
                const racingLaps = pilotLaps.filter((lap) => !lap.isHoleshot);
                const fastestLap = racingLaps.length > 0
                    ? Math.min(...racingLaps.map((lap) => lap.lengthSeconds))
                    : Infinity;
                const overallFastestLap = race.processedLaps.filter((lap) => !lap.isHoleshot).length > 0
                    ? Math.min(
                        ...race.processedLaps
                            .filter((lap) => !lap.isHoleshot)
                            .map((lap) => lap.lengthSeconds),
                    )
                    : Infinity;

                const lapData = pilotLaps.find((lap) =>
                    (lap.isHoleshot && i === 0) || (!lap.isHoleshot && lap.lapNumber === i)
                );
                if (!lapData) return <td>-</td>;

                const className = getLapClassName(
                    lapData,
                    overallBestTimes.overallFastestLap,
                    overallBestTimes.pilotBestLaps.get(pilotChannel.pilotId),
                    overallFastestLap,
                    fastestLap,
                );

                return <td className={className}>{lapData.lengthSeconds.toFixed(3)}</td>;
            },
        });
    }

    return { columns, ctx };
}

function LapsTable(
    { race, matchingBracket }: { race: RaceData; matchingBracket: Bracket | null },
) {
    const rounds = useAtomValue(roundsDataAtom);
    const roundRec = rounds.find((r) => r.id === race.roundId) ?? null;
    const isRaceRound = roundRec?.eventType === EventType.Race;
    const pilotsWithLaps = race.pilotChannels
        .map((pilotChannel) => {
            const completedLaps = race.processedLaps.filter((lap) => lap.pilotId === pilotChannel.pilotId).length;
            return { pilotChannel, completedLaps };
        })
        .sort((a, b) => b.completedLaps - a.completedLaps);

    const maxLaps = Math.max(0, ...race.processedLaps.map((lap) => lap.lapNumber));

    const rows: LapsRow[] = pilotsWithLaps.map((p, idx) => ({
        pilotChannel: p.pilotChannel,
        position: idx + 1,
    }));

    const { columns, ctx } = useLapsTableColumns(race, matchingBracket, maxLaps);

    return (
        <GenericTable<LapsTableContext, LapsRow>
            className='laps-table'
            columns={columns}
            data={rows}
            context={ctx}
            getRowKey={(row) => row.pilotChannel.id}
        />
    );
}

// LapsTableHeader + LapsTableRow are no longer needed with GenericTable
