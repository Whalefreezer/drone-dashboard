import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import './admin.css';
import { useAtomValue } from 'jotai';
import { clientKVRecordsAtom, ingestTargetRecordsAtom, serverSettingsRecordsAtom } from '../state/pbAtoms.ts';
import { GenericTable, Column } from '../common/GenericTable.tsx';
import type { PBIngestTargetRecord, PBServerSettingRecord } from '../api/pbTypes.ts';
import { isAuthenticated, logout, authenticatedKind } from '../api/pb.ts';
import { pb } from '../api/pb.ts';

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
  const settings = useAtomValue(serverSettingsRecordsAtom);
  return (
    <div className='admin-page' style={{ padding: 16, display: 'grid', gap: 16 }}>
      <div className='topbar'>
        <h1>Admin</h1>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span className='muted'>Signed in as: {authenticatedKind() ?? 'unknown'}</span>
          <button onClick={() => { logout(); navigate({ to: '/login' }); }}>Logout</button>
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
        {Array.isArray(ingestTargets) && ingestTargets.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <IngestTargetsTable data={ingestTargets} />
          </div>
        ) : (
          <p className='muted'>No ingest targets found.</p>
        )}
      </div>
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
  const sign = diffSec >= 0 ? '+' : '-';
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
      rowHeight={40}
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

// --- Generic server_settings editor ---
function ServerSettingsEditor({ settings }: { settings: PBServerSettingRecord[] }) {
  const [query, setQuery] = useState('');
  const [pending, setPending] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return settings.filter((s) => {
      const keyStr = typeof s.key === 'string' ? s.key : String(s.key ?? '');
      const valStr = typeof s.value === 'string' ? s.value : String(s.value ?? '');
      return keyStr.toLowerCase().includes(q) || valStr.toLowerCase().includes(q);
    });
  }, [settings, query]);

  const tableData = useMemo(() =>
    filtered.map((r) => {
      const draft = pending[r.id] ?? (r.value ?? '');
      return {
        ...r,
        draftValue: draft,
        dirty: draft !== (r.value ?? ''),
        setDraft: (id: string, v: string) => setPending((p) => ({ ...p, [id]: v })),
      } as SettingRowData;
    }), [filtered, pending]);

  const dirtyRows = tableData.filter((r: SettingRowData) => r.dirty);
  const hasDirty = dirtyRows.length > 0;

  async function saveAll() {
    if (!hasDirty) return;
    setSaving(true);
    setErr(null);
    try {
      const results = await Promise.allSettled(dirtyRows.map(async (r) => {
        const kind = inferSettingKind(r.key);
        const value = normalizeSettingValue(kind, r.draftValue);
        await pb.collection('server_settings').update(r.id, { value });
      }));
      const failed = results.filter((x) => x.status === 'rejected');
      if (failed.length > 0) setErr(`${failed.length} setting(s) failed to save`);
      setPending((p) => {
        const next = { ...p };
        for (const r of dirtyRows) delete next[r.id];
        return next;
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Save failed';
      setErr(msg);
    } finally {
      setSaving(false);
    }
  }

  function resetAll() {
    setPending({});
    setErr(null);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type='search'
            placeholder='Filter (by key or value)'
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            style={{ minWidth: 260 }}
          />
          <AddSettingForm />
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {err && <span style={{ color: 'crimson' }}>{err}</span>}
          <span className='muted'>{hasDirty ? `${dirtyRows.length} unsaved change(s)` : 'All changes saved'}</span>
          <button onClick={resetAll} disabled={!hasDirty || saving}>Reset</button>
          <button onClick={saveAll} disabled={!hasDirty || saving}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
      <GenericTable
        columns={serverSettingsColumns}
        data={tableData}
        context={{}}
        getRowKey={(r) => r.id}
        rowHeight={40}
        className='server-settings-table'
      />
    </div>
  );
}

type SettingRowData = PBServerSettingRecord & { draftValue: string; dirty: boolean; setDraft: (id: string, v: string) => void };

const serverSettingsColumns: Array<Column<{}, SettingRowData & { rowCtx?: SettingRowData }>> = [
  { key: 'edit', header: 'Settings', minWidth: 680, cell: (p) => <SettingRowEditor row={(p.rowCtx ?? p) as SettingRowData} /> },
];

function AddSettingForm() {
  const [k, setK] = useState('');
  const [v, setV] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function create() {
    if (!k.trim()) return;
    setSaving(true);
    setErr(null);
    try {
      await pb.collection('server_settings').create({ key: k.trim(), value: v });
      setK('');
      setV('');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Create failed';
      setErr(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <input placeholder='new key' value={k} onChange={(e) => setK(e.currentTarget.value)} style={{ width: 240 }} />
      <input placeholder='value' value={v} onChange={(e) => setV(e.currentTarget.value)} style={{ width: 320 }} />
      <button onClick={create} disabled={saving || !k.trim()}>{saving ? 'Adding…' : 'Add'}</button>
      {err && <span style={{ color: 'crimson' }}>{err}</span>}
    </div>
  );
}

function SettingRowEditor({ row }: { row: SettingRowData }) {
  const kind = inferSettingKind(row.key);

  async function remove() {
    if (!confirm(`Delete setting "${row.key}"?`)) return;
    try {
      await pb.collection('server_settings').delete(row.id);
    } catch { /* ignore; subscription will reflect state */ }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(100px, 1fr) 2fr auto auto', alignItems: 'center', gap: 12, width: '100%' }}>
      <div style={{ fontFamily: 'monospace' }}>{String(row.key ?? '')}</div>
      <div>
        {kind === 'boolean' ? (
          <select value={row.draftValue} onChange={(e) => row.setDraft(row.id, e.currentTarget.value)} style={{ width: 160 }}>
            <option value='true'>true</option>
            <option value='false'>false</option>
          </select>
        ) : kind === 'number' ? (
          <input type='number' value={row.draftValue} onChange={(e) => row.setDraft(row.id, e.currentTarget.value)} />
        ) : (
          <input value={row.draftValue} onChange={(e) => row.setDraft(row.id, e.currentTarget.value)} />
        )}
      </div>
      <div>{row.dirty ? <span style={{ color: '#f59e0b' }}>• unsaved</span> : <span className='muted'>saved</span>}</div>
      <div><button onClick={remove}>Delete</button></div>
    </div>
  );
}

function inferSettingKind(key: unknown): 'boolean' | 'number' | 'text' {
  const lower = String(key ?? '').toLowerCase();
  if (lower.endsWith('.enabled') || lower.endsWith('enabled')) return 'boolean';
  if (/(ms|interval|timeout|delay|jitter|burst|concurrency)$/i.test(lower)) return 'number';
  return 'text';
}

function normalizeSettingValue(kind: 'boolean' | 'number' | 'text', val: string): string {
  if (kind === 'boolean') return String(val === 'true');
  if (kind === 'number') {
    const n = Number(val);
    return Number.isFinite(n) ? String(n) : '0';
  }
  return val;
}
