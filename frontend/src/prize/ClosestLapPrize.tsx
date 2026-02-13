import { useMemo } from 'react';
import { useAtomValue } from 'jotai';
import type { Column } from '../common/GenericTable.tsx';
import { GenericTable } from '../common/GenericTable.tsx';
import { Link } from '@tanstack/react-router';
import { type ClosestLapPrizeRow, closestLapPrizeRowsAtom, closestLapTargetSecondsAtom } from '../state/pbAtoms.ts';
import { OverflowFadeCell } from '../common/OverflowFadeCell.tsx';
import './ClosestLapPrize.css';

type PrizeContext = {
	targetSeconds: number;
};

type PrizeTableRow = ClosestLapPrizeRow & {
	rank: number;
};

function formatSeconds(value: number) {
	return value.toFixed(3);
}

const prizeColumns: Array<Column<PrizeContext, PrizeTableRow>> = [
	{
		key: 'rank',
		header: '#',
		width: 40,
		cell: ({ item }) => <span>{item.rank}</span>,
	},
	{
		key: 'pilot',
		header: 'Pilot',
		minWidth: 140,
		cell: ({ item }) => (
			<OverflowFadeCell title={item.pilotName} className='closest-lap-pilot-cell'>
				{/* @ts-ignore - TanStack Router type issue, see https://github.com/denoland/deno/issues/30444 */}
				<Link
					to='/pilots/$pilotId'
					/* @ts-ignore - TanStack Router type issue, see https://github.com/denoland/deno/issues/30444 */
					params={{ pilotId: item.pilotSourceId }}
					className='closest-lap-pilot-link'
				>
					{item.pilotName}
				</Link>
			</OverflowFadeCell>
		),
	},
	{
		key: 'lap',
		header: 'Closest Lap',
		width: 96,
		headerAlign: 'right',
		cell: ({ item }) => <span>{formatSeconds(item.closestLapSeconds)}</span>,
	},
	{
		key: 'delta',
		header: 'Abs Δ',
		width: 80,
		headerAlign: 'right',
		cell: ({ item }) => <span>{formatSeconds(item.deltaSeconds)}</span>,
	},
	{
		key: 'race',
		header: 'Race',
		width: 84,
		cell: ({ item }) => <span>{item.raceLabel}</span>,
	},
];

export function ClosestLapPrize() {
	const targetSeconds = useAtomValue(closestLapTargetSecondsAtom);
	const rows = useAtomValue(closestLapPrizeRowsAtom);

	if (targetSeconds == null) {
		return (
			<section className='closest-lap-prize'>
				<p className='muted'>Closest lap prize is not configured.</p>
			</section>
		);
	}

	const tableRows = useMemo(
		() => rows.map((row, index) => ({ ...row, rank: index + 1 })),
		[rows],
	);

	return (
		<section className='closest-lap-prize'>
			<header className='closest-lap-prize-header'>
				<div>
					<h2>Closest Lap Prize</h2>
					<p>Closest valid non-holeshot lap wins.</p>
				</div>
				<div className='closest-lap-target-card'>
					<span className='closest-lap-target-label'>Target</span>
					<strong className='closest-lap-target-value'>{formatSeconds(targetSeconds)}s</strong>
				</div>
			</header>

			<div className='closest-lap-table-viewport'>
				<GenericTable<PrizeContext, PrizeTableRow>
					className='closest-lap-table'
					columns={prizeColumns}
					data={tableRows}
					context={{ targetSeconds }}
					getRowKey={(row) => row.pilotId}
					estimatedRowHeight={34}
					rowMode='fixed'
					scrollX
				/>
			</div>
			{tableRows.length === 0 && <p className='muted'>No valid laps yet for this event.</p>}
		</section>
	);
}
