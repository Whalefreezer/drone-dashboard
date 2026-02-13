import { useEffect, useMemo, useState } from 'react';
import { useAtomValue } from 'jotai';
import { clientKVRecordsAtom, currentEventAtom } from '../../state/pbAtoms.ts';
import { pb } from '../../api/pb.ts';

function parseTarget(value?: string): string {
	if (!value) return '';
	try {
		const parsed = JSON.parse(value);
		const numeric = Number(parsed);
		if (!Number.isFinite(numeric) || numeric <= 0) return '';
		return numeric.toFixed(3).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
	} catch {
		return '';
	}
}

export function ClosestLapTargetSection() {
	const eventRecord = useAtomValue(currentEventAtom);
	const kvRecords = useAtomValue(clientKVRecordsAtom);
	const existingRecord = useMemo(() => {
		if (!eventRecord) return null;
		return kvRecords.find((record) => {
			return record.namespace === 'leaderboard' &&
				record.key === 'closestLapTargetSeconds' &&
				record.event === eventRecord.id;
		}) ?? null;
	}, [kvRecords, eventRecord]);
	const [value, setValue] = useState<string>(() => parseTarget(existingRecord?.value));
	const [busy, setBusy] = useState(false);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [okMessage, setOkMessage] = useState<string | null>(null);

	useEffect(() => {
		setValue(parseTarget(existingRecord?.value));
	}, [existingRecord]);

	async function save() {
		if (!eventRecord) return;
		setBusy(true);
		setErrorMessage(null);
		setOkMessage(null);
		try {
			const numeric = Number(value);
			if (!Number.isFinite(numeric) || numeric <= 0) {
				throw new Error('Target time must be a number greater than 0.');
			}
			const normalized = Number(numeric.toFixed(3));
			const payload = JSON.stringify(normalized);
			const collection = pb.collection('client_kv');
			if (existingRecord) {
				await collection.update(existingRecord.id, { value: payload });
			} else {
				await collection.create({
					namespace: 'leaderboard',
					key: 'closestLapTargetSeconds',
					value: payload,
					event: eventRecord.id,
				});
			}
			setOkMessage('Saved');
		} catch (error: unknown) {
			setErrorMessage(error instanceof Error ? error.message : 'Save failed');
		} finally {
			setBusy(false);
		}
	}

	async function clear() {
		if (!eventRecord) return;
		setBusy(true);
		setErrorMessage(null);
		setOkMessage(null);
		try {
			if (existingRecord) {
				await pb.collection('client_kv').delete(existingRecord.id);
			}
			setValue('');
			setOkMessage('Cleared');
		} catch (error: unknown) {
			setErrorMessage(error instanceof Error ? error.message : 'Clear failed');
		} finally {
			setBusy(false);
		}
	}

	return (
		<div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
			<div className='muted'>namespace=leaderboard, key=closestLapTargetSeconds</div>
			<input
				type='number'
				min={0}
				step='0.001'
				placeholder='e.g., 22.500 (seconds)'
				value={value}
				onChange={(event) => setValue(event.currentTarget.value)}
				style={{ width: 220 }}
			/>
			<button type='button' onClick={save} disabled={busy || !eventRecord}>{busy ? 'Saving…' : 'Save'}</button>
			<button type='button' onClick={clear} disabled={busy || !eventRecord || !existingRecord}>Clear</button>
			{errorMessage && <span style={{ color: 'crimson' }}>{errorMessage}</span>}
			{okMessage && <span className='muted'>{okMessage}</span>}
		</div>
	);
}
