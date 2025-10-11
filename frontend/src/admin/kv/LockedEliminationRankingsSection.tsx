import { useEffect, useMemo, useState } from 'react';
import { useAtomValue } from 'jotai';
import { pilotsAtom } from '../../state/pbAtoms.ts';
import { pb } from '../../api/pb.ts';
import type { LockedPositionEntry, PBClientKVRecord, PBPilotRecord } from '../../api/pbTypes.ts';

interface ParsedLine {
	rawLine: string;
	position: number | null;
	name: string;
	note: string;
	lineNumber: number;
}

interface ResolvedEntry {
	position: number;
	name: string;
	note: string;
	pilot: PBPilotRecord | null;
	error: string | null;
	lineNumber: number;
}

/**
 * Parse a line of input into position, name, and note
 * Supports formats like:
 * - "1, Jane Doe"
 * - "Jane Doe – 1"
 * - "1. Jane Doe"
 * - "1 Jane Doe" (space-separated)
 * - "Jane Doe 1" (space-separated)
 * - "Jane Doe;1;some note"
 * - "1	Jane Doe	optional note"
 */
function parseLine(line: string, lineNumber: number): ParsedLine | null {
	const trimmed = line.trim();
	if (!trimmed) return null;

	// Try to extract position and name with various delimiters
	// Pattern 1: Position first with explicit delimiter (1, Name / 1. Name / 1: Name / 1 - Name / 1	Name)
	const pattern1 = /^\s*(\d+)\s*[,;:\.\-–—\t]\s*(.+)$/;
	const match1 = trimmed.match(pattern1);
	if (match1) {
		const position = parseInt(match1[1], 10);
		const rest = match1[2].trim();
		// Check if there's a note (additional delimiter after name)
		const noteSplit = rest.split(/[,;\t]/);
		const name = noteSplit[0].trim();
		const note = noteSplit.slice(1).join(' ').trim();
		return { rawLine: line, position, name, note, lineNumber };
	}

	// Pattern 2: Position first with space only (1 Name / 12 Name)
	const pattern2 = /^\s*(\d+)\s+(.+)$/;
	const match2 = trimmed.match(pattern2);
	if (match2) {
		const position = parseInt(match2[1], 10);
		const rest = match2[2].trim();
		// Check if there's a note (additional delimiter after name)
		const noteSplit = rest.split(/[,;\t]/);
		const name = noteSplit[0].trim();
		const note = noteSplit.slice(1).join(' ').trim();
		return { rawLine: line, position, name, note, lineNumber };
	}

	// Pattern 3: Name first, position after (Name – 1 / Name, 1 / Name: 1 / Name	1)
	const pattern3 = /^(.+?)\s*[,;:\-–—\t]\s*(\d+)\s*(.*)$/;
	const match3 = trimmed.match(pattern3);
	if (match3) {
		const name = match3[1].trim();
		const position = parseInt(match3[2], 10);
		const note = match3[3].trim();
		return { rawLine: line, position, name, note, lineNumber };
	}

	// Pattern 4: Name first with space only - match last number in line (Name Name 1)
	// This must be more careful to avoid matching things like "Robo 2000" as "Robo" + position 2000
	const pattern4 = /^(.+)\s+(\d{1,2})$/; // Limit to 1-2 digit positions to avoid matching years/large numbers
	const match4 = trimmed.match(pattern4);
	if (match4) {
		const name = match4[1].trim();
		const position = parseInt(match4[2], 10);
		return { rawLine: line, position, name, note: '', lineNumber };
	}

	// If we can't parse position, treat whole line as name
	return { rawLine: line, position: null, name: trimmed, note: '', lineNumber };
}

/**
 * Normalize a name for matching (lowercase, remove extra whitespace)
 */
