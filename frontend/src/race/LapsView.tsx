import React, { useMemo } from 'react';
import { useAtomValue } from 'jotai';
import { Link } from '@tanstack/react-router';
import { channelsDataAtom, overallBestTimesAtom, pilotsAtom, roundsDataAtom } from '../state/index.ts';
import {
	raceDataAtom,
	raceMaxLapNumberAtom,
	racePilotChannelsAtom,
	racePilotTotalTimeAtom,
	raceProcessedLapsAtom,
	raceSortedRowsAtom,
} from './race-atoms.ts';
import { favoritePilotIdsSetAtom } from '../state/favorites-atoms.ts';
import type { PBRaceRecord } from '../api/pbTypes.ts';
// Using PB-native race record + per-race atoms
// PilotChannel type is inline now - using { ID: string; Pilot: string; Channel: string }
import { getLapClassName, getPositionWithSuffix } from '../common/index.ts';
import { ChannelSquare } from '../common/ChannelSquare.tsx';
import './LapsView.css';
import '../common/patterns.css';
import { type Column, GenericTable } from '../common/GenericTable.tsx';
import { OverflowFadeCell } from '../common/OverflowFadeCell.tsx';
import { EventType } from '../api/pbTypes.ts';
import { raceBracketSlotsAtom } from '../bracket/eliminationState.ts';

const POSITION_POINTS: Record<number, number> = {};

interface LapsViewProps {
	raceId: string;
}

export function LapsView({ raceId }: LapsViewProps) {
	const race = useAtomValue(raceDataAtom(raceId));

	if (!race) return null;

	return (
		<div className='laps-view'>
			<div className='race-info'>
				<LapsTable race={race} />
			</div>
		</div>
	);
}

type LapsTableContext = {
	raceId: string;
	maxLaps: number;
};

type LapsRow = {
	raceId: string;
	pilotChannel: { id: string; pilotId: string; channelId: string };
	position: number;
	isPredicted?: boolean;
	displayName?: string;
	channelLabel?: string;
};

type LapsCellProps = { item: LapsRow };

function useIsRaceRound(raceId: string): boolean {
	const race = useAtomValue(raceDataAtom(raceId));
	const rounds = useAtomValue(roundsDataAtom);
	const roundRec = rounds.find((r) => r.id === (race?.round ?? '')) ?? null;
	return roundRec?.eventType === EventType.Race;
}

function PositionCell({ item }: LapsCellProps) {
	const maxLaps = useAtomValue(raceMaxLapNumberAtom(item.raceId));
	const isRaceRound = useIsRaceRound(item.raceId);
	if (maxLaps <= 0) return <div>-</div>;

	return (
		<div>
			<div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
				{getPositionWithSuffix(item.position)}
				{isRaceRound && POSITION_POINTS[item.position] && (
					<span style={{ fontSize: '0.8em', color: '#888' }}>
						+{POSITION_POINTS[item.position]}
					</span>
				)}
			</div>
		</div>
	);
}

function PilotNameCell({ item }: LapsCellProps) {
	const pilots = useAtomValue(pilotsAtom);
	const pilot = pilots.find((p) => p.id === item.pilotChannel.pilotId);
	const name = pilot?.name ?? item.displayName ?? '—';
	if (!pilot) {
		return (
			<OverflowFadeCell title={name}>
				{name}
			</OverflowFadeCell>
		);
	}
	return (
		<OverflowFadeCell title={name}>
			{/* @ts-ignore - TanStack Router type issue, see https://github.com/denoland/deno/issues/30444 */}
			<Link
				to='/pilots/$pilotId'
				/* @ts-ignore - TanStack Router type issue, see https://github.com/denoland/deno/issues/30444 */
				params={{ pilotId: pilot.sourceId }}
				className='leaderboard-pilot-link'
			>
				{name}
			</Link>
		</OverflowFadeCell>
	);
}

function ChannelCell({ item }: LapsCellProps) {
	const channels = useAtomValue(channelsDataAtom);
	const channel = channels.find((c) => c.id === item.pilotChannel.channelId);
	const label = channel ? `${channel.shortBand ?? ''}${channel.number ?? ''}` : item.channelLabel ?? '—';
	return (
		<div>
			<div className='flex-row'>
				{label}
				{item.pilotChannel.channelId ? <ChannelSquare channelID={item.pilotChannel.channelId} /> : null}
			</div>
		</div>
	);
}

const lapCellCache = new Map<string, React.ComponentType<LapsCellProps>>();

