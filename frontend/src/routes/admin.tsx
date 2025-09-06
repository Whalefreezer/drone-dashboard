import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import type { CSSProperties } from 'react';
import { useAtomValue } from 'jotai';
import { clientKVRecordsAtom, ingestTargetRecordsAtom } from '../state/pbAtoms.ts';
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
  const ingestTargets = useAtomValue(ingestTargetRecordsAtom);
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

      <hr style={{ margin: '24px 0' }} />
      <h2>Ingest Targets (live)</h2>
      {Array.isArray(ingestTargets) && ingestTargets.length > 0 ? (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', minWidth: 600 }}>
            <thead>
              <tr>
                <th style={th}>ID</th>
                <th style={th}>Type</th>
                <th style={th}>Source ID</th>
                <th style={th}>Event</th>
                <th style={th}>Interval (ms)</th>
                <th style={th}>Next Due</th>
                <th style={th}>Priority</th>
                <th style={th}>Enabled</th>
                <th style={th}>Last Fetched</th>
                <th style={th}>Last Status</th>
              </tr>
            </thead>
            <tbody>
              {ingestTargets.map((t: any) => (
                <tr key={t.id}>
                  <td style={tdMono}>{t.id}</td>
                  <td style={td}>{t.type}</td>
                  <td style={tdMono}>{t.sourceId}</td>
                  <td style={tdMono}>{t.event ?? ''}</td>
                  <td style={td}>{t.intervalMs ?? ''}</td>
                  <td style={td}>{formatEpochMs(t.nextDueAt)}</td>
                  <td style={td}>{t.priority ?? ''}</td>
                  <td style={td}>{String(t.enabled ?? '')}</td>
                  <td style={td}>{formatEpochMs(t.lastFetchedAt)}</td>
                  <td style={td}>{t.lastStatus ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <details style={{ marginTop: 12 }}>
            <summary>Raw JSON</summary>
            <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(ingestTargets, null, 2)}</pre>
          </details>
        </div>
      ) : (
        <p style={{ color: '#666' }}>No ingest targets found.</p>
      )}
    </div>
  );
}

function formatEpochMs(v?: number) {
  if (!v || typeof v !== 'number') return '';
  try {
    const d = new Date(v);
    if (isNaN(d.getTime())) return String(v);
    return d.toLocaleString();
  } catch {
    return String(v);
  }
}

const th: CSSProperties = { textAlign: 'left', borderBottom: '1px solid #ddd', padding: '6px 8px' };
const td: CSSProperties = { borderBottom: '1px solid #eee', padding: '6px 8px' };
const tdMono: CSSProperties = { ...td, fontFamily: 'monospace' };
