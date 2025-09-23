import React, { useMemo } from 'react';
import { useAtomValue } from 'jotai';
import { channelsDataAtom, overallBestTimesAtom, pilotsAtom, roundsDataAtom } from '../state/index.ts';
import { raceDataAtom, raceMaxLapNumberAtom, racePilotChannelsAtom, raceProcessedLapsAtom, raceSortedRowsAtom } from './race-atoms.ts';
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
import { ColumnChooser } from '../common/ColumnChooser.tsx';
import { getColumnPrefsAtom } from '../common/columnPrefs.ts';
import { useAtom } from 'jotai';

const POSITION_POINTS: Record<number, number> = {
	1: 10,
	2: 7,
	3: 4,
	4: 3,
};

interface LapsViewProps {
	raceId: string;
}

export function LapsView({ raceId }: LapsViewProps) {
	const roundData = useAtomValue(roundsDataAtom);
	const race = useAtomValue(raceDataAtom(raceId));
	const pilots = useAtomValue(pilotsAtom);
	const pilotChannels = useAtomValue(racePilotChannelsAtom(raceId));

	if (!race) return null;

	const round = roundData.find((r) => r.id === (race.round ?? ''));

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
					{round?.roundNumber}-{race.raceNumber}
					{matchingBracket && (
						<span style={{ marginLeft: '8px', color: '#888' }}>
							({matchingBracket.name})
						</span>
					)}
				</div>
				<div style={{ display: 'flex', justifyContent: 'flex-end', overflow: 'visible' }}>
					<LapsColumns raceId={race.id} matchingBracket={matchingBracket} />
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
	pilotChannel: { id: string; pilotId: string; channelId: string };
	position: number;
};

