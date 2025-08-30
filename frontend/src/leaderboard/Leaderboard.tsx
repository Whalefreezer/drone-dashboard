import React, { useMemo } from 'react';
import type { Column } from '../common/tableColumns.tsx';
import { GenericTable } from '../common/tableColumns.tsx';
import type { LeaderboardEntry } from './leaderboard-types.ts';
import { useLeaderboardAnimation } from './leaderboard-hooks.ts';
import './Leaderboard.css';
import { consecutiveLapsAtom } from '../state/atoms.ts';
import { useAtomValue } from 'jotai';
import { leaderboardCalculationsAtom } from './leaderboard-state.ts';
import { racesAtom } from '../state/index.ts';
import {
    getLeaderboardColumns,
    type LeaderboardRowProps,
    type TableContext,
} from './leaderboard-columns.tsx';

// Column config and cell components are implemented in leaderboard-columns.tsx

export function Leaderboard() {
    const races = useAtomValue(racesAtom);
    const consecutiveLaps = useAtomValue(consecutiveLapsAtom);
    const { currentLeaderboard, positionChanges } = useAtomValue(
        leaderboardCalculationsAtom,
    );
    const animatingRows = useLeaderboardAnimation(currentLeaderboard, positionChanges);

    if (races.length === 0) {
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
                animatingRows={animatingRows}
                consecutiveLaps={consecutiveLaps}
            />
        </div>
    );
}

interface LeaderboardTableProps {
    currentLeaderboard: LeaderboardEntry[];
    animatingRows: Set<string>;
    consecutiveLaps: number;
}

function LeaderboardTable(
    {
        currentLeaderboard,
        animatingRows,
        consecutiveLaps,
    }: LeaderboardTableProps,
) {
    // Build a single source-of-truth column definition used by header and rows
    const ctx = useMemo(() => ({ consecutiveLaps }), [consecutiveLaps]);
    const columns = useMemo(
        (): Array<Column<TableContext, LeaderboardRowProps>> => getLeaderboardColumns(ctx),
        [ctx],
    );

    const rows: LeaderboardRowProps[] = useMemo(() => (
        currentLeaderboard.map((entry) => ({ pilot: entry.pilot }))
    ), [currentLeaderboard]);

    return (
        <GenericTable<TableContext, LeaderboardRowProps>
            className='leaderboard-table'
            columns={columns}
            data={rows}
            context={ctx}
            getRowKey={(row) => row.pilot.id}
            getRowClassName={(row) => (animatingRows.has(row.pilot.id) ? 'position-improved' : '')}
        />
    );
}

// Row and TableContext types are exported from leaderboard-columns.tsx
