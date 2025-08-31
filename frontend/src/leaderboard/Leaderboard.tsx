import { useMemo } from 'react';
import type { Column } from '../common/tableColumns.tsx';
import { GenericTable } from '../common/tableColumns.tsx';
import './Leaderboard.css';
import { consecutiveLapsAtom } from '../state/atoms.ts';
import { useAtomValue } from 'jotai';
import { leaderboardPilotIdsAtom } from './leaderboard-atoms.ts';
import {
    getLeaderboardColumns,
    type LeaderboardRowProps,
    type TableContext,
} from './leaderboard-columns.tsx';

export function Leaderboard() {
    return (
        <div className='leaderboard-container'>
            <LeaderboardTable />
        </div>
    );
}

function LeaderboardTable() {
    const consecutiveLaps = useAtomValue(consecutiveLapsAtom);
    const pilotIds = useAtomValue(leaderboardPilotIdsAtom);
    const ctx = useMemo(() => ({ consecutiveLaps }), [consecutiveLaps]);
    const columns = useMemo(
        (): Array<Column<TableContext, LeaderboardRowProps>> => getLeaderboardColumns(ctx),
        [ctx],
    );

    const rows: LeaderboardRowProps[] = useMemo(() => (
        pilotIds
            .map((pilotId) => ({ pilotId }))
    ), [pilotIds]);

    return (
        <GenericTable<TableContext, LeaderboardRowProps>
            className='leaderboard-table'
            columns={columns}
            data={rows}
            context={ctx}
            getRowKey={(row) => row.pilotId}
        />
    );
}
