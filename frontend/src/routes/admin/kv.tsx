import { createFileRoute } from '@tanstack/react-router';
import { useAtomValue } from 'jotai';
import { clientKVRecordsAtom, currentEventAtom } from '../../state/pbAtoms.ts';
import { ClientKVTable } from './ClientKVTable.tsx';
import { useMemo, useState } from 'react';
import { pb } from '../../api/pb.ts';

function KVPage() {
    const kv = useAtomValue(clientKVRecordsAtom);
    const ev = useAtomValue(currentEventAtom);
    return (
        <div className='admin-page' style={{ padding: 16, display: 'grid', gap: 16 }}>
            <div className='section-card'>
                <h2>Leaderboard Split (Client KV)</h2>
                <LeaderboardSplitEditor />
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

function LeaderboardSplitEditor() {
    const ev = useAtomValue(currentEventAtom);
    const kv = useAtomValue(clientKVRecordsAtom);
    const existing = useMemo(() => {
        if (!ev) return null;
        return (
            kv.find((r) => r.namespace === 'leaderboard' && r.key === 'splitIndex' && r.event === ev.id) ?? null
        );
    }, [kv, ev]);

    const [val, setVal] = useState<string>(() => {
        if (!existing || !existing.value) return '';
        try {
            const parsed = JSON.parse(existing.value);
            const n = Number(parsed);
            return Number.isFinite(n) && n > 0 ? String(Math.floor(n)) : '';
        } catch { return ''; }
    });
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const [ok, setOk] = useState<string | null>(null);

    async function save() {
        if (!ev) return;
        setBusy(true); setErr(null); setOk(null);
        try {
            const n = Math.max(0, Math.floor(Number(val)));
            const payload = n > 0 ? JSON.stringify(n) : '';
            const col = pb.collection('client_kv');
            if (existing) {
                if (payload) await col.update(existing.id, { value: payload });
                else await col.delete(existing.id);
            } else {
                if (payload) await col.create({ namespace: 'leaderboard', key: 'splitIndex', value: payload, event: ev.id });
                // if payload empty and no existing, nothing to do
            }
            setOk(payload ? 'Saved' : 'Cleared');
        } catch (e: unknown) {
            setErr(e instanceof Error ? e.message : 'Save failed');
        } finally {
            setBusy(false);
        }
    }

    async function clearVal() {
        if (!ev) return;
        setBusy(true); setErr(null); setOk(null);
        try {
            const col = pb.collection('client_kv');
            if (existing) await col.delete(existing.id);
            setVal('');
            setOk('Cleared');
        } catch (e: unknown) {
            setErr(e instanceof Error ? e.message : 'Clear failed');
        } finally {
            setBusy(false);
        }
    }

    const placeholder = 'e.g., 8 (0 to disable)';

    return (
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div className='muted'>namespace=leaderboard, key=splitIndex</div>
            <input
                type='number'
                min={0}
                placeholder={placeholder}
                value={val}
                onChange={(e) => setVal(e.currentTarget.value)}
                style={{ width: 180 }}
            />
            <button type='button' onClick={save} disabled={busy || !ev}>{busy ? 'Saving…' : 'Save'}</button>
            <button type='button' onClick={clearVal} disabled={busy || !ev || !existing}>Clear</button>
            {err && <span style={{ color: 'crimson' }}>{err}</span>}
            {ok && <span className='muted'>{ok}</span>}
        </div>
    );
}
