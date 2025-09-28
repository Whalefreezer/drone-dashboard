import { useCallback, useEffect, useMemo } from 'react';
import type { Column } from '../common/GenericTable.tsx';
import { GenericTable } from '../common/GenericTable.tsx';
import './Leaderboard.css';
import { consecutiveLapsAtom } from '../state/atoms.ts';
import { useAtomValue, useSetAtom } from 'jotai';
import { filteredLeaderboardPilotIdsAtom } from './leaderboard-atoms.ts';
import { getLeaderboardColumns, type LeaderboardRowProps, type TableContext } from './leaderboard-columns.tsx';
import { leaderboardSplitAtom } from '../state/pbAtoms.ts';
import { ColumnChooser } from '../common/ColumnChooser.tsx';
import { getColumnPrefsAtom } from '../common/columnPrefs.ts';
import { useAtom } from 'jotai';
import useBreakpoint from '../responsive/useBreakpoint.ts';
import { FavoritesFilter } from '../common/FavoritesFilter.tsx';
import { favoritePilotIdsSetAtom, isPilotFavoriteAtom } from '../state/favorites-atoms.ts';

export function Leaderboard() {
	const consecutiveLaps = useAtomValue(consecutiveLapsAtom);
	const pilotIds = useAtomValue(filteredLeaderboardPilotIdsAtom);
	const { isMobile, isTablet, breakpoint } = useBreakpoint();

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

	// Breakpoint-aware defaults and storage key
	const defaultKeys = useMemo(() => {
		const all = columns.map((c) => c.key);
		if (!isMobile && !isTablet) return all; // desktop -> all
		const base: string[] = ['position', 'pilot', 'laps', 'top-lap', 'next'];
		if (isTablet) {
			base.splice(2, 0, 'channel'); // after pilot
			base.splice(base.indexOf('top-lap') + 1, 0, 'holeshot');
			if (columns.some((c) => c.key === 'consec')) base.splice(base.indexOf('top-lap') + 2, 0, 'consec');
		}
		return base.filter((k) => all.includes(k));
	}, [columns, isMobile, isTablet]);

	const prefsKey = useMemo(() => `leaderboard:${breakpoint}`, [breakpoint]);

	return (
		<div className='leaderboard-container'>
			<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, overflow: 'visible' }}>
				<FavoritesFilter />
				<ColumnChooser tableId={prefsKey} columns={columns} compact label='Columns' defaultVisible={defaultKeys} />
			</div>
			<VisibleTable columns={columns} rows={rows} ctx={ctx} splitIndex={splitIndex} prefsKey={prefsKey} defaultKeys={defaultKeys} />
		</div>
	);
}

function VisibleTable(
	{
		columns,
		rows,
		ctx,
		splitIndex,
		prefsKey,
		defaultKeys,
	}: {
		columns: Array<Column<TableContext, LeaderboardRowProps>>;
		rows: LeaderboardRowProps[];
		ctx: TableContext;
		splitIndex: number | null;
		prefsKey: string;
		defaultKeys: string[];
	},
) {
	// Use per-breakpoint storage key and defaults
	const allKeys = useMemo(() => columns.map((c) => c.key), [columns]);
	const defaults = useMemo(() => defaultKeys.filter((key) => allKeys.includes(key)), [allKeys, defaultKeys]);
	const prefsAtom = useMemo(() => getColumnPrefsAtom(prefsKey, allKeys, defaults), [prefsKey, allKeys, defaults]);
	const [visible] = useAtom(prefsAtom);

	// Get favorite pilot IDs for row styling
	const favoritePilotIdsSet = useAtomValue(favoritePilotIdsSetAtom);

	const getRowClassName = useCallback((row: LeaderboardRowProps, idx: number) => {
		const classes: string[] = [];

		if (favoritePilotIdsSet.has(row.pilotId)) {
			classes.push('favorite-row');
		}

		if (splitIndex && idx === splitIndex) {
			classes.push('split-after');
		}

		return classes.length > 0 ? classes.join(' ') : undefined;
	}, [splitIndex, favoritePilotIdsSet]);

	return (
		<GenericTable<TableContext, LeaderboardRowProps>
			className='leaderboard-table'
			columns={columns}
			data={rows}
			context={ctx}
			getRowKey={(row) => row.pilotId}
			getRowClassName={getRowClassName}
			estimatedRowHeight={32}
			visibleColumns={visible}
			scrollX
		/>
	);
}
