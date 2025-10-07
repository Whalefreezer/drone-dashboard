import type { PilotUpcomingRace } from './pilot-state.ts';
import { ChannelSquare } from '../common/ChannelSquare.tsx';
import { StreamTimestampLink } from '../stream/StreamTimestampLink.tsx';
import { parseTimestampMs } from '../common/time.ts';

interface PilotUpcomingRacesTabProps {
	upcoming: PilotUpcomingRace[];
}

export function PilotUpcomingRacesTab(
	{ upcoming }: PilotUpcomingRacesTabProps,
) {
	if (upcoming.length === 0) {
		return <div className='pilot-empty-state'>No upcoming races scheduled.</div>;
	}

	const [nextRace, ...later] = upcoming;

	const renderRaceLabel = (race: PilotUpcomingRace) => {
		const timestampMs = parseTimestampMs(race.startTime ?? null);
		return (
			<StreamTimestampLink timestampMs={timestampMs}>
				{race.raceLabel}
			</StreamTimestampLink>
		);
	};

	return (
		<div className='pilot-upcoming-tab'>
			{nextRace && (
				<section className='pilot-next-card'>
					<header>
						<h2>Next race</h2>
						<p>{renderRaceLabel(nextRace)}</p>
						<span className='pilot-next-countdown'>{formatCountdown(nextRace.racesUntil, nextRace.overrideLabel)}</span>
					</header>
					<RaceMeta race={nextRace} />
				</section>
			)}
			{later.length > 0 && (
				<div className='pilot-upcoming-grid'>
					{later.map((race) => (
						<article key={race.raceId} className='pilot-upcoming-card'>
							<header>
								<h3>{renderRaceLabel(race)}</h3>
								<p>{formatCountdown(race.racesUntil, race.overrideLabel)}</p>
							</header>
							<RaceMeta race={race} />
						</article>
					))}
				</div>
			)}
		</div>
	);
}

function RaceMeta({ race }: { race: PilotUpcomingRace }) {
	return (
		<div className='pilot-upcoming-meta'>
			<div className='pilot-upcoming-line'>
				<span className='pilot-upcoming-label'>Channel</span>
				<div className='pilot-upcoming-channel'>
					{race.channel ? <ChannelSquare channelID={race.channel.id} /> : <span className='pilot-upcoming-channel-placeholder'>—</span>}
					<span>{race.channel?.label ?? '—'}</span>
				</div>
			</div>
			<div className='pilot-upcoming-line'>
				<span className='pilot-upcoming-label'>Starts</span>
				<span>{formatStartTime(race.startTime)}</span>
			</div>
			<div className='pilot-upcoming-line'>
				<span className='pilot-upcoming-label'>Competitors</span>
				<div className='pilot-upcoming-competitors'>
					{race.competitors.length === 0
						? <span className='pilot-upcoming-empty'>TBD</span>
						: race.competitors.map((competitor) => (
							<span key={competitor.pilotId} className='pilot-upcoming-competitor'>
								{competitor.channel
									? <ChannelSquare channelID={competitor.channel.id} />
									: <span className='pilot-upcoming-channel-placeholder'>—</span>}
								<span>{competitor.name}</span>
							</span>
						))}
				</div>
			</div>
		</div>
	);
}

const formatCountdown = (value: number, overrideLabel: string | null): string => {
	if (value <= 0) return 'Staging';
	if (overrideLabel) return overrideLabel;
	if (value === 1) return 'In 1 race';
	return `In ${value} races`;
};

const formatStartTime = (value: string | null | undefined): string => {
	if (!value) return 'TBD';
	const parsed = Number.isFinite(Number(value)) ? new Date(Number(value)) : new Date(value);
	if (Number.isNaN(parsed.getTime())) return 'TBD';
	return parsed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};
