import { useMemo, useState } from 'react';
import { type Column, GenericTable } from '../../common/GenericTable.tsx';
import type { PBServerSettingRecord } from '../../api/pbTypes.ts';
import { pb } from '../../api/pb.ts';
import { inferSettingKind, normalizeSettingValue } from './admin-utils.ts';

type SettingRowData = PBServerSettingRecord & {
	draftValue: string;
	dirty: boolean;
	setDraft: (id: string, v: string) => void;
};

const serverSettingsColumns: Array<Column<Record<PropertyKey, never>, SettingRowData & { rowCtx?: SettingRowData }>> = [
	{ key: 'edit', header: 'Settings', minWidth: 680, cell: (p) => <SettingRowEditor row={(p.rowCtx ?? p) as SettingRowData} /> },
];

export function ServerSettingsEditor({ settings }: { settings: PBServerSettingRecord[] }) {
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
					<button type='button' onClick={resetAll} disabled={!hasDirty || saving}>Reset</button>
					<button type='button' onClick={saveAll} disabled={!hasDirty || saving}>{saving ? 'Saving…' : 'Save'}</button>
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
			<button type='button' onClick={create} disabled={saving || !k.trim()}>{saving ? 'Adding…' : 'Add'}</button>
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
				{kind === 'boolean'
					? (
						<select
							value={row.draftValue}
							onChange={(e) => row.setDraft(row.id, e.currentTarget.value)}
							style={{ width: 160 }}
						>
							<option value='true'>true</option>
							<option value='false'>false</option>
						</select>
					)
					: kind === 'number'
					? (
						<input
							type='number'
							value={row.draftValue}
							onChange={(e) => row.setDraft(row.id, e.currentTarget.value)}
						/>
					)
					: (
						<input
							value={row.draftValue}
							onChange={(e) => row.setDraft(row.id, e.currentTarget.value)}
						/>
					)}
			</div>
			<div>{row.dirty ? <span style={{ color: '#f59e0b' }}>• unsaved</span> : <span className='muted'>saved</span>}</div>
			<div>
				<button type='button' onClick={remove}>Delete</button>
			</div>
		</div>
	);
}
