import React, { useMemo } from 'react';
import { useAtomValue } from 'jotai';
import { Link } from '@tanstack/react-router';
import { channelsDataAtom, overallBestTimesAtom, pilotsAtom, roundsDataAtom, streamVideoRangesAtom } from '../state/index.ts';
import { raceDataAtom, raceMaxLapNumberAtom, racePilotChannelsAtom, raceProcessedLapsAtom, raceSortedRowsAtom } from './race-atoms.ts';
import { favoritePilotIdsSetAtom } from '../state/favorites-atoms.ts';
import type { PBRaceRecord } from '../api/pbTypes.ts';
// Using PB-native race record + per-race atoms
// PilotChannel type is inline now - using { ID: string; Pilot: string; Channel: string }
import { getLapClassName, getPositionWithSuffix } from '../common/index.ts';
import { ChannelSquare } from '../common/ChannelSquare.tsx';
import type { Bracket, BracketPilot } from '../bracket/bracket-types.ts';
import './LapsView.css';
import '../common/patterns.css';
import { type Column, GenericTable } from '../common/GenericTable.tsx';
import { OverflowFadeCell } from '../common/OverflowFadeCell.tsx';
import { EventType } from '../api/pbTypes.ts';
import { buildStreamLinkForTimestamp } from '../stream/stream-utils.ts';
import { parseTimestampMs } from '../common/time.ts';

const POSITION_POINTS: Record<number, number> = {};

interface LapsViewProps {
	raceId: string;
}

export function LapsView({ raceId }: LapsViewProps) {
	const roundData = useAtomValue(roundsDataAtom);
	const race = useAtomValue(raceDataAtom(raceId));
	const pilots = useAtomValue(pilotsAtom);
	const pilotChannels = useAtomValue(racePilotChannelsAtom(raceId));
	const streamRanges = useAtomValue(streamVideoRangesAtom);

	if (!race) return null;

	const round = roundData.find((r) => r.id === (race.round ?? ''));
	const raceStartMs = useMemo(() => parseTimestampMs(race.start ?? null), [race.start]);
	const raceStreamLink = useMemo(
		() => buildStreamLinkForTimestamp(streamRanges, raceStartMs),
		[streamRanges, raceStartMs],
	);

	const getBracketData = (): Bracket | null => {
		const normalizeString = (str: string) => str.toLowerCase().replace(/\s+/g, '');

		const racePilotNames = new Set(
			pilotChannels
				.map((pc: { pilotId: string }) => pilots.find((p) => p.id === pc.pilotId)?.name ?? '')
				.filter((name: string) => name !== '')
				.map(normalizeString),
		);

		return null;
	};

	const matchingBracket = getBracketData();

	return (
		<div className='laps-view'>
			<div className='race-info'>
				<div className='race-number'>
					{raceStreamLink
						? (
							<a
								href={raceStreamLink.href}
								target='_blank'
								rel='noreferrer'
								title={`Watch ${raceStreamLink.label}${raceStreamLink.offsetSeconds > 0 ? ` (+${raceStreamLink.offsetSeconds}s)` : ''}`}
							>
								{`${round?.roundNumber ?? '?'}-${race.raceNumber}`}
							</a>
						)
						: `${round?.roundNumber ?? '?'}-${race.raceNumber}`}
					{matchingBracket && (
						<span style={{ marginLeft: '8px', color: '#888' }}>
							({matchingBracket.name})
						</span>
					)}
				</div>
				<LapsTable race={race} matchingBracket={matchingBracket} />
			</div>
		</div>
	);
}

type LapsTableContext = {
	raceId: string;
	matchingBracket: Bracket | null;
	maxLaps: number;
};

type LapsRow = {
	raceId: string;
	pilotChannel: { id: string; pilotId: string; channelId: string };
	position: number;
	bracketPilot?: BracketPilot | null;
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
	if (!pilot) return <OverflowFadeCell title='-'>-</OverflowFadeCell>;
	return (
		<OverflowFadeCell title={pilot.name}>
			{/* @ts-ignore - TanStack Router type issue, see https://github.com/denoland/deno/issues/30444 */}
			<Link
				to='/pilots/$pilotId'
				/* @ts-ignore - TanStack Router type issue, see https://github.com/denoland/deno/issues/30444 */
				params={{ pilotId: pilot.sourceId }}
				className='leaderboard-pilot-link'
			>
				{pilot.name}
			</Link>
		</OverflowFadeCell>
	);
}

