import { useEffect, useMemo, useState } from 'react';
import { useAtomValue } from 'jotai';
import { leaderboardNextRaceOverridesAtom, racesAtom, roundsDataAtom } from '../../state/pbAtoms.ts';
import { pb } from '../../api/pb.ts';
import type { PBClientKVRecord, PBRaceRecord, PBRoundRecord } from '../../api/pbTypes.ts';

interface OverrideDraft {
	startSourceId: string;
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

export function NextRaceOverrideSection(
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
