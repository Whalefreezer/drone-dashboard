import { createFileRoute } from '@tanstack/react-router';
import { useAtomValue } from 'jotai';
import { ClientKVTable } from '../../admin/ClientKVTable.tsx';
import { clientKVRecordsAtom, currentEventAtom } from '../../state/pbAtoms.ts';
import { LeaderboardSplitSection } from './kv/LeaderboardSplitSection.tsx';
import { NextRaceOverrideSection } from './kv/NextRaceOverrideSection.tsx';
import { LiveStreamLinksSection } from './kv/LiveStreamLinksSection.tsx';

function KVPage() {
	const kv = useAtomValue(clientKVRecordsAtom);
	const ev = useAtomValue(currentEventAtom);

	return (
		<div className='admin-page' style={{ padding: 16, display: 'grid', gap: 16 }}>
			<div className='section-card'>
				<h2>Leaderboard Split (Client KV)</h2>
				<LeaderboardSplitSection />
			</div>
			<div className='section-card'>
				<h2>Next Race Overrides</h2>
				<NextRaceOverrideSection kvRecords={kv} eventId={ev?.id ?? null} />
			</div>
			<div className='section-card'>
				<h2>Live Stream Links</h2>
				<LiveStreamLinksSection kvRecords={kv} eventId={ev?.id ?? null} />
			</div>
			<div className='section-card'>
				<h2>Client KV Records</h2>
				{kv.length > 0
					? (
						<div style={{ overflowX: 'auto' }}>
							<ClientKVTable data={kv} />
						</div>
					)
					: <p className='muted'>No KV records found.</p>}
			</div>
		</div>
	);
}

// @ts-ignore type quirk noted in repo
export const Route = createFileRoute('/admin/kv')({ component: KVPage });
