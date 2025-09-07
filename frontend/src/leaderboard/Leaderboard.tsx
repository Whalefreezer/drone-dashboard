import { useMemo } from 'react';
import type { Column } from '../common/GenericTable.tsx';
import { GenericTable } from '../common/GenericTable.tsx';
import './Leaderboard.css';
import { consecutiveLapsAtom } from '../state/atoms.ts';
import { useAtomValue } from 'jotai';
import { leaderboardPilotIdsAtom } from './leaderboard-atoms.ts';
import { getLeaderboardColumns, type LeaderboardRowProps, type TableContext } from './leaderboard-columns.tsx';
import { leaderboardSplitAtom } from '../state/pbAtoms.ts';
import { ColumnChooser } from '../common/ColumnChooser.tsx';
import { getColumnPrefsAtom } from '../common/columnPrefs.ts';
import { useAtom } from 'jotai';

export function Leaderboard() {
	const consecutiveLaps = useAtomValue(consecutiveLapsAtom);
	const pilotIds = useAtomValue(leaderboardPilotIdsAtom);
	const ctx = useMemo(() => ({ consecutiveLaps }), [consecutiveLaps]);
	const columns = useMemo(
		(): Array<Column<TableContext, LeaderboardRowProps>> => getLeaderboardColumns(ctx),
		[ctx],
	);

	const rows: LeaderboardRowProps[] = useMemo(
		() => (pilotIds.map((pilotId) => ({ pilotId }))),
		[pilotIds],
	);

	const splitIndex = useAtomValue(leaderboardSplitAtom); // 1-based position or null

	return (
		<div className='leaderboard-container'>
			<div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6, overflow: 'visible' }}>
				<ColumnChooser tableId='leaderboard' columns={columns} compact label='Columns' />
			</div>
			<VisibleTable columns={columns} rows={rows} ctx={ctx} splitIndex={splitIndex} />
		</div>
	);
}

function VisibleTable(
	{
		columns,
		rows,
		ctx,
		splitIndex,
	}: {
		columns: Array<Column<TableContext, LeaderboardRowProps>>;
		rows: LeaderboardRowProps[];
		ctx: TableContext;
		splitIndex: number | null;
	},
) {
	const keysSig = useMemo(() => JSON.stringify(columns.map((c) => c.key)), [columns]);
	const defaultKeys = useMemo(() => columns.map((c) => c.key), [keysSig]);
	const [visible] = useAtom(useMemo(() => getColumnPrefsAtom('leaderboard', defaultKeys), [keysSig]));
	return (
		<GenericTable<TableContext, LeaderboardRowProps>
			className='leaderboard-table'
			columns={columns}
			data={rows}
			context={ctx}
			getRowKey={(row) => row.pilotId}
			getRowClassName={(_, idx) => (splitIndex ? (idx === splitIndex ? 'split-after' : undefined) : undefined)}
			rowHeight={45}
			visibleColumns={visible}
			scrollX
		/>
	);
}
