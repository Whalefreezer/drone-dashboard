import { createFileRoute, Link } from '@tanstack/react-router';
import { useAtomValue } from 'jotai';
import {
	clientKVRecordsAtom,
	eventsAtom,
	ingestTargetRecordsAtom,
	raceRecordsAtom,
	serverSettingsRecordsAtom,
} from '../../state/pbAtoms.ts';

function Dashboard() {
	const events = useAtomValue(eventsAtom);
	const races = useAtomValue(raceRecordsAtom);
	const kv = useAtomValue(clientKVRecordsAtom);
	const ingest = useAtomValue(ingestTargetRecordsAtom);
	const settings = useAtomValue(serverSettingsRecordsAtom);

	return (
		<div className='admin-page' style={{ padding: 16, display: 'grid', gap: 16 }}>
			<div className='section-card'>
				<h2>Overview</h2>
				<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
					<Stat title='Events' value={events.length} to='/admin/kv' />
					<Stat title='Races' value={races.length} to='/admin/kv' />
					<Stat title='Client KV' value={kv.length} to='/admin/kv' />
					<Stat title='Ingest Targets' value={ingest.length} to='/admin/ingest' />
					<Stat title='Server Settings' value={settings.length} to='/admin/settings' />
				</div>
			</div>
		</div>
	);
}

function Stat({ title, value, to }: { title: string; value: number | string; to: string }) {
	return (
		/* @ts-ignore - TanStack Router type issue, see https://github.com/denoland/deno/issues/30444 */
		<Link to={to} className='stat-card'>
			<div className='stat-title'>{title}</div>
			<div className='stat-value'>{value}</div>
		</Link>
	);
}

// @ts-ignore type quirk noted in repo
export const Route = createFileRoute('/admin/dashboard')({ component: Dashboard });
