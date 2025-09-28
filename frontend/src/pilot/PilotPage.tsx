import { type ComponentProps, type ComponentType, useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { ChannelSquare } from '../common/ChannelSquare.tsx';
import { FavoriteToggle } from '../common/FavoriteToggle.tsx';
import {
	usePilotBestLapTime,
	usePilotLapGroups,
	usePilotMetricSummary,
	usePilotOverviewMeta,
	usePilotTimeline,
	usePilotUpcomingRaces,
} from './pilot-hooks.ts';
import { PilotAnalyticsTab } from './PilotAnalyticsTab.tsx';
import { PilotLapTableTab } from './PilotLapTableTab.tsx';
import { PilotUpcomingRacesTab } from './PilotUpcomingRacesTab.tsx';
import './PilotPage.css';

const tabs = [
	{ key: 'analytics', label: 'Analytics' },
	{ key: 'laps', label: 'Lap Table' },
	{ key: 'upcoming', label: 'Upcoming Races' },
] as const;

type TabKey = typeof tabs[number]['key'];

const formatSeconds = (time: number | null | undefined): string => {
	if (time == null || Number.isNaN(time)) return '—';
	return `${time.toFixed(3)}s`;
};

export function PilotPage({ pilotId }: { pilotId: string }) {
	const overview = usePilotOverviewMeta(pilotId);
	const metrics = usePilotMetricSummary(pilotId);
	const timeline = usePilotTimeline(pilotId);
	const lapGroups = usePilotLapGroups(pilotId);
	const upcoming = usePilotUpcomingRaces(pilotId);
	const bestLapSeconds = usePilotBestLapTime(pilotId);
	const [activeTab, setActiveTab] = useState<TabKey>('analytics');

	if (!overview.record) {
		return <PilotNotFound />;
	}

	const record = overview.record;

	const givenName = useMemo(() => {
		const first = record.firstName?.trim() ?? '';
		const last = record.lastName?.trim() ?? '';
		const joined = [first, last].filter(Boolean).join(' ');
		if (!joined) return '';
		return joined.toLowerCase() === record.name.trim().toLowerCase() ? '' : joined;
	}, [record]);

	const hasLaps = timeline.length > 0;

	return (
		<div className='pilot-page'>
			<header className='pilot-header'>
				<div className='pilot-header-main'>
					{/* @ts-ignore - TanStack Router type issue, see https://github.com/denoland/deno/issues/30444 */}
					<Link to='/' className='pilot-back-link'>← Back to dashboard</Link>
					<h1>{record.name}</h1>
					{givenName && <span className='pilot-given-name'>{givenName}</span>}
				</div>
				<div className='pilot-header-meta'>
					<FavoriteToggle
						pilotId={pilotId}
						size='lg'
						className='pilot-favorite-toggle'
						favoritedTooltip='Remove from favorites'
						notFavoritedTooltip='Add to favorites'
					/>
					{overview.preferredChannel && (
						<div className='pilot-meta-chip'>
							<ChannelSquare channelID={overview.preferredChannel.id} />
							<span>{overview.preferredChannel.label}</span>
						</div>
					)}
					{overview.bracket && (
						<div className='pilot-meta-chip'>
							<span>{overview.bracket.name}</span>
							<span className='pilot-meta-sub'>{overview.bracket.points} pts</span>
						</div>
					)}
				</div>
			</header>

			<section className='pilot-stat-grid' aria-label='Pilot overview statistics'>
				<PilotStatCard
					label='Best Lap'
					value={formatSeconds(metrics.bestLap?.time)}
					subtitle={metrics.bestLap ? `Lap ${metrics.bestLap.lapNumber} · ${metrics.bestLap.raceLabel}` : '—'}
				/>
				<PilotStatCard
					label='Fastest Consecutive'
					value={formatSeconds(metrics.fastestConsecutive?.time)}
					subtitle={metrics.fastestConsecutive
						? `${metrics.fastestConsecutive.lapWindow} laps · ${metrics.fastestConsecutive.raceLabel}`
						: '—'}
				/>
				<PilotStatCard
					label='Fastest Total Race'
					value={formatSeconds(metrics.fastestRace?.time)}
					subtitle={metrics.fastestRace ? `${metrics.fastestRace.lapCount} laps · ${metrics.fastestRace.raceLabel}` : '—'}
				/>
				<PilotStatCard
					label='Holeshot'
					value={formatSeconds(metrics.holeshot?.time)}
					subtitle={metrics.holeshot ? metrics.holeshot.raceLabel : '—'}
				/>
				<PilotStatCard
					label='Total Laps'
					value={metrics.totalCompletedLaps.toString()}
					subtitle={hasLaps ? 'Completed laps this event' : 'No laps yet'}
				/>
			</section>

			<nav className='pilot-tabs' role='tablist'>
				{tabs.map((tab) => {
					const id = `pilot-tab-${tab.key}`;
					const isActive = activeTab === tab.key;
					return (
						<button
							type='button'
							role='tab'
							id={id}
							key={tab.key}
							aria-selected={isActive}
							aria-controls={`pilot-panel-${tab.key}`}
							className={isActive ? 'active' : ''}
							onClick={() => setActiveTab(tab.key)}
						>
							{tab.label}
						</button>
					);
				})}
			</nav>

			{tabs.map((tab) => {
				const isActive = activeTab === tab.key;
				return (
					<section
						key={tab.key}
						id={`pilot-panel-${tab.key}`}
						role='tabpanel'
						aria-labelledby={`pilot-tab-${tab.key}`}
						hidden={!isActive}
						className='pilot-tab-panel'
					>
						{isActive && tab.key === 'analytics' && (
							<PilotAnalyticsTab
								pilotId={pilotId}
								timeline={timeline}
								lapGroups={lapGroups}
								metrics={metrics}
							/>
						)}
						{isActive && tab.key === 'laps' && (
							<PilotLapTableTab
								pilotId={pilotId}
								lapGroups={lapGroups}
								bestLapSeconds={bestLapSeconds}
							/>
						)}
						{isActive && tab.key === 'upcoming' && <PilotUpcomingRacesTab upcoming={upcoming} />}
					</section>
				);
			})}
		</div>
	);
}

function PilotNotFound() {
	return (
		<div className='pilot-not-found'>
			<h2>Pilot not found</h2>
			<p>The requested pilot does not exist or is unavailable for this event.</p>
			{/* @ts-ignore - TanStack Router type issue, see https://github.com/denoland/deno/issues/30444 */}
			<Link to='/' className='pilot-back-link secondary'>Return to dashboard</Link>
		</div>
	);
}

function PilotStatCard({ label, value, subtitle }: { label: string; value: string; subtitle?: string }) {
	const isEmpty = value === '—';
	return (
		<div className={`pilot-stat-card${isEmpty ? ' pilot-stat-card--empty' : ''}`}>
			<span className='pilot-stat-label'>{label}</span>
			<span className='pilot-stat-value'>{value}</span>
			{subtitle && <span className='pilot-stat-subtitle'>{subtitle}</span>}
		</div>
	);
}
