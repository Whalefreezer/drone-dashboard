import React, { useMemo } from 'react';
import type { Column } from '../common/tableColumns.tsx';
import { GenericTable } from '../common/tableColumns.tsx';
// Animation derived directly from positionChangesAtom and current order
import './Leaderboard.css';
import { consecutiveLapsAtom } from '../state/atoms.ts';
import { useAtomValue } from 'jotai';
import { racesAtom } from '../state/index.ts';
import { leaderboardPilotIdsAtom, positionChangesAtom } from './leaderboard-atoms.ts';
import { pilotsAtom } from '../state/pbAtoms.ts';
import {
    getLeaderboardColumns,
    type LeaderboardRowProps,
    type TableContext,
} from './leaderboard-columns.tsx';

// Column config and cell components are implemented in leaderboard-columns.tsx

export function Leaderboard() {
    const races = useAtomValue(racesAtom);
    const consecutiveLaps = useAtomValue(consecutiveLapsAtom);
    const pilotIds = useAtomValue(leaderboardPilotIdsAtom);
    const positionChanges = useAtomValue(positionChangesAtom);

    // Compute animating rows: previous position exists and was worse than current
    const animatingRows = new Set<string>();
    pilotIds.forEach((id, idx) => {
        const prevPos = positionChanges.get(id);
        if (prevPos && prevPos > idx + 1) animatingRows.add(id);
    });

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
                pilotIds={pilotIds}
                animatingRows={animatingRows}
                consecutiveLaps={consecutiveLaps}
            />
        </div>
    );
}

interface LeaderboardTableProps {
    pilotIds: string[];
    animatingRows: Set<string>;
    consecutiveLaps: number;
}

function LeaderboardTable(
    {
        pilotIds,
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

    const pilots = useAtomValue(pilotsAtom);
    const rows: LeaderboardRowProps[] = useMemo(() => (
        pilotIds
            .map((id) => pilots.find((p) => p.id === id))
            .filter((p): p is NonNullable<typeof p> => !!p)
            .map((pilot) => ({ pilot }))
    ), [pilotIds, pilots]);

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
