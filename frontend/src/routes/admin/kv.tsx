import { createFileRoute } from '@tanstack/react-router';
import { useAtomValue } from 'jotai';
import {
	clientKVRecordsAtom,
	currentEventAtom,
	leaderboardNextRaceOverridesAtom,
	racesAtom,
	roundsDataAtom,
	streamVideoRangesAtom,
} from '../../state/pbAtoms.ts';
import { ClientKVTable } from '../../admin/ClientKVTable.tsx';
import { useEffect, useMemo, useState } from 'react';
import { pb } from '../../api/pb.ts';
import type { PBClientKVRecord, PBRaceRecord, PBRoundRecord } from '../../api/pbTypes.ts';
import { fromLocalDateTimeInputValue, toLocalDateTimeInputValue } from '../../common/time.ts';

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
				<h2>Next Race Overrides</h2>
				<NextRaceOverrideEditor kvRecords={kv} eventId={ev?.id ?? null} />
			</div>
			<div className='section-card'>
				<h2>Live Stream Links</h2>
				<LiveStreamLinkEditor kvRecords={kv} eventId={ev?.id ?? null} />
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

interface OverrideDraft {
	startSourceId: string; // Empty string means "no more races"
	endSourceId: string;
	label: string;
}

type CanonicalDraft = {
	start: string;
	end: string;
	label: string;
	startIndex: number;
	endIndex: number;
};

const createEmptyDraft = (): OverrideDraft => ({ startSourceId: '', endSourceId: '', label: '' });

const formatRaceLabel = (race: PBRaceRecord, round: PBRoundRecord | undefined): string => {
	const roundLabel = round?.name || (round?.roundNumber ? `Round ${round.roundNumber}` : 'Round');
	const raceLabel = race.raceNumber != null ? `Race ${race.raceNumber}` : `Order ${race.raceOrder}`;
	return `${roundLabel} — ${raceLabel}`;
};

const toDraftsFromValue = (value?: string): OverrideDraft[] => {
	if (!value) return [];
	try {
		const parsed = JSON.parse(value) as unknown;
		if (!Array.isArray(parsed)) return [];
		return parsed.map((entry): OverrideDraft => {
			if (!entry || typeof entry !== 'object') return createEmptyDraft();
			const maybeStart = (entry as { startSourceId?: unknown }).startSourceId;
			const maybeEnd = (entry as { endSourceId?: unknown }).endSourceId;
			const maybeLabel = (entry as { label?: unknown }).label;
			return {
				startSourceId: typeof maybeStart === 'string' ? maybeStart : '',
				endSourceId: typeof maybeEnd === 'string' ? maybeEnd : '',
				label: typeof maybeLabel === 'string' ? maybeLabel : '',
			};
		});
	} catch {
		return [];
	}
};

const canonicalizeDrafts = (
	drafts: OverrideDraft[],
	raceIndexBySource: Map<string, number>,
	lastIndex: number,
): CanonicalDraft[] => {
	return drafts
		.map((draft) => {
			const start = draft.startSourceId.trim();
			const end = draft.endSourceId.trim();
			const label = draft.label.trim();
			const startIndex = raceIndexBySource.get(start) ?? -1;
			const endIndex = end ? raceIndexBySource.get(end) ?? -1 : lastIndex;
			return { start, end, label, startIndex, endIndex };
		})
		.sort((a, b) => a.startIndex - b.startIndex);
};

const validateDrafts = (
	drafts: OverrideDraft[],
	raceIndexBySource: Map<string, number>,
	lastIndex: number,
): string[] => {
	const messages: string[] = [];
	const ranges: Array<{ start: number; end: number; row: number }> = [];
	let hasNoRacesOverride = false;
	drafts.forEach((draft, idx) => {
		const row = idx + 1;
		const startId = draft.startSourceId.trim();
		const label = draft.label.trim();

		if (!label) {
			messages.push(`Row ${row}: label is required.`);
		}

		// Handle "no races" override (empty startSourceId)
		if (!startId) {
			if (hasNoRacesOverride) {
				messages.push(`Row ${row}: only one "No more races" override is allowed.`);
			}
			hasNoRacesOverride = true;
			return;
		}

		const startIndex = raceIndexBySource.get(startId);
		if (startIndex == null) {
			messages.push(`Row ${row}: start race is not in the current schedule.`);
			return;
		}
		let endIndex = lastIndex;
		const endId = draft.endSourceId.trim();
		if (endId) {
			const resolved = raceIndexBySource.get(endId);
			if (resolved == null) {
				messages.push(`Row ${row}: end race is not in the current schedule.`);
				return;
			}
			endIndex = resolved;
		}
		if (startIndex > endIndex) {
			messages.push(`Row ${row}: start race must come before the end race.`);
			return;
		}
		ranges.push({ start: startIndex, end: endIndex, row });
	});
	ranges.sort((a, b) => a.start - b.start);
	for (let i = 1; i < ranges.length; i++) {
		const prev = ranges[i - 1];
		const curr = ranges[i];
		if (curr.start <= prev.end) {
			messages.push(`Rows ${prev.row} and ${curr.row} overlap. Adjust the ranges.`);
		}
	}
	return messages;
};

