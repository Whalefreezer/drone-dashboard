import React from 'react';
import type { Atom } from 'jotai';
import type { Column } from '../common/GenericTable.tsx';
import { useAtomValue } from 'jotai';
import { leaderboardPilotIdsAtom, positionChangesAtom } from './leaderboard-atoms.ts';
import { pilotEliminatedInfoAtom, pilotPreferredChannelAtom, pilotRacesUntilNextAtom } from './leaderboard-context-atoms.ts';
import { racesAtom, roundsDataAtom } from '../state/index.ts';
import { pilotsAtom } from '../state/pbAtoms.ts';
import type { PBChannelRecord } from '../api/pbTypes.ts';
import { ChannelSquare } from '../common/ChannelSquare.tsx';
import { pilotBestLapAtom, pilotConsecAtom, pilotFastestTotalRaceAtom, pilotHoleshotAtom, pilotTotalLapsAtom } from './metric-factory.ts';
import { currentRaceIndexAtom } from '../race/race-atoms.ts';
import { OverflowFadeCell } from '../common/OverflowFadeCell.tsx';

export type TableContext = { consecutiveLaps: number };
export interface LeaderboardRowProps {
	pilotId: string;
}

// Small table cell that detects overflow and applies a fade class
// Position cell uses calculated positionChanges from atom
function PositionCell(
	{ pilotId, currentPosition }: { pilotId: string; currentPosition: number },
) {
	const positionChanges = useAtomValue(positionChangesAtom);
	const prevPos = positionChanges.get(pilotId);
	const showChange = prevPos && prevPos !== currentPosition;
	const change = showChange ? prevPos - currentPosition : 0;

	return (
		<OverflowFadeCell>
			<div className='position-container'>
				<div>{currentPosition}</div>
				{showChange && change > 0 && <span className='position-change'>↑{change}</span>}
			</div>
		</OverflowFadeCell>
	);
}

function ChannelDisplayCell({ channel }: { channel: PBChannelRecord | null }) {
	if (!channel) return <div>-</div>;
	return (
		<OverflowFadeCell>
			<div className='channel-display'>
				{channel.shortBand}
				{channel.number}
				<ChannelSquare channelID={channel.id} />
			</div>
		</OverflowFadeCell>
	);
}

type StatTime = { time: number; roundId: string; raceNumber: number } | null;

type TimeMetric = { time: number; raceId: string };
type TimeMetricPair = { current: TimeMetric | null; previous: TimeMetric | null };

function RenderTimeCell(
	{ metricAtom }: { metricAtom: Atom<TimeMetricPair | Promise<TimeMetricPair>> }, // eagerAtom may yield value or Promise
) {
	const currentRaceIndex = useAtomValue(currentRaceIndexAtom);
	const roundDataValue = useAtomValue(roundsDataAtom);
	const races = useAtomValue(racesAtom);

	const { current, previous } = useAtomValue(metricAtom);

	const toStat = (val: { time: number; raceId: string } | null): StatTime => {
		if (!val) return null;
		const r = races.find((x) => x.id === val.raceId);
		if (!r) return null;
		return { time: val.time, roundId: r.round ?? '', raceNumber: r.raceNumber ?? 0 };
	};

	const currentTime = toStat(current);
	const previousTime = toStat(previous);
	if (!currentTime) return <div>-</div>;

	const raceIndex = races.findIndex((race) => race.round === currentTime.roundId && race.raceNumber === currentTime.raceNumber);
	const isRecent = raceIndex === currentRaceIndex || raceIndex === currentRaceIndex - 1;
	const showDiff = previousTime && previousTime.time !== currentTime.time && isRecent;
	const roundInfo = roundDataValue.find((r) => r.id === currentTime.roundId);
	const roundDisplay = roundInfo ? roundInfo.roundNumber : '?';

	// Build hover title indicating where the time was achieved
	const title = `Round ${roundDisplay}, Race ${currentTime.raceNumber}`;

	return (
		<OverflowFadeCell title={title}>
			<div style={{ display: 'flex', flexDirection: 'column' }}>
				<div>
					{currentTime.time.toFixed(3)}
					<span className='source-info'>({roundDisplay}-{currentTime.raceNumber})</span>
				</div>
				{showDiff && previousTime && (
					<div
						style={{
							fontSize: '0.8em',
							color: previousTime.time > currentTime.time ? '#00ff00' : '#ff0000',
						}}
					>
						{formatTimeDifference(currentTime.time, previousTime.time)}
					</div>
				)}
			</div>
		</OverflowFadeCell>
	);
}

