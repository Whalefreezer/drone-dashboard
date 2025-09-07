import { createFileRoute } from '@tanstack/react-router';
import { useAtomValue } from 'jotai';
import { clientKVRecordsAtom } from '../../state/pbAtoms.ts';
import { ClientKVTable } from './ClientKVTable.tsx';

function KVPage() {
  const kv = useAtomValue(clientKVRecordsAtom);
  return (
    <div className='admin-page' style={{ padding: 16, display: 'grid', gap: 16 }}>
      <div className='section-card'>
        <h2>Client KV Records</h2>
        {kv.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <ClientKVTable data={kv} />
          </div>
        ) : (
          <p className='muted'>No KV records found.</p>
        )}
      </div>
    </div>
  );
}

// @ts-ignore type quirk noted in repo
export const Route = createFileRoute('/admin/kv')({ component: KVPage });

