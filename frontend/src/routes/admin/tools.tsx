import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { pb } from '../../api/pb.ts';

type PurgeSummary = {
	events: number;
	rounds: number;
	pilots: number;
	channels: number;
	tracks: number;
	races: number;
	pilotChannels: number;
	detections: number;
	laps: number;
	gamePoints: number;
	results: number;
	ingestTargets: number;
	currentOrders: number;
	controlStats: number;
};

function ToolsPage() {
	const [purging, setPurging] = useState(false);
	const [purgeResult, setPurgeResult] = useState<PurgeSummary | null>(null);
	const [purgeError, setPurgeError] = useState<string | null>(null);

	async function handlePurge() {
		if (!confirm('This will permanently delete all FPVTrackside cache data. Are you sure?')) {
			return;
		}

		setPurging(true);
		setPurgeResult(null);
		setPurgeError(null);

		try {
			const response = await pb.send('/ingest/purge', {
				method: 'POST',
			});

			setPurgeResult(response as PurgeSummary);
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			setPurgeError(message);
		} finally {
			setPurging(false);
		}
	}

	return (
		<div className='admin-page' style={{ padding: 16, display: 'grid', gap: 16 }}>
			<div className='section-card'>
				<h2>Cache Management</h2>
				<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
					<div>
						<p className='muted'>
							Purge all FPVTrackside-derived cache data from the database. This includes events, races, pilots, detections, results, and all
							related records, plus current race order state. The scheduler will automatically rediscover data after purging.
						</p>
					</div>
					<div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
						<button
							type='button'
							onClick={handlePurge}
							disabled={purging}
							style={{
								backgroundColor: '#dc3545',
								color: 'white',
								border: 'none',
								padding: '8px 16px',
								borderRadius: '4px',
								cursor: purging ? 'not-allowed' : 'pointer',
							}}
						>
							{purging ? 'Purging...' : 'Purge All Cache Data'}
						</button>
						{purgeError && <span style={{ color: 'crimson' }}>{purgeError}</span>}
					</div>
					{purgeResult && (
						<div className='purge-result'>
							<h4>Purge Complete</h4>
							<div className='purge-stats-grid'>
								<div className='purge-stat-item'>
									<strong>Events:</strong> {purgeResult.events}
								</div>
								<div className='purge-stat-item'>
									<strong>Rounds:</strong> {purgeResult.rounds}
								</div>
								<div className='purge-stat-item'>
									<strong>Pilots:</strong> {purgeResult.pilots}
								</div>
								<div className='purge-stat-item'>
									<strong>Channels:</strong> {purgeResult.channels}
								</div>
								<div className='purge-stat-item'>
									<strong>Tracks:</strong> {purgeResult.tracks}
								</div>
								<div className='purge-stat-item'>
									<strong>Races:</strong> {purgeResult.races}
								</div>
								<div className='purge-stat-item'>
									<strong>Pilot Channels:</strong> {purgeResult.pilotChannels}
								</div>
								<div className='purge-stat-item'>
									<strong>Detections:</strong> {purgeResult.detections}
								</div>
								<div className='purge-stat-item'>
									<strong>Laps:</strong> {purgeResult.laps}
								</div>
								<div className='purge-stat-item'>
									<strong>Game Points:</strong> {purgeResult.gamePoints}
								</div>
								<div className='purge-stat-item'>
									<strong>Results:</strong> {purgeResult.results}
								</div>
								<div className='purge-stat-item'>
									<strong>Ingest Targets:</strong> {purgeResult.ingestTargets}
								</div>
								<div className='purge-stat-item'>
									<strong>Current Orders:</strong> {purgeResult.currentOrders}
								</div>
								<div className='purge-stat-item'>
									<strong>Control Stats:</strong> {purgeResult.controlStats}
								</div>
							</div>
							<p className='purge-result-footer'>
								The scheduler will automatically rediscover data on the next cycle.
							</p>
						</div>
					)}
				</div>
			</div>
			<div className='section-card'>
				<h2>Other Tools</h2>
				<p className='muted'>Coming soon: Devtools, scenario loader, snapshots, import/export.</p>
			</div>
		</div>
	);
}

// @ts-ignore type quirk noted in repo
export const Route = createFileRoute('/admin/tools')({ component: ToolsPage });