function NextRaceOverrideEditor(
	{ kvRecords, eventId }: { kvRecords: PBClientKVRecord[]; eventId: string | null },
) {
	const races = useAtomValue(racesAtom);
	const rounds = useAtomValue(roundsDataAtom);
	const activeOverrides = useAtomValue(leaderboardNextRaceOverridesAtom);
	const lastIndex = races.length > 0 ? races.length - 1 : -1;
	const raceIndexBySource = useMemo(() => {
		const map = new Map<string, number>();
		races.forEach((race, idx) => {
			const id = (race.sourceId ?? '').trim();
			if (id) map.set(id, idx);
		});
		return map;
	}, [races]);
	const existingRecord = useMemo(() => {
		if (!eventId) return null;
		return kvRecords.find((r) => r.namespace === 'leaderboard' && r.key === 'nextRaceOverrides' && r.event === eventId) ?? null;
	}, [kvRecords, eventId]);
	const remoteDrafts = useMemo(() => toDraftsFromValue(existingRecord?.value), [existingRecord]);
	const [drafts, setDrafts] = useState<OverrideDraft[]>(remoteDrafts);
	useEffect(() => {
		setDrafts(remoteDrafts);
	}, [remoteDrafts]);
	const [busy, setBusy] = useState(false);
	const [err, setErr] = useState<string | null>(null);
	const [ok, setOk] = useState<string | null>(null);
	const raceOptions = useMemo(() => {
		const roundById = new Map<string, PBRoundRecord>();
		rounds.forEach((round) => {
			if (round.id) roundById.set(round.id, round);
		});
		return races
			.filter((race) => (race.sourceId ?? '').trim())
			.map((race) => {
				const round = roundById.get(race.round ?? '');
				const label = formatRaceLabel(race, round);
				const sourceId = (race.sourceId ?? '').trim();
				return { value: sourceId, label: `${label} (${sourceId})`, index: raceIndexBySource.get(sourceId) ?? 0 };
			})
			.sort((a, b) => a.index - b.index);
	}, [races, rounds, raceIndexBySource]);
	const validation = useMemo(() => {
		if (!eventId) return ['No active event selected.'];
		if (races.length === 0) return ['No races are available for the current event.'];
		return validateDrafts(drafts, raceIndexBySource, lastIndex);
	}, [drafts, eventId, raceIndexBySource, lastIndex, races.length]);
	const canonicalRemote = useMemo(() => canonicalizeDrafts(remoteDrafts, raceIndexBySource, lastIndex), [
		remoteDrafts,
		raceIndexBySource,
		lastIndex,
	]);
	const canonicalLocal = useMemo(() => canonicalizeDrafts(drafts, raceIndexBySource, lastIndex), [drafts, raceIndexBySource, lastIndex]);
	const isDirty = JSON.stringify(canonicalLocal) !== JSON.stringify(canonicalRemote);

	function updateDraft(index: number, partial: Partial<OverrideDraft>) {
		setDrafts((prev) => {
			const next = [...prev];
			next[index] = { ...next[index], ...partial };
			return next;
		});
	}

	function addDraft() {
		setDrafts((prev) => [...prev, createEmptyDraft()]);
	}

	function removeDraft(index: number) {
		setDrafts((prev) => prev.filter((_, idx) => idx !== index));
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
		try {
			const payload: Array<Record<string, string>> = [];

			// Handle regular race-based overrides
			const sorted = canonicalizeDrafts(drafts, raceIndexBySource, lastIndex)
				.filter((item) => item.startIndex >= 0 && item.label);
			payload.push(...sorted.map((item) => {
				const base: Record<string, string> = {
					startSourceId: item.start,
					label: item.label,
				};
				if (item.end) base.endSourceId = item.end;
				return base;
			}));

			// Handle "no more races" override
			const noRacesOverride = drafts.find((d) => !d.startSourceId.trim() && d.label.trim());
			if (noRacesOverride) {
				payload.push({ label: noRacesOverride.label.trim() });
			}

			const col = pb.collection('client_kv');
			if (existingRecord) {
				if (payload.length > 0) {
					await col.update(existingRecord.id, { value: JSON.stringify(payload) });
				} else {
					await col.delete(existingRecord.id);
				}
			} else if (payload.length > 0) {
				await col.create({ namespace: 'leaderboard', key: 'nextRaceOverrides', value: JSON.stringify(payload), event: eventId });
			}
			if (payload.length === 0) {
				setOk('Cleared overrides');
			} else {
				setOk('Saved overrides');
			}
		} catch (e: unknown) {
			setErr(e instanceof Error ? e.message : 'Save failed');
		} finally {
			setBusy(false);
		}
	}

	async function clearOverrides() {
		if (!eventId) return;
		if (!confirm('Are you sure you want to clear all overrides? This cannot be undone.')) {
			return;
		}
		setBusy(true);
		setErr(null);
		setOk(null);
		try {
			const col = pb.collection('client_kv');
			if (existingRecord) await col.delete(existingRecord.id);
			setDrafts([]);
			setOk('Cleared overrides');
		} catch (e: unknown) {
			setErr(e instanceof Error ? e.message : 'Clear failed');
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

	if (eventId == null) {
		return <p className='muted'>Select an event to manage overrides.</p>;
	}

	return (
		<div className='override-editor' style={{ display: 'grid', gap: 12 }}>
			<div className='muted'>namespace=leaderboard, key=nextRaceOverrides</div>
			{races.length === 0 && <p className='muted'>No races found for the current event.</p>}
			<div style={{ display: 'grid', gap: 8 }}>
				{drafts.map((draft, idx) => (
					<div key={`override-${idx}`} className='override-row' style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
						<label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
							<span className='muted'>Start race (optional)</span>
							<select
								value={draft.startSourceId}
								onChange={(e) =>
									updateDraft(idx, { startSourceId: e.currentTarget.value })}
								disabled={disabled || raceOptions.length === 0}
							>
								<option value=''>No more races</option>
								{raceOptions.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
							</select>
						</label>
						<label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
							<span className='muted'>End race</span>
							<select
								value={draft.endSourceId}
								onChange={(e) =>
									updateDraft(idx, { endSourceId: e.currentTarget.value })}
								disabled={disabled || raceOptions.length === 0 || !draft.startSourceId}
							>
								<option value=''>Runs through final race</option>
								{raceOptions.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
							</select>
						</label>
						<label style={{ flex: '1 1 160px', display: 'flex', flexDirection: 'column', gap: 4 }}>
							<span className='muted'>Label</span>
							<input
								type='text'
								value={draft.label}
								onChange={(e) =>
									updateDraft(idx, { label: e.currentTarget.value })}
								disabled={disabled}
								maxLength={64}
							/>
						</label>
						<button type='button' onClick={() => removeDraft(idx)} disabled={disabled}>
							Remove
						</button>
					</div>
				))}
			</div>
			<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
				<button type='button' onClick={addDraft} disabled={disabled || raceOptions.length === 0}>
					Add override
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
				<button type='button' onClick={clearOverrides} disabled={disabled}>
					Clear
				</button>
				{err && <span style={{ color: 'crimson' }}>{err}</span>}
				{ok && <span className='muted'>{ok}</span>}
			</div>
			{validation.length > 0 && (
				<ul className='muted' style={{ margin: 0, paddingLeft: 18 }}>
					{validation.map((msg, idx) => <li key={`validation-${idx}`}>{msg}</li>)}
				</ul>
			)}
			{activeOverrides.length > 0 && (
				<div className='muted'>
					Active ranges: {activeOverrides.map((override, idx) => {
						const label = override.label;
						const startLabel = raceOptions.find((opt) => opt.value === override.startSourceId)?.label ?? override.startSourceId;
						const endLabel = override.endSourceId
							? raceOptions.find((opt) => opt.value === override.endSourceId)?.label ?? override.endSourceId
							: 'final race';
						return (
							<span key={`${override.startSourceId}-${override.endSourceId ?? 'open'}-${idx}`}>
								{`${label} (${startLabel} → ${endLabel})`}
								{idx < activeOverrides.length - 1 ? '; ' : ''}
							</span>
						);
					})}
				</div>
			)}
		</div>
	);
}

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

function LiveStreamLinkEditor(
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
				{drafts.map((draft, idx) => (
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
		} catch {
			return '';
		}
	});
	const [busy, setBusy] = useState(false);
	const [err, setErr] = useState<string | null>(null);
	const [ok, setOk] = useState<string | null>(null);

	async function save() {
		if (!ev) return;
		setBusy(true);
		setErr(null);
		setOk(null);
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
		setBusy(true);
		setErr(null);
		setOk(null);
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
