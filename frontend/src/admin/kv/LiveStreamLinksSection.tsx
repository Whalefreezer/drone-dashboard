import { useEffect, useMemo, useState } from 'react';
import { useAtomValue } from 'jotai';
import { streamVideoRangesAtom } from '../../state/pbAtoms.ts';
import { pb } from '../../api/pb.ts';
import type { PBClientKVRecord } from '../../api/pbTypes.ts';
import { fromLocalDateTimeInputValue, toLocalDateTimeInputValue } from '../../common/time.ts';

interface StreamDraft {
	id: string;
	label: string;
	url: string;
	start: string;
	end: string;
}

interface CanonicalStreamDraft {
	id: string;
	label: string;
	url: string;
	startMs: number;
	endMs: number | null;
}

const isYouTubeUrl = (value: string): boolean => {
	try {
		const parsed = new URL(value);
		const host = parsed.hostname.toLowerCase();
		return host.includes('youtube.com') || host === 'youtu.be';
	} catch {
		return false;
	}
};

const randomStreamId = (): string => {
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
		return crypto.randomUUID();
	}
	return `stream-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const createEmptyStreamDraft = (): StreamDraft => ({
	id: randomStreamId(),
	label: '',
	url: '',
	start: '',
	end: '',
});

const toStreamDraftsFromValue = (value?: string): StreamDraft[] => {
	if (!value) return [];
	let parsed: unknown;
	try {
		parsed = JSON.parse(value);
	} catch {
		return [];
	}
	if (!Array.isArray(parsed)) return [];
	return parsed.map((entry): StreamDraft => {
		if (!entry || typeof entry !== 'object') return createEmptyStreamDraft();
		const idRaw = (entry as { id?: unknown }).id;
		const labelRaw = (entry as { label?: unknown }).label;
		const urlRaw = (entry as { url?: unknown }).url;
		const startRaw = (entry as { startMs?: unknown }).startMs;
		const endRaw = (entry as { endMs?: unknown }).endMs;
		const id = typeof idRaw === 'string' && idRaw.trim() ? idRaw.trim() : randomStreamId();
		const label = typeof labelRaw === 'string' ? labelRaw : '';
		const url = typeof urlRaw === 'string' ? urlRaw : '';
		const startMs = typeof startRaw === 'number' ? startRaw : fromLocalDateTimeInputValue(String(startRaw ?? '').trim());
		const endMsValue = startMs != null
			? (typeof endRaw === 'number' ? endRaw : fromLocalDateTimeInputValue(String(endRaw ?? '').trim()))
			: null;
		return {
			id,
			label,
			url,
			start: startMs != null ? toLocalDateTimeInputValue(startMs) : '',
			end: endMsValue != null ? toLocalDateTimeInputValue(endMsValue) : '',
		};
	});
};

const canonicalizeStreamDrafts = (drafts: StreamDraft[]): CanonicalStreamDraft[] => {
	const canonical: CanonicalStreamDraft[] = [];
	drafts.forEach((draft) => {
		const id = draft.id && draft.id.trim() ? draft.id.trim() : randomStreamId();
		const label = draft.label.trim();
		const url = draft.url.trim();
		const startMs = fromLocalDateTimeInputValue(draft.start.trim());
		if (!label || !url || startMs == null) return;
		let endMs: number | null = null;
		if (draft.end.trim()) {
			const parsedEnd = fromLocalDateTimeInputValue(draft.end.trim());
			if (parsedEnd == null) return;
			endMs = parsedEnd;
		}
		canonical.push({
			id,
			label,
			url,
			startMs,
			endMs,
		});
	});
	return canonical.sort((a, b) => a.startMs - b.startMs);
};

const validateStreamDrafts = (drafts: StreamDraft[]): string[] => {
	const messages: string[] = [];
	const ranges: Array<{ row: number; start: number; end: number }> = [];
	drafts.forEach((draft, idx) => {
		const row = idx + 1;
		const label = draft.label.trim();
		const url = draft.url.trim();
		const startStr = draft.start.trim();
		const endStr = draft.end.trim();
		if (!label) messages.push(`Row ${row}: label is required.`);
		if (!url) {
			messages.push(`Row ${row}: URL is required.`);
		} else if (!isYouTubeUrl(url)) {
			messages.push(`Row ${row}: URL must be a YouTube link.`);
		}
		const startMs = fromLocalDateTimeInputValue(startStr);
		if (startMs == null) {
			messages.push(`Row ${row}: start time is required.`);
			return;
		}
		let endMs: number | null = null;
		if (endStr) {
			const parsedEnd = fromLocalDateTimeInputValue(endStr);
			if (parsedEnd == null) {
				messages.push(`Row ${row}: end time is invalid.`);
				return;
			}
			if (parsedEnd < startMs) {
				messages.push(`Row ${row}: end time must be after the start time.`);
				return;
			}
			endMs = parsedEnd;
		}
		ranges.push({ row, start: startMs, end: endMs ?? Number.POSITIVE_INFINITY });
	});
	ranges.sort((a, b) => a.start - b.start);
	for (let i = 1; i < ranges.length; i++) {
		const prev = ranges[i - 1];
		const curr = ranges[i];
		if (curr.start <= prev.end) {
			messages.push(`Rows ${prev.row} and ${curr.row} overlap. Adjust the time ranges.`);
		}
	}
	return messages;
};

const formatDateTimeDisplay = (ms: number | null): string => {
	if (ms == null) return '—';
	const date = new Date(ms);
	return date.toLocaleString();
};

export function LiveStreamLinksSection(
	{ kvRecords, eventId }: { kvRecords: PBClientKVRecord[]; eventId: string | null },
) {
	const activeRanges = useAtomValue(streamVideoRangesAtom);
	const existingRecord = useMemo(() => {
		if (!eventId) return null;
		return kvRecords.find((r) => r.namespace === 'stream' && r.key === 'videos' && r.event === eventId) ?? null;
	}, [kvRecords, eventId]);
	const remoteDrafts = useMemo(() => toStreamDraftsFromValue(existingRecord?.value), [existingRecord]);
	const [drafts, setDrafts] = useState<StreamDraft[]>(remoteDrafts);
	useEffect(() => {
		setDrafts(remoteDrafts);
	}, [remoteDrafts]);
	const [busy, setBusy] = useState(false);
	const [err, setErr] = useState<string | null>(null);
	const [ok, setOk] = useState<string | null>(null);
	const validation = useMemo(() => {
		if (!eventId) return ['No active event selected.'];
		return validateStreamDrafts(drafts);
	}, [drafts, eventId]);
	const canonicalRemote = useMemo(() => canonicalizeStreamDrafts(remoteDrafts), [remoteDrafts]);
	const canonicalLocal = useMemo(() => canonicalizeStreamDrafts(drafts), [drafts]);
	const isDirty = JSON.stringify(canonicalLocal) !== JSON.stringify(canonicalRemote);

	function updateDraft(id: string, partial: Partial<StreamDraft>) {
		setDrafts((prev) => prev.map((draft) => draft.id === id ? { ...draft, ...partial } : draft));
	}

	function addDraft() {
		setDrafts((prev) => [...prev, createEmptyStreamDraft()]);
	}

	function removeDraft(id: string) {
		setDrafts((prev) => prev.filter((draft) => draft.id !== id));
	}

	async function save() {
		if (!eventId) return;
		setBusy(true);
		setErr(null);
		setOk(null);
		if (validation.length > 0) {
			setErr('Resolve validation errors before saving.');
			setBusy(false);
			return;
		}
		const payload = canonicalizeStreamDrafts(drafts).map((item) => ({
			id: item.id,
			label: item.label,
			url: item.url,
			startMs: item.startMs,
			endMs: item.endMs,
		}));
		try {
			const col = pb.collection('client_kv');
			if (existingRecord) {
				if (payload.length > 0) {
					await col.update(existingRecord.id, { value: JSON.stringify(payload) });
				} else {
					await col.delete(existingRecord.id);
				}
			} else if (payload.length > 0) {
				await col.create({
					namespace: 'stream',
					key: 'videos',
					value: JSON.stringify(payload),
					event: eventId,
				});
			}
			setOk(payload.length > 0 ? 'Saved live stream links.' : 'Cleared live stream links.');
		} catch (e: unknown) {
			setErr(e instanceof Error ? e.message : 'Save failed.');
		} finally {
			setBusy(false);
		}
	}

	async function clearAll() {
		if (!eventId) return;
		if (!confirm('Are you sure you want to remove all live stream links?')) return;
		setBusy(true);
		setErr(null);
		setOk(null);
		try {
			const col = pb.collection('client_kv');
			if (existingRecord) await col.delete(existingRecord.id);
			setDrafts([]);
			setOk('Cleared live stream links.');
		} catch (e: unknown) {
			setErr(e instanceof Error ? e.message : 'Clear failed.');
		} finally {
			setBusy(false);
		}
	}

	function resetDrafts() {
		setDrafts(remoteDrafts);
		setErr(null);
		setOk(null);
	}

	const disabled = busy || !eventId;

	if (!eventId) {
		return <p className='muted'>Select an event to manage live stream links.</p>;
	}

	return (
		<div className='override-editor' style={{ display: 'grid', gap: 12 }}>
			<div className='muted'>namespace=stream, key=videos</div>
			<div style={{ display: 'grid', gap: 8 }}>
				{drafts.map((draft) => (
					<div
						key={draft.id}
						className='stream-row'
						style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' }}
					>
						<label style={{ flex: '1 1 160px', display: 'flex', flexDirection: 'column', gap: 4 }}>
							<span className='muted'>Label</span>
							<input
								type='text'
								value={draft.label}
								onChange={(e) => updateDraft(draft.id, { label: e.currentTarget.value })}
								disabled={disabled}
								maxLength={80}
							/>
						</label>
						<label style={{ flex: '1 1 240px', display: 'flex', flexDirection: 'column', gap: 4 }}>
							<span className='muted'>YouTube URL</span>
							<input
								type='url'
								value={draft.url}
								onChange={(e) => updateDraft(draft.id, { url: e.currentTarget.value })}
								disabled={disabled}
								placeholder='https://www.youtube.com/watch?v=...'
								style={{ minWidth: 200 }}
							/>
						</label>
						<label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
							<span className='muted'>Start time</span>
							<input
								type='datetime-local'
								value={draft.start}
								onChange={(e) => updateDraft(draft.id, { start: e.currentTarget.value })}
								disabled={disabled}
							/>
						</label>
						<label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
							<span className='muted'>End time (optional)</span>
							<input
								type='datetime-local'
								value={draft.end}
								onChange={(e) => updateDraft(draft.id, { end: e.currentTarget.value })}
								disabled={disabled}
							/>
						</label>
						<button type='button' onClick={() => removeDraft(draft.id)} disabled={disabled}>
							Remove
						</button>
					</div>
				))}
			</div>
			<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
				<button type='button' onClick={addDraft} disabled={disabled}>
					Add stream
				</button>
				<button
					type='button'
					onClick={save}
					disabled={disabled || validation.length > 0 || (!isDirty && drafts.length === remoteDrafts.length)}
				>
					{busy ? 'Saving…' : 'Save'}
				</button>
				<button type='button' onClick={resetDrafts} disabled={disabled || !isDirty}>
					Reset
				</button>
				<button type='button' onClick={clearAll} disabled={disabled}>
					Clear
				</button>
				{err && <span style={{ color: 'crimson' }}>{err}</span>}
				{ok && <span className='muted'>{ok}</span>}
			</div>
			{validation.length > 0 && (
				<ul className='muted' style={{ margin: 0, paddingLeft: 18 }}>
					{validation.map((msg, idx) => <li key={`stream-validation-${idx}`}>{msg}</li>)}
				</ul>
			)}
			{activeRanges.length > 0 && (
				<div className='muted'>
					Active links: {activeRanges.map((range, idx) => (
						<span key={range.id}>
							{`${range.label} (${formatDateTimeDisplay(range.startMs)} → ${formatDateTimeDisplay(range.endMs)})`}
							{idx < activeRanges.length - 1 ? '; ' : ''}
						</span>
					))}
				</div>
			)}
		</div>
	);
}
