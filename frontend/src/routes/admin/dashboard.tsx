import { createFileRoute, Link } from '@tanstack/react-router';
import { useAtomValue } from 'jotai';
import {
	clientKVRecordsAtom,
	controlStatsRecordsAtom,
	currentEventAtom,
	eventsAtom,
	pilotsAtom,
	raceRecordsAtom,
	serverSettingsRecordsAtom,
} from '../../state/pbAtoms.ts';

function Dashboard() {
	const events = useAtomValue(eventsAtom);
	const currentEvent = useAtomValue(currentEventAtom);
	const races = useAtomValue(raceRecordsAtom);
	const kv = useAtomValue(clientKVRecordsAtom);
	const settings = useAtomValue(serverSettingsRecordsAtom);
	const controlStats = useAtomValue(controlStatsRecordsAtom);
	const pilots = useAtomValue(pilotsAtom);

	const totalPilots = pilots.length; // pilotsAtom already filters by current event

	const overviewCards: MetricCardProps[] = [
		{
			title: 'Events',
			description: 'Records in PocketBase',
			value: formatNumber(events.length),
			to: '/admin/settings',
			accent: 'sky',
		},
		{
			title: 'Races',
			description: 'Linked to current season',
			value: formatNumber(races.length),
			to: '/admin/tools',
			accent: 'violet',
		},
		{
			title: 'Client KV pairs',
			description: 'Realtime overlays + UI state',
			value: formatNumber(kv.length),
			to: '/admin/kv',
			accent: 'emerald',
		},
		{
			title: 'Control efficiency',
			description: 'Websocket fetch performance',
			value: formatNumber(controlStats.length),
			to: '/admin/control',
			accent: 'blue',
		},
		{
			title: 'Server settings',
			description: 'Runtime feature flags',
			value: formatNumber(settings.length),
			to: '/admin/settings',
			accent: 'fuchsia',
		},
	];

	return (
		<div className='admin-page admin-dashboard'>
			<header className='dashboard-hero section-card'>
				<div>
					<h1>Operations dashboard</h1>
					<p className='muted'>
						Live telemetry from PocketBase, scheduler and the pits control channel.
					</p>
				</div>
				<div className='hero-summary'>
					<dl>
						<dt>Current event</dt>
						<dd>{currentEvent ? currentEvent.name : 'No event selected'}</dd>
					</dl>
					<dl>
						<dt>Runs</dt>
						<dd>{formatDateRange(currentEvent?.start, currentEvent?.end)}</dd>
					</dl>
					<dl>
						<dt>Pilots</dt>
						<dd>{totalPilots ? formatNumber(totalPilots) : '—'}</dd>
					</dl>
				</div>
			</header>

			<section className='dashboard-grid'>
				{overviewCards.map((card) => <MetricCard key={card.title} {...card} />)}
			</section>
		</div>
	);
}

interface MetricCardProps {
	title: string;
	description: string;
	value: string;
	to: string;
	accent: 'sky' | 'violet' | 'emerald' | 'amber' | 'fuchsia' | 'blue';
}

function MetricCard({ title, description, value, to, accent }: MetricCardProps) {
	return (
		/* @ts-ignore - TanStack Router type issue, see https://github.com/denoland/deno/issues/30444 */
		<Link to={to} className={`metric-card accent-${accent}`}>
			<div>
				<span className='metric-title'>{title}</span>
				<p className='metric-description'>{description}</p>
			</div>
			<strong className='metric-value'>{value}</strong>
		</Link>
	);
}

type PillTone = 'neutral' | 'success' | 'warning' | 'muted';

function SummaryPill({ label, value, tone }: { label: string; value: string; tone: PillTone }) {
	return (
		<div className={`summary-pill tone-${tone}`}>
			<span>{label}</span>
			<strong>{value}</strong>
		</div>
	);
}

function formatDateRange(start?: string, end?: string) {
	if (!start && !end) return '—';
	const formatter = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
	const parts = [start, end].filter(Boolean).map((value) => {
		try {
			return formatter.format(new Date(value as string));
		} catch {
			return value;
		}
	});
	return parts.join(' – ');
}

function formatNumber(value: number | undefined | null) {
	if (!value) return '0';
	return new Intl.NumberFormat().format(value);
}

// @ts-ignore type quirk noted in repo
export const Route = createFileRoute('/admin/dashboard')({ component: Dashboard });
