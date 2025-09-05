import { createFileRoute } from '@tanstack/react-router';
import { useAtomValue } from 'jotai';
import { clientKVRecordsAtom } from '../state/pbAtoms.ts';

export const Route = createFileRoute('/admin')({
  component: Admin,
});

function Admin() {
  const kv = useAtomValue(clientKVRecordsAtom);
  return (
    <div style={{ padding: 16 }}>
      <h1>Client KV Records</h1>
      <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(kv, null, 2)}</pre>
    </div>
  );
}