function useLapsTableColumns(
	raceId: string,
	matchingBracket: Bracket | null,
	maxLaps: number,
): { columns: Array<Column<LapsTableContext, LapsRow>>; ctx: LapsTableContext } {
	const rounds = useAtomValue(roundsDataAtom);
	const raceRec = useAtomValue(raceDataAtom(raceId));
	const roundRec = rounds.find((r) => r.id === (raceRec?.round ?? '')) ?? null;
	const isRaceRound = roundRec?.eventType === EventType.Race;
	const processedLapsForRace = useAtomValue(raceProcessedLapsAtom(raceId));

	const ctx = useMemo(() => ({ raceId, matchingBracket, maxLaps }), [raceId, matchingBracket, maxLaps]);

	// Values that determine the column structure
	const hasHoleshot = processedLapsForRace.some((lap) => lap.isHoleshot);
	const roundsCount = matchingBracket?.pilots?.[0]?.rounds?.length ?? 0;

	const columns = useMemo((): Array<Column<LapsTableContext, LapsRow>> => {
		const cols: Array<Column<LapsTableContext, LapsRow>> = [];

		// Position
		cols.push({
			key: 'pos',
			header: 'Pos',
			label: 'Position',
			width: 56,
			cell: function PosCell({ item: { position } }) {
				return (
					<div>
						{maxLaps > 0
							? (
								<div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
									{getPositionWithSuffix(position)}
									{isRaceRound && POSITION_POINTS[position] && (
										<span style={{ fontSize: '0.8em', color: '#888' }}>
											+{POSITION_POINTS[position]}
										</span>
									)}
								</div>
							)
							: '-'}
					</div>
				);
			},
		});

		// Pilot name (flex)
		cols.push({
			key: 'name',
			header: 'Name',
			label: 'Pilot',
			minWidth: 64,
			cell: function NameCell({ item: { pilotChannel } }) {
				const pilots = useAtomValue(pilotsAtom);
				const pilot = pilots.find((p) => p.id === pilotChannel.pilotId);
				return (
					<OverflowFadeCell title={pilot?.name}>
						{pilot?.name ?? '-'}
					</OverflowFadeCell>
				);
			},
		});

		// Channel
		cols.push({
			key: 'chan',
			header: 'Chan',
			label: 'Channel',
			width: 52,
			cell: function ChanCell({ item: { pilotChannel } }) {
				const channels = useAtomValue(channelsDataAtom);
				const channel = channels.find((c) => c.id === pilotChannel.channelId);
				return (
					<div>
						<div className='flex-row'>
							{channel?.shortBand}
							{channel?.number}
							<ChannelSquare channelID={pilotChannel.channelId} />
						</div>
					</div>
				);
			},
		});

		// Points + Bracket rounds (if any)
		if (matchingBracket) {
			// Points
			cols.push({
				key: 'points',
				header: 'Points',
				label: 'Bracket Points',
				width: 64,
				cell: function PointsCell({ item: { pilotChannel } }) {
					const pilots = useAtomValue(pilotsAtom);
					const pilot = pilots.find((p) => p.id === pilotChannel.pilotId);
					const bracketPilot = matchingBracket?.pilots.find((bp: BracketPilot) =>
						bp.name.toLowerCase().replace(/\s+/g, '') === (pilot?.name ?? '').toLowerCase().replace(/\s+/g, '')
					);
					return (
						<div style={{ color: '#00ff00' }}>
							{bracketPilot ? bracketPilot.points : '-'}
						</div>
					);
				},
			});

			for (let r = 0; r < roundsCount; r++) {
				const key = `br${r + 1}`;
				cols.push({
					key,
					header: `R${r + 1}`,
					label: `Bracket R${r + 1}`,
					width: 48,
					cell: function BracketRoundCell({ item: { pilotChannel } }) {
						const pilots = useAtomValue(pilotsAtom);
						const pilot = pilots.find((p) => p.id === pilotChannel.pilotId);
						const bracketPilot = matchingBracket?.pilots.find((bp: BracketPilot) =>
							bp.name.toLowerCase().replace(/\s+/g, '') === (pilot?.name ?? '').toLowerCase().replace(/\s+/g, '')
						);
						const roundVal = bracketPilot?.rounds?.[r] ?? null;
						return (
							<div>
								{roundVal
									? (
										<div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
											{roundVal}
											{isRaceRound && POSITION_POINTS[roundVal] && (
												<span style={{ fontSize: '0.8em', color: '#888' }}>
													+{POSITION_POINTS[roundVal]}
												</span>
											)}
										</div>
									)
									: '-'}
							</div>
						);
					},
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
				cell: function LapCell({ item: { pilotChannel } }) {
					const { raceId } = ctx;
					const overallBestTimes = useAtomValue(overallBestTimesAtom);
					const processedLaps = useAtomValue(raceProcessedLapsAtom(raceId));
					const pilotLaps = processedLaps.filter((lap) => lap.pilotId === pilotChannel.pilotId);
					const racingLaps = pilotLaps.filter((lap) => !lap.isHoleshot);
					const fastestLap = racingLaps.length > 0 ? Math.min(...racingLaps.map((lap) => lap.lengthSeconds)) : Infinity;
					const overallFastestLap = processedLaps.filter((lap) => !lap.isHoleshot).length > 0
						? Math.min(
							...processedLaps
								.filter((lap) => !lap.isHoleshot)
								.map((lap) => lap.lengthSeconds),
						)
						: Infinity;

					const lapData = pilotLaps.find((lap) => (lap.isHoleshot && i === 0) || (!lap.isHoleshot && lap.lapNumber === i));
					if (!lapData) return <div>-</div>;

					const className = getLapClassName(
						lapData,
						overallBestTimes.overallFastestLap,
						overallBestTimes.pilotBestLaps.get(pilotChannel.pilotId),
						overallFastestLap,
						fastestLap,
					);

					return <div className={className}>{lapData.lengthSeconds.toFixed(3)}</div>;
				},
			});
		}

		return cols;
	}, [isRaceRound, roundsCount, hasHoleshot, maxLaps, matchingBracket, ctx]);

	return { columns, ctx };
}

function LapsTable(
	{ race, matchingBracket }: { race: PBRaceRecord; matchingBracket: Bracket | null },
) {
	const rows: LapsRow[] = useAtomValue(raceSortedRowsAtom(race.id));
	const maxLaps = useAtomValue(raceMaxLapNumberAtom(race.id));

	const { columns, ctx } = useLapsTableColumns(race.id, matchingBracket, maxLaps);

	const allKeys = useMemo(() => columns.map((c) => c.key), [columns]);
	const prefsAtom = useMemo(() => getColumnPrefsAtom('laps', allKeys, allKeys), [allKeys]);
	const [visible] = useAtom(prefsAtom);

	return (
		<GenericTable<LapsTableContext, LapsRow>
			className='laps-table'
			columns={columns}
			data={rows}
			context={ctx}
			getRowKey={(row) => row.pilotChannel.id}
			rowHeight={30}
			visibleColumns={visible}
			scrollX
		/>
	);
}

function LapsColumns(
	{ raceId, matchingBracket }: { raceId: string; matchingBracket: Bracket | null },
) {
	const maxLaps = useAtomValue(raceMaxLapNumberAtom(raceId));
	const { columns } = useLapsTableColumns(raceId, matchingBracket, maxLaps);
	return <ColumnChooser tableId='laps' columns={columns} compact label='Columns' />;
}
