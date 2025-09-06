import { useNavigate } from '@tanstack/react-router';
import { useAtomValue } from 'jotai';
import '../admin.css';
import { clientKVRecordsAtom, ingestTargetRecordsAtom, serverSettingsRecordsAtom } from '../../state/pbAtoms.ts';
import { authenticatedKind, logout } from '../../api/pb.ts';
import { ServerSettingsEditor } from './ServerSettingsEditor.tsx';
import { IngestTargetsTable } from './IngestTargetsTable.tsx';

export default function AdminPage() {
	const navigate = useNavigate();
	const kv = useAtomValue(clientKVRecordsAtom);
	const ingestTargets = useAtomValue(ingestTargetRecordsAtom);
	const settings = useAtomValue(serverSettingsRecordsAtom);

	return (
		<div className='admin-page' style={{ padding: 16, display: 'grid', gap: 16 }}>
			<div className='topbar'>
				<h1>Admin</h1>
				<div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
					<span className='muted'>Signed in as: {authenticatedKind() ?? 'unknown'}</span>
					<button
						onClick={() => {
							logout();
							navigate({ to: '/login' });
						}}
					>
						Logout
					</button>
				</div>
			</div>

			<div className='section-card'>
				<h2>Client KV Records</h2>
				<pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{JSON.stringify(kv, null, 2)}</pre>
			</div>

			<div className='section-card'>
				<h2>Server Settings</h2>
				<ServerSettingsEditor settings={settings} />
			</div>

			<div className='section-card'>
				<h2>Ingest Targets</h2>
				{Array.isArray(ingestTargets) && ingestTargets.length > 0
					? (
						<div style={{ overflowX: 'auto' }}>
							<IngestTargetsTable data={ingestTargets} />
						</div>
					)
					: <p className='muted'>No ingest targets found.</p>}
			</div>
		</div>
	);
}