function normalizeName(name: string): string {
	return name.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Find a pilot by name or sourceId (case-insensitive)
 */
function findPilot(name: string, pilots: PBPilotRecord[]): PBPilotRecord | null {
	const normalized = normalizeName(name);

	// Try exact match first
	const exact = pilots.find((p) => normalizeName(p.name) === normalized);
	if (exact) return exact;

	// Try sourceId match
	const bySourceId = pilots.find((p) => p.sourceId && normalizeName(p.sourceId) === normalized);
	if (bySourceId) return bySourceId;

	// Try partial match
	const partial = pilots.find((p) =>
		normalizeName(p.name).includes(normalized) ||
		normalized.includes(normalizeName(p.name))
	);
	return partial ?? null;
}

export function LockedEliminationRankingsSection(
	{ kvRecords, eventId }: { kvRecords: PBClientKVRecord[]; eventId: string | null },
) {
	const pilots = useAtomValue(pilotsAtom);

	const existingRecord = useMemo(() => {
		if (!eventId) return null;
		return kvRecords.find((r) =>
			r.namespace === 'leaderboard' &&
			r.key === 'lockedPositions' &&
			r.event === eventId
		) ?? null;
	}, [kvRecords, eventId]);

	// Parse existing record into text format for display
	const existingText = useMemo(() => {
		if (!existingRecord?.value) return '';
		try {
			const parsed = JSON.parse(existingRecord.value) as LockedPositionEntry[];
			if (!Array.isArray(parsed)) return '';
			return parsed.map((entry) => {
				const parts = [entry.position, entry.displayName];
				if (entry.note) parts.push(entry.note);
				return parts.join(', ');
			}).join('\n');
		} catch {
			return '';
		}
	}, [existingRecord]);

	const [inputText, setInputText] = useState(existingText);
	const [manualOverrides, setManualOverrides] = useState<Map<number, string>>(new Map());
	const [busy, setBusy] = useState(false);
	const [err, setErr] = useState<string | null>(null);
	const [ok, setOk] = useState<string | null>(null);

	useEffect(() => {
		setInputText(existingText);
		setManualOverrides(new Map());
	}, [existingText]);

	// Parse input text into lines
	const parsedLines = useMemo((): ParsedLine[] => {
		const lines = inputText.split('\n');
		return lines
			.map((line, idx) => parseLine(line, idx + 1))
			.filter((parsed): parsed is ParsedLine => parsed !== null);
	}, [inputText]);

	// Resolve each parsed line to a pilot
	const resolvedEntries = useMemo((): ResolvedEntry[] => {
		return parsedLines.map((parsed) => {
			let pilot: PBPilotRecord | null = null;
			let error: string | null = null;

			// Check for manual override first
			const override = manualOverrides.get(parsed.lineNumber);
			if (override) {
				pilot = pilots.find((p) => p.id === override) ?? null;
			}

			// If no override and no pilot found, try automatic matching
			if (!pilot && parsed.name) {
				pilot = findPilot(parsed.name, pilots);
			}

			// Validation
			if (!parsed.position) {
				error = 'Position number is required';
			} else if (!pilot) {
				error = 'Pilot not found';
			}

			return {
				position: parsed.position ?? 0,
				name: parsed.name,
				note: parsed.note,
				pilot,
				error,
				lineNumber: parsed.lineNumber,
			};
		});
	}, [parsedLines, pilots, manualOverrides]);

	// Validate for duplicate positions
	const validationErrors = useMemo((): string[] => {
		const errors: string[] = [];
		const positionCounts = new Map<number, number[]>();

		resolvedEntries.forEach((entry) => {
			if (entry.position > 0) {
				const lines = positionCounts.get(entry.position) ?? [];
				lines.push(entry.lineNumber);
				positionCounts.set(entry.position, lines);
			}
		});

		positionCounts.forEach((lines, position) => {
			if (lines.length > 1) {
				errors.push(`Position ${position} is assigned to multiple pilots (lines ${lines.join(', ')})`);
			}
		});

		return errors;
	}, [resolvedEntries]);

	const hasErrors = resolvedEntries.some((e) => e.error) || validationErrors.length > 0;
	const isDirty = inputText.trim() !== existingText.trim();

	function setManualOverride(lineNumber: number, pilotId: string) {
		setManualOverrides((prev) => {
			const next = new Map(prev);
			next.set(lineNumber, pilotId);
			return next;
		});
	}

	async function save() {
		if (!eventId) return;
		setBusy(true);
		setErr(null);
		setOk(null);

		if (hasErrors) {
			setErr('Fix validation errors before saving');
			setBusy(false);
			return;
		}

		try {
			const payload: LockedPositionEntry[] = resolvedEntries
				.filter((entry) => entry.pilot && entry.position > 0)
				.map((entry) => ({
					pilotId: entry.pilot!.id,
					pilotSourceId: entry.pilot!.sourceId ?? '',
					displayName: entry.pilot!.name,
					position: entry.position,
					...(entry.note && { note: entry.note }),
				}));

			const col = pb.collection('client_kv');
			if (existingRecord) {
				if (payload.length > 0) {
					await col.update(existingRecord.id, { value: JSON.stringify(payload) });
				} else {
					await col.delete(existingRecord.id);
				}
			} else if (payload.length > 0) {
				await col.create({
					namespace: 'leaderboard',
					key: 'lockedPositions',
					value: JSON.stringify(payload),
					event: eventId,
				});
			}

			if (payload.length === 0) {
				setOk('Cleared locked positions');
			} else {
				setOk(`Saved ${payload.length} locked positions`);
			}
		} catch (e: unknown) {
			setErr(e instanceof Error ? e.message : 'Save failed');
		} finally {
			setBusy(false);
		}
	}

	async function clear() {
		if (!eventId) return;
		if (!confirm('Clear all locked elimination rankings? This cannot be undone.')) return;

		setBusy(true);
		setErr(null);
		setOk(null);

		try {
			const col = pb.collection('client_kv');
			if (existingRecord) await col.delete(existingRecord.id);
			setInputText('');
			setManualOverrides(new Map());
			setOk('Cleared locked positions');
		} catch (e: unknown) {
			setErr(e instanceof Error ? e.message : 'Clear failed');
		} finally {
			setBusy(false);
		}
	}

	function reset() {
		setInputText(existingText);
		setManualOverrides(new Map());
		setErr(null);
		setOk(null);
	}

	const disabled = busy || !eventId;

	if (!eventId) {
		return <p className='muted'>Select an event to manage locked positions.</p>;
	}

	return (
		<div style={{ display: 'grid', gap: 12 }}>
			<div className='muted'>namespace=leaderboard, key=lockedPositions</div>

			<p className='muted'>
				Paste elimination rankings below. Supported formats: "1, Jane Doe", "1 Jane Doe", "Jane Doe 1", "1. Jane Doe", etc. Optional notes
				can be added after the name.
			</p>

			<label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
				<span className='muted'>Rankings (one per line)</span>
				<textarea
					value={inputText}
					onChange={(e) => setInputText(e.currentTarget.value)}
					disabled={disabled}
					rows={10}
					style={{ fontFamily: 'monospace', fontSize: '0.9em' }}
					placeholder='1 Jane Doe&#10;2 John Smith&#10;3 Alice Johnson'
				/>
			</label>

			{resolvedEntries.length > 0 && (
				<div>
					<h3>Preview</h3>
					<table style={{ width: '100%', borderCollapse: 'collapse' }}>
						<thead>
							<tr style={{ borderBottom: '1px solid #ccc' }}>
								<th style={{ textAlign: 'left', padding: 4 }}>Line</th>
								<th style={{ textAlign: 'left', padding: 4 }}>Position</th>
								<th style={{ textAlign: 'left', padding: 4 }}>Pilot</th>
								<th style={{ textAlign: 'left', padding: 4 }}>Note</th>
								<th style={{ textAlign: 'left', padding: 4 }}>Status</th>
							</tr>
						</thead>
						<tbody>
							{resolvedEntries.map((entry) => (
								<tr key={entry.lineNumber} style={{ borderBottom: '1px solid #eee' }}>
									<td style={{ padding: 4 }}>{entry.lineNumber}</td>
									<td style={{ padding: 4 }}>{entry.position || '?'}</td>
									<td style={{ padding: 4 }}>
										{entry.error
											? (
												<select
													value={entry.pilot?.id ?? ''}
													onChange={(e) => setManualOverride(entry.lineNumber, e.currentTarget.value)}
													disabled={disabled}
													style={{ width: '100%' }}
												>
													<option value=''>Select pilot...</option>
													{pilots.map((p) => (
														<option key={p.id} value={p.id}>
															{p.name} ({p.sourceId})
														</option>
													))}
												</select>
											)
											: <span>{entry.pilot?.name}</span>}
									</td>
									<td style={{ padding: 4 }}>{entry.note || '-'}</td>
									<td style={{ padding: 4 }}>
										{entry.error ? <span style={{ color: 'crimson' }}>{entry.error}</span> : <span style={{ color: 'green' }}>✓</span>}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}

			{validationErrors.length > 0 && (
				<ul className='muted' style={{ margin: 0, paddingLeft: 18, color: 'crimson' }}>
					{validationErrors.map((msg, idx) => <li key={idx}>{msg}</li>)}
				</ul>
			)}

			<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
				<button
					type='button'
					onClick={save}
					disabled={disabled || hasErrors || !isDirty}
				>
					{busy ? 'Saving…' : 'Save'}
				</button>
				<button type='button' onClick={reset} disabled={disabled || !isDirty}>
					Reset
				</button>
				<button type='button' onClick={clear} disabled={disabled}>
					Clear
				</button>
				{err && <span style={{ color: 'crimson' }}>{err}</span>}
				{ok && <span className='muted'>{ok}</span>}
			</div>
		</div>
	);
}
