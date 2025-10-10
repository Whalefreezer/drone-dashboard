import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import type { Column } from '../common/GenericTable.tsx';
import { GenericTable } from '../common/GenericTable.tsx';
import './Leaderboard.css';
import { consecutiveLapsAtom } from '../state/atoms.ts';
import { useAtomValue } from 'jotai';
import { filteredLeaderboardPilotIdsAtom } from './leaderboard-atoms.ts';
import { getLeaderboardColumns, type LeaderboardRowProps, type TableContext } from './leaderboard-columns.tsx';
import { leaderboardSplitAtom } from '../state/pbAtoms.ts';
import { ColumnChooser } from '../common/ColumnChooser.tsx';
import { getColumnPrefsAtom } from '../common/columnPrefs.ts';
import { useAtom } from 'jotai';
import useBreakpoint from '../responsive/useBreakpoint.ts';
import { FavoritesFilter } from '../common/FavoritesFilter.tsx';
import { favoritePilotIdsSetAtom } from '../state/favorites-atoms.ts';
import { useLeaderboardAutoScroll } from './useLeaderboardAutoScroll.ts';
import { leaderboardAutoscrollEnabledAtom } from '../state/autoscroll-atoms.ts';
import { AutoscrollToggle } from './AutoscrollToggle.tsx';
import { leaderboardDataReadyAtom } from '../state/subscriptionStatusAtoms.ts';

export function Leaderboard() {
	const [mounted, setMounted] = useState(false);
	const deferredMounted = useDeferredValue(mounted);

	useEffect(() => {
		setMounted(true);
	}, []);

	return (
		<div className='leaderboard-container'>
			{deferredMounted ? (
				<LeaderboardContent />
			) : (
				<div className='leaderboard-loading' style={{ padding: '2rem', textAlign: 'center', opacity: 0.6 }}>
					Loading leaderboard...
				</div>
			)}
		</div>
	);
}

function LeaderboardContent() {
	const consecutiveLaps = useAtomValue(consecutiveLapsAtom);
	const pilotIds = useAtomValue(filteredLeaderboardPilotIdsAtom);
	const dataReady = useAtomValue(leaderboardDataReadyAtom);
	const [bootstrapComplete, setBootstrapComplete] = useState(false);

	useEffect(() => {
		if (dataReady) {
			setBootstrapComplete(true);
		}
	}, [dataReady]);

	const shouldShowRows = dataReady || bootstrapComplete;
	const { isMobile, isTablet, breakpoint } = useBreakpoint();
	const ctx = useMemo(() => ({ consecutiveLaps }), [
		consecutiveLaps,
	]);
	const columns = useMemo(
		(): Array<Column<TableContext, LeaderboardRowProps>> => getLeaderboardColumns(ctx),
		[ctx],
	);

	const rows: LeaderboardRowProps[] = useMemo(
		() => (shouldShowRows ? pilotIds.map((pilotId) => ({ pilotId })) : []),
		[pilotIds, shouldShowRows],
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

	const [autoscrollEnabled] = useAtom(leaderboardAutoscrollEnabledAtom);
	const allowAutoScroll = !isMobile && autoscrollEnabled;

	return (
		<div
			className='leaderboard-container'
			data-bootstrapping={!bootstrapComplete ? 'true' : undefined}
		>
			<div className='leaderboard-toolbar'>
				<div className='leaderboard-toolbar-left'>
					<FavoritesFilter />
				</div>
				<div className='leaderboard-toolbar-right'>
					{!isMobile && <AutoscrollToggle />}
					<ColumnChooser tableId={prefsKey} columns={columns} compact label='Columns' defaultVisible={defaultKeys} />
				</div>
			</div>
			<VisibleTable
				columns={columns}
				rows={rows}
				ctx={ctx}
				splitIndex={splitIndex}
				prefsKey={prefsKey}
				defaultKeys={defaultKeys}
				allowAutoScroll={allowAutoScroll}
			/>
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
		allowAutoScroll,
	}: {
		columns: Array<Column<TableContext, LeaderboardRowProps>>;
		rows: LeaderboardRowProps[];
		ctx: TableContext;
		splitIndex: number | null;
		prefsKey: string;
		defaultKeys: string[];
		allowAutoScroll: boolean;
	},
) {
	// Use per-breakpoint storage key and defaults
	const allKeys = useMemo(() => columns.map((c) => c.key), [columns]);
	const defaults = useMemo(() => defaultKeys.filter((key) => allKeys.includes(key)), [allKeys, defaultKeys]);
	const prefsAtom = useMemo(() => getColumnPrefsAtom(prefsKey, allKeys, defaults), [prefsKey, allKeys, defaults]);
	const [visible] = useAtom(prefsAtom);

	// Get favorite pilot IDs for row styling
	const favoritePilotIdsSet = useAtomValue(favoritePilotIdsSetAtom);

	const computeRowClassName = useCallback((row: LeaderboardRowProps, idx: number) => {
		const classes: string[] = [];

		if (favoritePilotIdsSet.has(row.pilotId)) {
			classes.push('favorite-row');
		}

		if (splitIndex && idx === splitIndex) {
			classes.push('split-after');
		}

		return classes.length > 0 ? classes.join(' ') : undefined;
	}, [splitIndex, favoritePilotIdsSet]);

	const getBaseRowKey = useCallback((row: LeaderboardRowProps) => row.pilotId, []);

	const { rowsForRender, containerRef, getRowKey, getRowClassName, isAutoScrolling } = useLeaderboardAutoScroll<LeaderboardRowProps>({
		rows,
		allowAutoScroll,
		baseGetRowKey: getBaseRowKey,
		baseGetRowClassName: computeRowClassName,
	});

	return (
		<div
			ref={containerRef}
			className={['leaderboard-table-viewport', isAutoScrolling ? 'autoscrolling' : undefined].filter(Boolean).join(' ')}
			data-autoscrolling={isAutoScrolling ? 'true' : undefined}
			role='region'
			aria-label='Leaderboard results'
		>
			<GenericTable<TableContext, LeaderboardRowProps>
				className='leaderboard-table'
				columns={columns}
				data={rowsForRender}
				context={ctx}
				getRowKey={getRowKey}
				getRowClassName={getRowClassName}
				estimatedRowHeight={30}
				visibleColumns={visible}
				scrollX
			/>
		</div>
	);
}