function getLapCellComponent(lapNumber: number, isHoleshot: boolean): React.ComponentType<LapsCellProps> {
	const cacheKey = isHoleshot ? `hs` : `l${lapNumber}`;
	const cached = lapCellCache.get(cacheKey);
	if (cached) return cached;

	const LapCell: React.FC<LapsCellProps> = ({ item }) => {
		const overallBestTimes = useAtomValue(overallBestTimesAtom);
		const processedLaps = useAtomValue(raceProcessedLapsAtom(item.raceId));
		const pilotLaps = processedLaps.filter((lap) => lap.pilotId === item.pilotChannel.pilotId);
		const racingLaps = pilotLaps.filter((lap) => !lap.isHoleshot);
		const fastestLap = racingLaps.length > 0 ? Math.min(...racingLaps.map((lap) => lap.lengthSeconds)) : Infinity;
		const racingFieldLaps = processedLaps.filter((lap) => !lap.isHoleshot);
		const overallFastestLap = racingFieldLaps.length > 0 ? Math.min(...racingFieldLaps.map((lap) => lap.lengthSeconds)) : Infinity;

		const lapData = pilotLaps.find((lap) => (lap.isHoleshot && isHoleshot) || (!lap.isHoleshot && lap.lapNumber === lapNumber));
		if (!lapData) return <div>-</div>;

		const className = getLapClassName(
			lapData,
			overallBestTimes.overallFastestLap,
			overallBestTimes.pilotBestLaps.get(item.pilotChannel.pilotId),
			overallFastestLap,
			fastestLap,
		);

		return <div className={className}>{lapData.lengthSeconds.toFixed(3)}</div>;
	};

	lapCellCache.set(cacheKey, LapCell);
	return LapCell;
}

function TotalTimeCell({ item }: LapsCellProps) {
	const totalTime = useAtomValue(racePilotTotalTimeAtom([item.raceId, item.pilotChannel.pilotId]));
	if (totalTime == null || item.isPredicted) return <div>-</div>;
	return <div>{totalTime.toFixed(3)}</div>;
}

function useLapsTableColumns(
	raceId: string,
	maxLaps: number,
): { columns: Array<Column<LapsTableContext, LapsRow>>; ctx: LapsTableContext } {
	const processedLapsForRace = useAtomValue(raceProcessedLapsAtom(raceId));

	const ctx = useMemo(() => ({ raceId, maxLaps }), [raceId, maxLaps]);

	// Values that determine the column structure
	const hasHoleshot = processedLapsForRace.some((lap) => lap.isHoleshot);

	const columns = useMemo((): Array<Column<LapsTableContext, LapsRow>> => {
		const cols: Array<Column<LapsTableContext, LapsRow>> = [
			{
				key: 'pos',
				header: 'Pos',
				label: 'Position',
				width: 56,
				cell: PositionCell,
			},
			{
				key: 'name',
				header: 'Name',
				label: 'Pilot',
				minWidth: 64,
				cell: PilotNameCell,
			},
			{
				key: 'chan',
				header: 'Chan',
				label: 'Channel',
				width: 52,
				cell: ChannelCell,
			},
		];

		// Lap cells: HS + L1..Lmax (show HS only if any holeshot exists)
		for (let i = hasHoleshot ? 0 : 1; i <= maxLaps; i++) {
			const isHS = i === 0;
			cols.push({
				key: isHS ? 'hs' : `l${i}`,
				header: isHS ? 'HS' : `L${i}`,
				label: isHS ? 'Holeshot' : `Lap ${i}`,
				group: isHS ? undefined : 'laps',
				groupLabel: isHS ? undefined : 'Laps',
				width: 58,
				cell: getLapCellComponent(i, isHS),
			});
		}

		// Total time column
		cols.push({
			key: 'total',
			header: 'Total',
			label: 'Total Race Time',
			width: 72,
			cell: TotalTimeCell,
		});

		return cols;
	}, [hasHoleshot, maxLaps]);

	return { columns, ctx };
}

function LapsTable(
	{ race }: { race: PBRaceRecord },
) {
	const baseRows: LapsRow[] = useAtomValue(raceSortedRowsAtom(race.id));
	const maxLaps = useAtomValue(raceMaxLapNumberAtom(race.id));
	const favoritePilotIdsSet = useAtomValue(favoritePilotIdsSetAtom);
	const bracketSlots = useAtomValue(raceBracketSlotsAtom(race.id));

	const existingPilotIds = new Set(
		baseRows
			.map((row) => row.pilotChannel.pilotId)
			.filter((pilotId): pilotId is string => pilotId != null),
	);
	const predictedRows: LapsRow[] = bracketSlots
		.filter((slot) => slot.isPredicted && slot.pilotId && !existingPilotIds.has(slot.pilotId))
		.map((slot, idx) => ({
			raceId: race.id,
			pilotChannel: {
				id: slot.id,
				pilotId: slot.pilotId ?? `predicted-${slot.id}`,
				channelId: slot.channelId ?? '',
			},
			position: baseRows.length + idx + 1,
			isPredicted: true,
			displayName: slot.name,
			channelLabel: slot.channelLabel || '—',
		}));
	const rows: LapsRow[] = [
		...baseRows.map((row) => ({
			...row,
			isPredicted: false,
		})),
		...predictedRows,
	];

	const { columns, ctx } = useLapsTableColumns(race.id, maxLaps);

	const getRowClassName = (row: LapsRow) => {
		if (row.isPredicted) {
			return 'predicted-row';
		}
		if (favoritePilotIdsSet.has(row.pilotChannel.pilotId)) {
			return 'favorite-row';
		}
		return undefined;
	};

	return (
		<GenericTable<LapsTableContext, LapsRow>
			className='laps-table'
			columns={columns}
			data={rows}
			context={ctx}
			getRowKey={(row) => row.pilotChannel.id}
			getRowClassName={getRowClassName}
			estimatedRowHeight={30}
			rowMode='fixed'
			scrollX
		/>
	);
}
