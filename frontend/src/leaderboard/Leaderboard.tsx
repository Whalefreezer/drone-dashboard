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
import { favoritePilotIdsSetAtom, isPilotFavoriteAtom, showFavoriteColumnAtom } from '../state/favorites-atoms.ts';
import { useUserActivity } from '../common/useUserActivity.ts';

export function Leaderboard() {
	const consecutiveLaps = useAtomValue(consecutiveLapsAtom);
	const pilotIds = useAtomValue(filteredLeaderboardPilotIdsAtom);
	const setShowFavoriteColumn = useSetAtom(showFavoriteColumnAtom);
	const isUserActive = useUserActivity();

	// Handle passive desktop mode - hide favorite column when user is inactive on desktop
	const { isMobile, isTablet, breakpoint } = useBreakpoint();
	useEffect(() => {
		// On desktop (not mobile/tablet), hide favorite column when user is inactive
		if (!isMobile && !isTablet) {
			setShowFavoriteColumn(isUserActive);
		} else {
			// On mobile/tablet, always show favorite column
			setShowFavoriteColumn(true);
		}
	}, [isUserActive, isMobile, isTablet, setShowFavoriteColumn]);

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
		const base: string[] = ['position', 'pilot', 'favorite', 'laps', 'top-lap', 'next'];
		if (isTablet) {
			base.splice(3, 0, 'channel'); // after favorite
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
	const showFavoriteColumn = useAtomValue(showFavoriteColumnAtom);

	// Filter visible columns to exclude favorite column when it should be hidden
	const filteredVisibleColumns = useMemo(() => {
		if (!showFavoriteColumn) {
			return visible.filter((key) => key !== 'favorite');
		}
		return visible;
	}, [visible, showFavoriteColumn]);

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
			visibleColumns={filteredVisibleColumns}
			scrollX
		/>
	);
}
