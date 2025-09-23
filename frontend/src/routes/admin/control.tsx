import { createFileRoute } from '@tanstack/react-router';
import { useAtomValue } from 'jotai';
import { useMemo, useState } from 'react';
import type { PBControlStatsRecord } from '../../api/pbTypes.ts';
import { controlStatsRecordsAtom } from '../../state/pbAtoms.ts';

const CONTROL_BUCKET_ORDER = [
	'raceCurrent',
	'raceOther',
	'results',
	'rounds',
	'event',
	'pilots',
	'channels',
	'eventSource',
	'other',
] as const;

const CONTROL_BUCKET_LABELS: Record<string, string> = {
	raceCurrent: 'Current race',
	raceOther: 'Other races',
	results: 'Results',
	rounds: 'Rounds',
	event: 'Event metadata',
	pilots: 'Pilots',
	channels: 'Channels',
	eventSource: 'Event source',
	other: 'Other',
};

function ControlPage() {
	const controlStats = useAtomValue(controlStatsRecordsAtom);
	const [controlBaseline, setControlBaseline] = useState<Record<string, ControlTotals>>({});

	const baselineSnapshot = useMemo(() => controlBaseline, [controlBaseline]);

	const controlBuckets = controlStats.filter((stat) => stat.bucket !== 'overall');
	const orderedKnownBuckets = CONTROL_BUCKET_ORDER
		.map((bucket) => controlBuckets.find((stat) => stat.bucket === bucket))
		.filter((stat): stat is PBControlStatsRecord => Boolean(stat));
	const remainingBuckets = controlBuckets
		.filter((stat) => !CONTROL_BUCKET_ORDER.includes(stat.bucket as (typeof CONTROL_BUCKET_ORDER)[number]))
		.sort((a, b) => a.bucket.localeCompare(b.bucket));
	const sortedControl = [...orderedKnownBuckets, ...remainingBuckets];
	const overall = controlStats.find((stat) => stat.bucket === 'overall');
	const overallTotals = summariseControlStats(overall, baselineSnapshot['overall']);

	return (
		<div className='admin-page'>
			<header className='section-card'>
				<div>
					<h1>Control link efficiency</h1>
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

			<section className='section-card control-section'>
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
						const label = formatBucketLabel(bucket.bucket);
						return (
							<div key={bucket.id ?? bucket.bucket} className='control-row'>
								<div className='control-label'>
									<span className='badge'>{label}</span>
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

function formatNumber(value: number | undefined | null) {
	if (!value) return '0';
	return new Intl.NumberFormat().format(value);
}

function formatBucketLabel(bucket: string) {
	const label = CONTROL_BUCKET_LABELS[bucket];
	if (label) return label;
	return titleCaseFromKey(bucket);
}

function titleCaseFromKey(value: string) {
	const spaced = value
		.replace(/[-_]+/g, ' ')
		.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
		.trim();
	if (spaced === '') return value;
	return spaced.charAt(0).toUpperCase() + spaced.slice(1);
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
export const Route = createFileRoute('/admin/control')({ component: ControlPage });