function ChannelCell({ item }: LapsCellProps) {
	const channels = useAtomValue(channelsDataAtom);
	const channel = channels.find((c) => c.id === item.pilotChannel.channelId);
	return (
		<div>
			<div className='flex-row'>
				{channel?.shortBand}
				{channel?.number}
				<ChannelSquare channelID={item.pilotChannel.channelId} />
			</div>
		</div>
	);
}

function BracketPointsCell({ item }: LapsCellProps) {
	const bracketPilot = item.bracketPilot ?? null;
	return (
		<div style={{ color: '#00ff00' }}>
			{bracketPilot ? bracketPilot.points ?? '-' : '-'}
		</div>
	);
}

const bracketRoundCellCache = new Map<number, React.ComponentType<LapsCellProps>>();

function getBracketRoundCell(roundIndex: number): React.ComponentType<LapsCellProps> {
	const cached = bracketRoundCellCache.get(roundIndex);
	if (cached) return cached;

	const BracketRoundCell: React.FC<LapsCellProps> = ({ item }) => {
		const bracketPilot = item.bracketPilot ?? null;
		const roundValue = bracketPilot?.rounds?.[roundIndex] ?? null;
		if (!roundValue) return <div>-</div>;

		const isRaceRound = useIsRaceRound(item.raceId);

		return (
			<div>
				<div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
					{roundValue}
					{isRaceRound && POSITION_POINTS[roundValue] && (
						<span style={{ fontSize: '0.8em', color: '#888' }}>
							+{POSITION_POINTS[roundValue]}
						</span>
					)}
				</div>
			</div>
		);
	};

	bracketRoundCellCache.set(roundIndex, BracketRoundCell);
	return BracketRoundCell;
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

function useLapsTableColumns(
	raceId: string,
	matchingBracket: Bracket | null,
	maxLaps: number,
): { columns: Array<Column<LapsTableContext, LapsRow>>; ctx: LapsTableContext } {
	const processedLapsForRace = useAtomValue(raceProcessedLapsAtom(raceId));

	const ctx = useMemo(() => ({ raceId, matchingBracket, maxLaps }), [raceId, matchingBracket, maxLaps]);

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

		// Points + Bracket rounds (if any)
		if (matchingBracket) {
			// Points
			cols.push({
				key: 'points',
				header: 'Points',
				label: 'Bracket Points',
				width: 64,
				cell: BracketPointsCell,
			});

			const roundsCount = matchingBracket.pilots?.[0]?.rounds?.length ?? 0;
			for (let r = 0; r < roundsCount; r++) {
				const key = `br${r + 1}`;
				cols.push({
					key,
					header: `R${r + 1}`,
					label: `Bracket R${r + 1}`,
					width: 48,
					cell: getBracketRoundCell(r),
				});
			}
		}

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

		return cols;
	}, [hasHoleshot, matchingBracket, maxLaps]);

	return { columns, ctx };
}

function LapsTable(
	{ race, matchingBracket }: { race: PBRaceRecord; matchingBracket: Bracket | null },
) {
	const baseRows: LapsRow[] = useAtomValue(raceSortedRowsAtom(race.id));
	const pilots = useAtomValue(pilotsAtom);
	const maxLaps = useAtomValue(raceMaxLapNumberAtom(race.id));
	const favoritePilotIdsSet = useAtomValue(favoritePilotIdsSetAtom);

	const rows = useMemo(() => {
		if (!matchingBracket) return baseRows;
		const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, '');
		return baseRows.map((row) => {
			const pilot = pilots.find((p) => p.id === row.pilotChannel.pilotId);
			if (!pilot) return row;
			const bracketPilot = matchingBracket.pilots.find((bp: BracketPilot) => normalize(bp.name) === normalize(pilot.name));
			if (!bracketPilot) return row;
			return { ...row, bracketPilot };
		});
	}, [baseRows, matchingBracket, pilots]);

	const { columns, ctx } = useLapsTableColumns(race.id, matchingBracket, maxLaps);

	const getRowClassName = (row: LapsRow) => {
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