function formatTimeDifference(newTime: number, oldTime: number): string {
	const diff = oldTime - newTime;
	return diff > 0 ? `-${diff.toFixed(3)}` : `+${(-diff).toFixed(3)}`;
}

function NextRaceCell(
	{ racesUntilNext, isEliminated }: { racesUntilNext: number; isEliminated: boolean },
) {
	let content: React.ReactNode;
	if (racesUntilNext === -1 && isEliminated) content = <span className='done-text'>Done</span>;
	else if (racesUntilNext === -1) content = '-';
	else if (racesUntilNext === 0) content = <span className='next-text'>To Staging</span>;
	else if (racesUntilNext === -2) content = <span className='racing-text'>Racing</span>;
	else content = `${racesUntilNext}`;
	return <div>{content}</div>;
}

// eliminated info is provided by pilotEliminatedInfoAtom

// Type for leaderboard entry properties that are StatTime
// Removed createTimeComparisonCell; pass metric atoms directly to RenderTimeCell

export function getLeaderboardColumns(
	ctx: TableContext,
): Array<Column<TableContext, LeaderboardRowProps>> {
	const cols: Array<Column<TableContext, LeaderboardRowProps>> = [
		{
			key: 'position',
			header: '',
			width: 32,
			cell: function PositionCellInline({ item: { pilotId } }) {
				const ids = useAtomValue(leaderboardPilotIdsAtom);
				const idx = ids.findIndex((id) => id === pilotId);
				const pos = idx >= 0 ? idx + 1 : 0;
				return <PositionCell pilotId={pilotId} currentPosition={pos} />;
			},
		},
		{
			key: 'pilot',
			header: 'Pilot',
			// Let the Pilot column flex to consume remaining space.
			// Keep a reasonable minimum so it doesn't collapse.
			minWidth: 100,
			cell: function PilotCellInline({ item: { pilotId } }) {
				const pilots = useAtomValue(pilotsAtom);
				const pilot = pilots.find((p) => p.id === pilotId);
				if (!pilot) return <OverflowFadeCell className='pilot-col'>-</OverflowFadeCell>;
				return (
					<OverflowFadeCell className='pilot-col' title={pilot.name}>
						{pilot.name}
					</OverflowFadeCell>
				);
			},
		},
		{
			key: 'channel',
			header: 'Chan',
			width: 52,
			cell: function ChannelCellInline({ item: { pilotId } }) {
				const channel = useAtomValue(pilotPreferredChannelAtom(pilotId));
				return <ChannelDisplayCell channel={channel} />;
			},
		},
		{
			key: 'laps',
			header: 'Laps',
			width: 52,
			cell: function LapsCellInline({ item: { pilotId } }) {
				const { current } = useAtomValue(pilotTotalLapsAtom(pilotId));
				return <div>{current ?? 0}</div>;
			},
		},
		{
			key: 'holeshot',
			header: 'Hole shot',
			width: 64,
			cell: function HoleshotCell({ item: { pilotId } }) {
				return <RenderTimeCell metricAtom={pilotHoleshotAtom(pilotId)} />;
			},
		},
		{
			key: 'top-lap',
			header: 'Top Lap',
			width: 72,
			cell: function BestLapCell({ item: { pilotId } }) {
				return <RenderTimeCell metricAtom={pilotBestLapAtom(pilotId)} />;
			},
		},
		...(ctx.consecutiveLaps > 1
			? [{
				key: 'consec',
				header: () => `Top ${ctx.consecutiveLaps} Consec`,
				width: 72,
				cell: function ConsecCell({ item }) {
					const { pilotId } = item;
					return <RenderTimeCell metricAtom={pilotConsecAtom(pilotId)} />;
				},
			} as Column<TableContext, LeaderboardRowProps>]
			: []),
		{
			key: 'fastest-race',
			header: 'Fastest Race',
			width: 72,
			cell: function TotalRaceCell({ item }) {
				const { pilotId } = item;
				return <RenderTimeCell metricAtom={pilotFastestTotalRaceAtom(pilotId)} />;
			},
		},
		{
			key: 'next',
			header: 'Next Race In',
			width: 96,
			cell: function NextRaceStatusCellInline({ item }) {
				const { pilotId } = item;
				const racesUntilNext = useAtomValue(pilotRacesUntilNextAtom(pilotId));
				const elimInfo = useAtomValue(pilotEliminatedInfoAtom(pilotId));
				const isEliminated = !!elimInfo;
				return (
					<NextRaceCell
						racesUntilNext={racesUntilNext}
						isEliminated={isEliminated}
					/>
				);
			},
		},
	];
	return cols;
}
