import { createFileRoute } from '@tanstack/react-router';
import { useAtomValue } from 'jotai';
import {
	currentEventAtom,
	detectionRecordsAtom,
	eventPilotsAtom,
	gamePointRecordsAtom,
	pilotChannelRecordsAtom,
} from '../../state/pbAtoms.ts';
import { usePurgeCacheAction } from '../../admin/tools/usePurgeCacheAction.ts';
import { useSyncEventPilotsAction } from '../../admin/tools/useSyncEventPilotsAction.ts';
import { useUnusedPilotsAction } from '../../admin/tools/useUnusedPilotsAction.ts';

function ToolsPage() {
	const currentEvent = useAtomValue(currentEventAtom);
	const eventPilots = useAtomValue(eventPilotsAtom);
	const detections = useAtomValue(detectionRecordsAtom);
	const gamePoints = useAtomValue(gamePointRecordsAtom);
	const pilotChannels = useAtomValue(pilotChannelRecordsAtom);

	const {
		purging,
		purgeResult,
		purgeError,
		handlePurge,
	} = usePurgeCacheAction();

	const {
		syncing,
		syncResult,
		syncError,
		syncPreview,
		handlePreviewSync,
		handleSyncPilots,
	} = useSyncEventPilotsAction({
		currentEvent,
		eventPilots,
		detections,
		gamePoints,
		pilotChannels,
	});

	const {
		findingUnused,
		unusedPilots,
		unusedError,
		deletingUnused,
		handleFindUnusedPilots,
		handleDeleteUnusedPilots,
	} = useUnusedPilotsAction({
		eventPilots,
		detections,
		gamePoints,
		pilotChannels,
	});

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
				<h2>Pilot Sync</h2>
				<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
					<div>
						<p className='muted'>
							Scan all client-side data (detections, gamePoints, pilotChannels) for pilot IDs and add any missing pilots to the event_pilots
							table for the current event.
						</p>
					</div>
					{!currentEvent && (
						<div style={{ color: '#ffa500' }}>
							No event selected. Please select an event first.
						</div>
					)}
					<div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
						<button
							type='button'
							onClick={handlePreviewSync}
							disabled={!currentEvent}
							style={{
								backgroundColor: '#6c757d',
								color: 'white',
								border: 'none',
								padding: '8px 16px',
								borderRadius: '4px',
								cursor: !currentEvent ? 'not-allowed' : 'pointer',
								opacity: !currentEvent ? 0.6 : 1,
							}}
						>
							Preview Changes
						</button>
						<button
							type='button'
							onClick={handleSyncPilots}
							disabled={syncing || !currentEvent}
							style={{
								backgroundColor: '#007bff',
								color: 'white',
								border: 'none',
								padding: '8px 16px',
								borderRadius: '4px',
								cursor: syncing || !currentEvent ? 'not-allowed' : 'pointer',
								opacity: syncing || !currentEvent ? 0.6 : 1,
							}}
						>
							{syncing ? 'Syncing...' : 'Sync Pilots to event_pilots'}
						</button>
						{syncError && <span style={{ color: 'crimson' }}>{syncError}</span>}
					</div>
					{syncPreview && (
						<div style={{ padding: 12, backgroundColor: '#1e4620', borderRadius: 4, border: '1px solid #2d6930' }}>
							<h4 style={{ margin: '0 0 8px 0', color: '#90ee90' }}>Preview: What will be synced</h4>
							<div style={{ color: '#d0d0d0' }}>
								<strong>Pilots to be added:</strong> {syncPreview.pilotIds.length}
							</div>
							{syncPreview.pilotIds.length > 0 && (
								<div style={{ marginTop: 8 }}>
									<strong style={{ color: '#d0d0d0' }}>Pilot IDs:</strong>
									<ul style={{ margin: '4px 0 0 0', paddingLeft: 20, color: '#b0b0b0' }}>
										{syncPreview.pilotIds.map((id) => <li key={id} style={{ fontFamily: 'monospace', fontSize: '0.9em' }}>{id}</li>)}
									</ul>
								</div>
							)}
							{syncPreview.pilotIds.length === 0 && (
								<div style={{ marginTop: 8, color: '#a0a0a0' }}>
									All pilots are already synced to event_pilots. Nothing to add.
								</div>
							)}
						</div>
					)}
					{syncResult && (
						<div className='sync-result' style={{ padding: 12, backgroundColor: '#1e4620', borderRadius: 4, border: '1px solid #2d6930' }}>
							<h4 style={{ margin: '0 0 8px 0', color: '#90ee90' }}>Sync Complete</h4>
							<div style={{ color: '#d0d0d0' }}>
								<strong>Pilots added:</strong> {syncResult.added}
							</div>
							{syncResult.pilotIds.length > 0 && (
								<div style={{ marginTop: 8 }}>
									<strong style={{ color: '#d0d0d0' }}>Pilot IDs added:</strong>
									<ul style={{ margin: '4px 0 0 0', paddingLeft: 20, color: '#b0b0b0' }}>
										{syncResult.pilotIds.map((id) => <li key={id} style={{ fontFamily: 'monospace', fontSize: '0.9em' }}>{id}</li>)}
									</ul>
								</div>
							)}
							{syncResult.added === 0 && (
								<div style={{ marginTop: 8, color: '#a0a0a0' }}>
									All pilots are already synced to event_pilots.
								</div>
							)}
						</div>
					)}
				</div>
			</div>
			<div className='section-card'>
				<h2>Find Unused Pilots</h2>
				<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
					<div>
						<p className='muted'>
							Find pilots in event_pilots that are not referenced in detections, gamePoints, or pilotChannels.
						</p>
					</div>
					<div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
						<button
							type='button'
							onClick={handleFindUnusedPilots}
							disabled={findingUnused}
							style={{
								backgroundColor: '#6c757d',
								color: 'white',
								border: 'none',
								padding: '8px 16px',
								borderRadius: '4px',
								cursor: findingUnused ? 'not-allowed' : 'pointer',
								opacity: findingUnused ? 0.6 : 1,
							}}
						>
							{findingUnused ? 'Searching...' : 'Find Unused Pilots'}
						</button>
						{unusedError && <span style={{ color: 'crimson' }}>{unusedError}</span>}
					</div>
					{unusedPilots && (
						<div style={{ padding: 12, backgroundColor: '#2d2d30', borderRadius: 4, border: '1px solid #3e3e42' }}>
							<h4 style={{ margin: '0 0 8px 0', color: '#d0d0d0' }}>Unused Pilots</h4>
							<div style={{ color: '#d0d0d0' }}>
								<strong>Total unused:</strong> {unusedPilots.length}
							</div>
							{unusedPilots.length > 0 && (
								<>
									<div style={{ marginTop: 8 }}>
										<strong style={{ color: '#d0d0d0' }}>Pilot IDs:</strong>
										<ul style={{ margin: '4px 0 0 0', paddingLeft: 20, color: '#b0b0b0' }}>
											{unusedPilots.map((id) => <li key={id} style={{ fontFamily: 'monospace', fontSize: '0.9em' }}>{id}</li>)}
										</ul>
									</div>
									<div style={{ marginTop: 12 }}>
										<button
											type='button'
											onClick={handleDeleteUnusedPilots}
											disabled={deletingUnused}
											style={{
												backgroundColor: '#dc3545',
												color: 'white',
												border: 'none',
												padding: '8px 16px',
												borderRadius: '4px',
												cursor: deletingUnused ? 'not-allowed' : 'pointer',
												opacity: deletingUnused ? 0.6 : 1,
											}}
										>
											{deletingUnused ? 'Removing...' : `Remove ${unusedPilots.length} from event_pilots`}
										</button>
									</div>
								</>
							)}
							{unusedPilots.length === 0 && (
								<div style={{ marginTop: 8, color: '#a0a0a0' }}>
									All pilots in event_pilots are referenced in data.
								</div>
							)}
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
