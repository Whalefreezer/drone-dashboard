import { useMemo, useState } from 'react';
import { type Column, GenericTable } from '../common/GenericTable.tsx';
import type { PilotRaceLapGroup } from './pilot-state.ts';
import { ChannelSquare } from '../common/ChannelSquare.tsx';
import { StreamTimestampLink } from '../stream/StreamTimestampLink.tsx';

type SortMode = 'time' | 'chronological';

interface PilotLapRow {
	id: string;
	raceLabel: string;
	raceOrder: number;
	lapNumber: number;
	lapTime: number;
	deltaBest: number | null;
	channelLabel: string;
	channelId: string | null;
	timestampMs: number | null;
	timestampDisplay: string;
	isBest: boolean;
}

interface TableContext {
	bestLapSeconds: number | null;
}

interface PilotLapTableTabProps {
	pilotId: string;
	lapGroups: PilotRaceLapGroup[];
	bestLapSeconds: number | null;
}

export function PilotLapTableTab(
	{ lapGroups, bestLapSeconds }: PilotLapTableTabProps,
) {
	const [sortMode, setSortMode] = useState<SortMode>('time');

	const rows = useMemo(() => flattenLapRows(lapGroups, bestLapSeconds), [lapGroups, bestLapSeconds]);
	const sortedRows = useMemo(() => sortRows(rows, sortMode), [rows, sortMode]);

	if (sortedRows.length === 0) {
		return <div className='pilot-empty-state'>No lap data to show.</div>;
	}

	const columns = useMemo(buildColumns, []);

	return (
		<div className='pilot-lap-table-tab'>
			<div className='pilot-lap-controls'>
				<span className='pilot-lap-count'>{sortedRows.length} laps</span>
				<div className='pilot-lap-sort' role='group' aria-label='Lap table sort'>
					<button
						type='button'
						className={sortMode === 'time' ? 'active' : ''}
						onClick={() => setSortMode('time')}
					>
						Fastest first
					</button>
					<button
						type='button'
						className={sortMode === 'chronological' ? 'active' : ''}
						onClick={() => setSortMode('chronological')}
					>
						Chronological
					</button>
				</div>
			</div>

			<GenericTable<TableContext, PilotLapRow>
				className='pilot-lap-table'
				columns={columns}
				data={sortedRows}
				context={{ bestLapSeconds }}
				getRowKey={(row) => row.id}
				estimatedRowHeight={34}
				rowMode='dynamic'
				scrollX
			/>
		</div>
	);
}

const buildColumns = (): Array<Column<TableContext, PilotLapRow>> => [
	{
		key: 'race',
		header: 'Race',
		minWidth: 180,
		cell: ({ item }: { item: PilotLapRow }) => (
			<div className='pilot-lap-race'>
				<StreamTimestampLink timestampMs={item.timestampMs}>
					{item.raceLabel}
				</StreamTimestampLink>
			</div>
		),
	},
	{
		key: 'lap',
		header: 'Lap #',
		width: 64,
		cell: ({ item }) => <div>#{item.lapNumber}</div>,
	},
	{
		key: 'lapTime',
		header: 'Lap Time',
		width: 96,
		cell: ({ item }: { item: PilotLapRow }) => {
			const className = item.isBest ? 'pilot-lap-time pilot-lap-time--best' : 'pilot-lap-time';
			return (
				<div className={className}>
					{formatSeconds(item.lapTime)}
				</div>
			);
		},
	},
	{
		key: 'delta',
		header: 'Δ Best',
		width: 96,
		cell: ({ item }) => <div>{formatDelta(item.deltaBest)}</div>,
	},
	{
		key: 'channel',
		header: 'Channel',
		width: 120,
		cell: ({ item }: { item: PilotLapRow }) => (
			<div className='pilot-lap-channel'>
				{item.channelId ? <ChannelSquare channelID={item.channelId} /> : <span className='pilot-lap-channel-placeholder'>—</span>}
				<span>{item.channelLabel || '—'}</span>
			</div>
		),
	},
	{
		key: 'timestamp',
		header: 'Timestamp',
		minWidth: 160,
		cell: ({ item }: { item: PilotLapRow }) => <TimestampCell timestampMs={item.timestampMs} display={item.timestampDisplay} />,
	},
];

function flattenLapRows(groups: PilotRaceLapGroup[], bestLapSeconds: number | null): PilotLapRow[] {
	const rows: PilotLapRow[] = [];
	for (const group of groups) {
		for (const lap of group.laps) {
			const deltaBest = bestLapSeconds != null ? lap.lengthSeconds - bestLapSeconds : null;
			const isBest = bestLapSeconds != null && Math.abs(lap.lengthSeconds - bestLapSeconds) < 1e-3;
			const startTimestampMs = lap.detectionTimestampMs != null && Number.isFinite(lap.detectionTimestampMs)
				? lap.detectionTimestampMs - lap.lengthSeconds * 1_000
				: null;
			rows.push({
				id: lap.id,
				raceLabel: group.race.label,
				raceOrder: group.race.order,
				lapNumber: lap.lapNumber,
				lapTime: lap.lengthSeconds,
				deltaBest,
				channelLabel: lap.channel?.label ?? group.channel?.label ?? '',
				channelId: lap.channel?.id ?? group.channel?.id ?? null,
				timestampMs: startTimestampMs,
				timestampDisplay: formatTimestamp(startTimestampMs),
				isBest,
			});
		}
	}
	return rows;
}

function sortRows(rows: PilotLapRow[], mode: SortMode): PilotLapRow[] {
	const copy = [...rows];
	if (mode === 'time') {
		copy.sort((a, b) => {
			const timeCompare = a.lapTime - b.lapTime;
			if (Math.abs(timeCompare) > 1e-6) return timeCompare;
			return a.lapNumber - b.lapNumber;
		});
		return copy;
	}
	copy.sort((a, b) => {
		if (a.timestampMs != null && b.timestampMs != null) return a.timestampMs - b.timestampMs;
		if (a.timestampMs != null) return -1;
		if (b.timestampMs != null) return 1;
		if (a.raceOrder !== b.raceOrder) return a.raceOrder - b.raceOrder;
		if (a.lapNumber !== b.lapNumber) return a.lapNumber - b.lapNumber;
		return a.lapTime - b.lapTime;
	});
	return copy;
}

const formatSeconds = (value: number): string => `${value.toFixed(3)}s`;

const formatDelta = (value: number | null): string => {
	if (value == null || Number.isNaN(value)) return '—';
	if (Math.abs(value) < 1e-3) return '±0.000s';
	const sign = value > 0 ? '+' : '−';
	return `${sign}${Math.abs(value).toFixed(3)}s`;
};

const formatTimestamp = (ms: number | null): string => {
	if (!ms || !Number.isFinite(ms)) return '—';
	const date = new Date(ms);
	return date.toLocaleString([], {
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
	});
};

function TimestampCell({ timestampMs, display }: { timestampMs: number | null; display: string }) {
	return (
		<div>
			<StreamTimestampLink timestampMs={timestampMs} title='Watch stream'>
				{display}
			</StreamTimestampLink>
		</div>
	);
}
