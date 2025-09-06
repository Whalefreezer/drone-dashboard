import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useAtomValue } from 'jotai';
import { clientKVRecordsAtom } from '../state/pbAtoms.ts';
import { isAuthenticated, logout, authenticatedKind } from '../api/pb.ts';

export const Route = createFileRoute('/admin')({
  beforeLoad: () => {
    if (!isAuthenticated()) {
      throw redirect({ to: '/login' });
    }
  },
  component: Admin,
});

function Admin() {
  const navigate = useNavigate();
  const kv = useAtomValue(clientKVRecordsAtom);
  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Client KV Records</h1>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span style={{ color: '#666' }}>Signed in as: {authenticatedKind() ?? 'unknown'}</span>
          <button onClick={() => { logout(); navigate({ to: '/login' }); }}>Logout</button>
        </div>
      </div>
      <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(kv, null, 2)}</pre>
    </div>
  );
}
