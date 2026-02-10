import { useEffect, useMemo, useState } from 'react';
import { useAtomValue } from 'jotai';
import { pb } from '../../api/pb.ts';
import type { PBClientKVRecord, PBRaceRecord, PBRoundRecord } from '../../api/pbTypes.ts';
import { racesAtom, roundsDataAtom } from '../../state/pbAtoms.ts';
import { BRACKET_KV_NAMESPACE, type BracketAnchor, ELIMINATION_CONFIG_KV_KEY, mapRacesToBracket } from '../../bracket/eliminationState.ts';
import { DEFAULT_BRACKET_FORMAT_ID, getBracketFormatById, listBracketFormats } from '../../bracket/formats/registry.ts';

interface AnchorDraft {
	id: string;
	bracketOrder: string;
	raceOrder: string;
	raceSourceId: string;
}

interface BracketAnchorsSectionProps {
	kvRecords: PBClientKVRecord[];
	eventId: string | null;
}

interface ParsedConfig {
	formatId: string;
	anchors: BracketAnchor[];
}

const EMPTY_DRAFT: AnchorDraft = {
	id: 'draft-0',
	bracketOrder: '',
	raceOrder: '',
	raceSourceId: '',
};

function createDraftId() {
	return typeof crypto !== 'undefined' && 'randomUUID' in crypto
		? crypto.randomUUID()
		: `draft-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function parseConfig(record: PBClientKVRecord | null): ParsedConfig {
	if (!record?.value) {
		return { formatId: DEFAULT_BRACKET_FORMAT_ID, anchors: [] };
	}
	try {
		const parsed = JSON.parse(record.value) as unknown;
		if (!parsed || typeof parsed !== 'object') {
			return { formatId: DEFAULT_BRACKET_FORMAT_ID, anchors: [] };
		}
		const formatIdRaw = (parsed as { formatId?: unknown }).formatId;
		const requestedFormatId = typeof formatIdRaw === 'string' && formatIdRaw.trim().length > 0 ? formatIdRaw : DEFAULT_BRACKET_FORMAT_ID;
		const formatId = getBracketFormatById(requestedFormatId).id;
		const anchorsRaw = (parsed as { anchors?: unknown }).anchors;
		if (!Array.isArray(anchorsRaw)) {
			return { formatId, anchors: [] };
		}
		const anchors: BracketAnchor[] = [];
		for (const entry of anchorsRaw) {
			if (!entry || typeof entry !== 'object') continue;
			const bracketOrder = (entry as { bracketOrder?: unknown }).bracketOrder;
			const raceOrder = (entry as { raceOrder?: unknown }).raceOrder;
			const raceSourceId = (entry as { raceSourceId?: unknown }).raceSourceId;
			if (typeof bracketOrder !== 'number') continue;
			anchors.push({
				bracketOrder,
				raceOrder: typeof raceOrder === 'number' ? raceOrder : undefined,
				raceSourceId: typeof raceSourceId === 'string' ? raceSourceId : undefined,
			});
		}
		return { formatId, anchors };
	} catch {
		return { formatId: DEFAULT_BRACKET_FORMAT_ID, anchors: [] };
	}
}

function anchorsToDrafts(anchors: BracketAnchor[]): AnchorDraft[] {
	return anchors.map((entry, index) => ({
		id: `remote-${index}`,
		bracketOrder: String(entry.bracketOrder),
		raceOrder: entry.raceOrder != null ? String(entry.raceOrder) : '',
		raceSourceId: entry.raceSourceId ?? '',
	}));
}

function sanitizeDrafts(drafts: AnchorDraft[], maxOrder: number) {
	const seen = new Set<number>();
	const anchors: BracketAnchor[] = [];
	const errors: string[] = [];
	drafts.forEach((draft, index) => {
		const row = index + 1;
		const order = Number.parseInt(draft.bracketOrder, 10);
		if (!Number.isInteger(order) || order < 1 || order > maxOrder) {
			errors.push(`Row ${row}: bracket order must be between 1 and ${maxOrder}.`);
			return;
		}
		if (seen.has(order)) {
			errors.push(`Row ${row}: bracket order ${order} is duplicated.`);
			return;
		}
		const raceOrder = draft.raceOrder.trim();
		const raceSourceId = draft.raceSourceId.trim();
		const entry: BracketAnchor = {
			bracketOrder: order,
		};
		if (raceOrder) {
			const parsed = Number.parseInt(raceOrder, 10);
			if (!Number.isInteger(parsed) || parsed < 1) {
				errors.push(`Row ${row}: race order must be a positive integer.`);
			} else {
				entry.raceOrder = parsed;
			}
		}
		if (raceSourceId) {
			entry.raceSourceId = raceSourceId;
		}
		if (!entry.raceOrder && !entry.raceSourceId) {
			errors.push(`Row ${row}: provide a race order or a race source ID.`);
			return;
		}
		anchors.push(entry);
		seen.add(order);
	});
	return { anchors, errors };
}

function canonicalize(anchors: BracketAnchor[]) {
	return anchors
		.slice()
		.sort((a, b) => a.bracketOrder - b.bracketOrder)
		.map((anchor) => ({
			bracketOrder: anchor.bracketOrder,
			raceOrder: anchor.raceOrder,
			raceSourceId: anchor.raceSourceId,
		}));
}

function formatRaceLabel(race: PBRaceRecord | null, rounds: PBRoundRecord[]) {
	if (!race) return '—';
	const round = rounds.find((r) => r.id === (race.round ?? ''));
	const roundLabel = round?.name || (round?.roundNumber ? `Round ${round.roundNumber}` : 'Round');
	const raceLabel = race.raceNumber != null ? `Race ${race.raceNumber}` : `Order ${race.raceOrder}`;
	return `${roundLabel} — ${raceLabel}`;
}

export function BracketAnchorsSection({ kvRecords, eventId }: BracketAnchorsSectionProps) {
	const races = useAtomValue(racesAtom) as PBRaceRecord[];
	const rounds = useAtomValue(roundsDataAtom);
	const formats = useMemo(() => listBracketFormats(), []);
	const existingRecord = useMemo(() => {
		if (!eventId) return null;
		return kvRecords.find((record) =>
			record.namespace === BRACKET_KV_NAMESPACE && record.key === ELIMINATION_CONFIG_KV_KEY && record.event === eventId
		) ?? null;
	}, [kvRecords, eventId]);

	const remoteConfig = useMemo(() => parseConfig(existingRecord), [existingRecord]);
	const remoteDrafts = useMemo(() => anchorsToDrafts(remoteConfig.anchors), [remoteConfig.anchors]);

	const [selectedFormatId, setSelectedFormatId] = useState<string>(remoteConfig.formatId);
	const [drafts, setDrafts] = useState<AnchorDraft[]>(remoteDrafts);

	useEffect(() => {
		setSelectedFormatId(remoteConfig.formatId);
		setDrafts(remoteDrafts);
	}, [remoteConfig.formatId, remoteDrafts]);

	const selectedFormat = useMemo(() => getBracketFormatById(selectedFormatId), [selectedFormatId]);
	const maxOrder = useMemo(
		() => Math.max(...selectedFormat.nodes.map((node) => node.order), 1),
		[selectedFormat.nodes],
	);

	const { anchors: sanitizedAnchors, errors: draftErrors } = useMemo(
		() => sanitizeDrafts(drafts, maxOrder),
		[drafts, maxOrder],
	);
	const canonicalCurrent = useMemo(() => canonicalize(sanitizedAnchors), [sanitizedAnchors]);
	const canonicalRemote = useMemo(() => canonicalize(remoteConfig.anchors), [remoteConfig.anchors]);
	const isDirty = selectedFormatId !== remoteConfig.formatId || JSON.stringify(canonicalCurrent) !== JSON.stringify(canonicalRemote);

	const preview = useMemo(() => {
		if (races.length === 0) return [] as Array<{ code: string; order: number; race: PBRaceRecord | null }>;
		const mapping = mapRacesToBracket(races, {
			formatId: selectedFormatId,
			anchors: sanitizedAnchors,
			record: existingRecord,
		}, selectedFormat.nodes);
		return selectedFormat.nodes.map((node) => ({
			code: node.code,
			order: node.order,
			race: mapping.get(node.order) ?? null,
		}));
	}, [races, selectedFormatId, sanitizedAnchors, existingRecord, selectedFormat.nodes]);

	const [busy, setBusy] = useState(false);
	const [err, setErr] = useState<string | null>(null);
	const [ok, setOk] = useState<string | null>(null);

	function updateDraft(id: string, patch: Partial<AnchorDraft>) {
		setDrafts((prev) => prev.map((draft) => draft.id === id ? { ...draft, ...patch } : draft));
	}

	function addDraft() {
		setDrafts((prev) => [
			...prev,
			{ ...EMPTY_DRAFT, id: createDraftId() },
		]);
	}

	function removeDraft(id: string) {
		setDrafts((prev) => prev.filter((draft) => draft.id !== id));
	}

	function applyRaceSelection(id: string, raceId: string) {
		const race = races.find((r) => r.id === raceId);
		if (!race) return;
		updateDraft(id, {
			raceOrder: race.raceOrder ? String(race.raceOrder) : '',
			raceSourceId: race.sourceId ?? '',
		});
	}

	async function save() {
		if (!eventId) {
			setErr('Select an event before saving.');
			return;
		}
		if (draftErrors.length > 0) {
			setErr('Resolve validation errors before saving.');
			return;
		}
		setBusy(true);
		setErr(null);
		setOk(null);
		try {
			const payload = JSON.stringify({
				formatId: selectedFormatId,
				anchors: canonicalCurrent,
			});
			const col = pb.collection('client_kv');
			if (existingRecord) {
				await col.update(existingRecord.id, { value: payload });
			} else {
				await col.create({
					namespace: BRACKET_KV_NAMESPACE,
					key: ELIMINATION_CONFIG_KV_KEY,
					value: payload,
					event: eventId,
				});
			}
			setOk('Saved elimination config');
		} catch (e: unknown) {
			setErr(e instanceof Error ? e.message : 'Save failed');
		} finally {
			setBusy(false);
		}
	}

	async function clearAnchors() {
		if (!existingRecord) {
			setDrafts([]);
			setSelectedFormatId(DEFAULT_BRACKET_FORMAT_ID);
			return;
		}
		setBusy(true);
		setErr(null);
		setOk(null);
		try {
			await pb.collection('client_kv').delete(existingRecord.id);
			setDrafts([]);
			setSelectedFormatId(DEFAULT_BRACKET_FORMAT_ID);
			setOk('Cleared');
		} catch (e: unknown) {
			setErr(e instanceof Error ? e.message : 'Clear failed');
		} finally {
			setBusy(false);
		}
	}

	return (
		<div className='kv-bracket-anchors'>
			<div className='muted'>namespace={BRACKET_KV_NAMESPACE}, key={ELIMINATION_CONFIG_KV_KEY}</div>
			{!eventId && <p className='muted' style={{ color: 'crimson' }}>Select an event to edit anchors.</p>}
			<div className='kv-anchor-actions'>
				<label>
					Format
					<select
						value={selectedFormatId}
						onChange={(event) => setSelectedFormatId(event.currentTarget.value)}
						disabled={busy}
					>
						{formats.map((format) => <option key={format.id} value={format.id}>{format.label}</option>)}
					</select>
				</label>
			</div>
			<div className='kv-anchor-table-wrapper'>
				<table className='kv-anchor-table'>
					<thead>
						<tr>
							<th>Bracket order</th>
							<th>Race order</th>
							<th>Race source ID</th>
							<th>Quick assign</th>
							<th />
						</tr>
					</thead>
					<tbody>
						{drafts.length === 0 && (
							<tr>
								<td colSpan={5} className='muted'>No anchors configured.</td>
							</tr>
						)}
						{drafts.map((draft) => (
							<tr key={draft.id}>
								<td>
									<input
										type='number'
										min={1}
										max={maxOrder}
										value={draft.bracketOrder}
										onChange={(event) => updateDraft(draft.id, { bracketOrder: event.currentTarget.value })}
									/>
								</td>
								<td>
									<input
										type='number'
										min={1}
										placeholder='e.g. 9'
										value={draft.raceOrder}
										onChange={(event) => updateDraft(draft.id, { raceOrder: event.currentTarget.value })}
									/>
								</td>
								<td>
									<input
										type='text'
										placeholder='FPV source ID'
										value={draft.raceSourceId}
										onChange={(event) => updateDraft(draft.id, { raceSourceId: event.currentTarget.value })}
									/>
								</td>
								<td>
									<select
										defaultValue=''
										onChange={(event) => {
											applyRaceSelection(draft.id, event.currentTarget.value);
											event.currentTarget.value = '';
										}}
									>
										<option value=''>Choose race…</option>
										{races.map((race) => (
											<option key={race.id} value={race.id}>
												{formatRaceLabel(race, rounds)} — #{race.raceOrder} / {race.sourceId ?? 'no-source'}
											</option>
										))}
									</select>
								</td>
								<td>
									<button type='button' onClick={() => removeDraft(draft.id)}>
										Remove
									</button>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
			<div className='kv-anchor-actions'>
				<button type='button' onClick={addDraft}>Add anchor</button>
				<button
					type='button'
					onClick={() => {
						setSelectedFormatId(remoteConfig.formatId);
						setDrafts(remoteDrafts);
					}}
					disabled={!isDirty || busy}
				>
					Reset
				</button>
				<button type='button' onClick={clearAnchors} disabled={busy || (!existingRecord && drafts.length === 0)}>Clear</button>
			</div>
			<div className='kv-anchor-save'>
				<button
					type='button'
					onClick={save}
					disabled={busy || !eventId || draftErrors.length > 0 || !isDirty}
				>
					{busy ? 'Saving…' : 'Save config'}
				</button>
				{err && <span style={{ color: 'crimson' }}>{err}</span>}
				{!err && ok && <span className='muted'>{ok}</span>}
			</div>
			{draftErrors.length > 0 && (
				<ul className='kv-anchor-errors'>
					{draftErrors.map((message, idx) => <li key={idx}>{message}</li>)}
				</ul>
			)}
			{preview.length > 0 && (
				<div className='kv-anchor-preview'>
					<h4>Preview</h4>
					<table>
						<thead>
							<tr>
								<th>Order</th>
								<th>Bracket node</th>
								<th>Race order</th>
								<th>Assigned race</th>
								<th>Source ID</th>
							</tr>
						</thead>
						<tbody>
							{preview.map((entry) => (
								<tr key={entry.order}>
									<td>{entry.order}</td>
									<td>{entry.code}</td>
									<td>{entry.race ? entry.race.raceOrder : '—'}</td>
									<td>{formatRaceLabel(entry.race ?? null, rounds)}</td>
									<td>{entry.race?.sourceId ?? '—'}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
		</div>
	);
}
