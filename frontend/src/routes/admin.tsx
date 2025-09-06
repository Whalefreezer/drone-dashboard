import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import type { CSSProperties } from 'react';
import { useAtomValue } from 'jotai';
import { clientKVRecordsAtom, ingestTargetRecordsAtom } from '../state/pbAtoms.ts';
import { GenericTable, Column } from '../common/GenericTable.tsx';
import type { PBIngestTargetRecord } from '../api/pbTypes.ts';
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
      <h2>Ingest Targets</h2>
      {Array.isArray(ingestTargets) && ingestTargets.length > 0 ? (
        <div style={{ overflowX: 'auto' }}>
          <IngestTargetsTable data={ingestTargets} />
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

function formatSecondsFromNow(v?: number) {
  if (!v || typeof v !== 'number') return '';
  const diffSec = (v - Date.now()) / 1000;
  const sign = diffSec >= -1 ? '' : '-';
  const val = Math.round(Math.abs(diffSec));
  return `${sign}${val}s`;
}

const th: CSSProperties = { textAlign: 'left', borderBottom: '1px solid #ddd', padding: '6px 8px' };
const td: CSSProperties = { borderBottom: '1px solid #eee', padding: '6px 8px' };
const tdMono: CSSProperties = { ...td, fontFamily: 'monospace' };

// --- GenericTable-based ingest targets view ---
type IngestCtx = {};
type IngestRow = PBIngestTargetRecord;

const ingestColumns: Array<Column<IngestCtx, IngestRow>> = [
  // { key: 'id', header: 'ID', width: 140, cell: (r: IngestRow) => <Mono>{r.id}</Mono> },
  { key: 'type', header: 'Type', width: 80, cell: (r: IngestRow) => <span>{r.type}</span> },
  { key: 'sourceId', header: 'Source ID', width: 200, cell: (r: IngestRow) => <Mono>{r.sourceId}</Mono> },
  { key: 'event', header: 'Event', width: 140, cell: (r: IngestRow) => <Mono>{r.event ?? ''}</Mono> },
  { key: 'intervalMs', header: 'Interval (ms)', width: 80, headerAlign: 'right', cell: (r: IngestRow) => <Right>{r.intervalMs ?? ''}</Right> },
  { key: 'nextDueAt', header: 'Next Due (s)', width: 80, headerAlign: 'right', cell: (r: IngestRow) => <Right>{formatSecondsFromNow(r.nextDueAt)}</Right> },
  { key: 'priority', header: 'Priority', width: 80, headerAlign: 'right', cell: (r: IngestRow) => <Right>{r.priority ?? ''}</Right> },
  { key: 'enabled', header: 'Enabled', width: 80, headerAlign: 'center', cell: (r: IngestRow) => <Center>{String(r.enabled ?? '')}</Center> },
  { key: 'lastFetchedAt', header: 'Last Fetched', width: 180, cell: (r: IngestRow) => <span>{formatEpochMs(r.lastFetchedAt)}</span> },
  { key: 'lastStatus', header: 'Last Status', minWidth: 240, cell: (r: IngestRow) => <span title={r.lastStatus ?? ''}>{r.lastStatus ?? ''}</span> },
];

function IngestTargetsTable({ data }: { data: IngestRow[] }) {
  return (
    <GenericTable
      columns={ingestColumns}
      data={data}
      context={{}}
      getRowKey={(row) => row.id}
      rowHeight={64}
      className='ingest-table'
    />
  );
}

function Mono({ children }: { children: React.ReactNode }) {
  return <span style={{ fontFamily: 'monospace' }}>{children}</span>;
}

function Right({ children }: { children: React.ReactNode }) {
  return <span style={{ display: 'block', textAlign: 'right' }}>{children}</span>;
}

function Center({ children }: { children: React.ReactNode }) {
  return <span style={{ display: 'block', textAlign: 'center' }}>{children}</span>;
}
