import { createFileRoute, Link } from '@tanstack/react-router';
import { useAtomValue } from 'jotai';
import { useMemo, useState } from 'react';
import type { PBControlStatsRecord } from '../../api/pbTypes.ts';
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
	const [controlBaseline, setControlBaseline] = useState<Record<string, ControlTotals>>({});

	const baselineSnapshot = useMemo(() => controlBaseline, [controlBaseline]);

	const totalPilots = currentEvent ? pilots.filter((pilot) => pilot.event === currentEvent.id).length : pilots.length;

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
			title: 'Server settings',
			description: 'Runtime feature flags',
			value: formatNumber(settings.length),
			to: '/admin/settings',
			accent: 'fuchsia',
		},
	];

	const controlBuckets = controlStats.filter((stat) => stat.bucket !== 'overall');
	const sortedControl = [...controlBuckets].sort((a, b) => (b.total ?? 0) - (a.total ?? 0));
	const overall = controlStats.find((stat) => stat.bucket === 'overall');
	const overallTotals = summariseControlStats(overall, baselineSnapshot['overall']);

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

			<section className='section-card control-section'>
				<header className='section-heading'>
					<div>
						<h2>Control link efficiency</h2>
						<p className='muted'>Per-bucket breakdown of websocket fetches negotiated with the pits client.</p>
					</div>
					<div className='control-totals'>
						<SummaryPill label='Total requests' value={formatNumber(overallTotals.total)} tone='neutral' />
						<SummaryPill label='Hit 304 / cached' value={`${overallTotals.etagHitRate}%`} tone='success' />
						<SummaryPill
							label='Errors'
							value={formatNumber(overallTotals.errors)}
							tone={overallTotals.errors > 0 ? 'warning' : 'neutral'}
						/>
					</div>
				</header>
				<div className='control-actions'>
					<button
						type='button'
						onClick={() => setControlBaseline(snapshotControlTotals(controlStats))}
					>
						Start Fresh Sample
					</button>
					{Object.keys(controlBaseline).length > 0 && <span className='muted baseline-hint'>Showing deltas since snapshot</span>}
				</div>
				<div className='control-table'>
					{sortedControl.length === 0 && <EmptyHint message='Waiting for control traffic…' />}
					{sortedControl.map((bucket) => {
						const summary = summariseControlStats(bucket, baselineSnapshot[bucket.bucket]);
						return (
							<div key={bucket.id ?? bucket.bucket} className='control-row'>
								<div className='control-label'>
									<span className='badge'>{bucket.bucket}</span>
									<span className='muted'>
										{formatNumber(summary.total)} requests
									</span>
								</div>
								<div className='control-progress'>
									<div className='progress-track'>
										<div
											className='progress-bar success'
											style={{ width: `${summary.etagPercent}%` }}
											title={`Cached hits (304): ${formatNumber(summary.etagHits)}`}
										/>
										<div
											className='progress-bar info'
											style={{ width: `${summary.fullPercent}%`, left: `${summary.etagPercent}%` }}
											title={`Full responses: ${formatNumber(summary.fullResponses)}`}
										/>
										<div
											className='progress-bar warning'
											style={{ width: `${summary.errorPercent}%`, left: `${summary.etagPercent + summary.fullPercent}%` }}
											title={`Errors: ${formatNumber(summary.errors)}`}
										/>
									</div>
								</div>
								<div className='control-stats'>
									<span className='muted'>304: {summary.etagHitRate}% ({formatNumber(summary.etagHits)})</span>
									<span className='muted'>Full: {summary.fullRate}% ({formatNumber(summary.fullResponses)})</span>
									<span className='muted'>Errors: {summary.errorRate}% ({formatNumber(summary.errors)})</span>
								</div>
							</div>
						);
					})}
				</div>
			</section>
		</div>
	);
}

interface MetricCardProps {
	title: string;
	description: string;
	value: string;
	to: string;
	accent: 'sky' | 'violet' | 'emerald' | 'amber' | 'fuchsia';
}

function MetricCard({ title, description, value, to, accent }: MetricCardProps) {
	return (
		/* @ts-ignore - TanStack Router typing quirk */
		<Link to={to} className={`metric-card accent-${accent}`}>
			<div>
				<span className='metric-title'>{title}</span>
				<p className='metric-description'>{description}</p>
			</div>
			<strong className='metric-value'>{value}</strong>
		</Link>
	);
}

function SummaryPill({ label, value, tone }: { label: string; value: string; tone: PillTone }) {
	return (
		<div className={`summary-pill tone-${tone}`}>
			<span>{label}</span>
			<strong>{value}</strong>
		</div>
	);
}

type PillTone = 'neutral' | 'success' | 'warning' | 'muted';

type ControlTotals = {
	total: number;
	fullResponses: number;
	etagHits: number;
	errors: number;
};

function EmptyHint({ message }: { message: string }) {
	return <div className='muted empty-hint'>{message}</div>;
}

function summariseControlStats(
	stat?: { total?: number; fullResponses?: number; etagHits?: number; errors?: number },
	baseline?: ControlTotals,
) {
	const raw = extractControlTotals(stat);
	const base = baseline ?? zeroControlTotals();
	const etagHits = Math.max(0, raw.etagHits - base.etagHits);
	const fullResponses = Math.max(0, raw.fullResponses - base.fullResponses);
	const errors = Math.max(0, raw.errors - base.errors);
	const totalFromParts = etagHits + fullResponses + errors;
	const total = totalFromParts > 0 ? totalFromParts : Math.max(0, raw.total - base.total);
	const safeTotal = total === 0 ? 1 : total;
	const pct = (value: number) => Math.min(100, Math.round((value / safeTotal) * 100));
	return {
		total,
		etagHits,
		fullResponses,
		errors,
		etagPercent: pct(etagHits),
		fullPercent: pct(fullResponses),
		errorPercent: pct(errors),
		etagHitRate: pct(etagHits).toString(),
		fullRate: pct(fullResponses).toString(),
		errorRate: pct(errors).toString(),
	};
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

function extractControlTotals(stat?: { total?: number; fullResponses?: number; etagHits?: number; errors?: number }): ControlTotals {
	const fullResponses = stat?.fullResponses ?? 0;
	const etagHits = stat?.etagHits ?? 0;
	const errors = stat?.errors ?? 0;
	const componentsTotal = fullResponses + etagHits + errors;
	const total = stat?.total ?? componentsTotal;
	return { total, fullResponses, etagHits, errors };
}

function zeroControlTotals(): ControlTotals {
	return { total: 0, fullResponses: 0, etagHits: 0, errors: 0 };
}

function snapshotControlTotals(stats: readonly PBControlStatsRecord[]): Record<string, ControlTotals> {
	const entries = stats.map((stat) => [stat.bucket, extractControlTotals(stat)] as const);
	return Object.fromEntries(entries);
}

// @ts-ignore type quirk noted in repo
export const Route = createFileRoute('/admin/dashboard')({ component: Dashboard });
