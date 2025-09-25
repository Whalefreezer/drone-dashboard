import './TimelineEditor.css';

import { useAtomValue } from 'jotai';
import { useEffect, useMemo, useState } from 'react';
import { DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { CSSProperties, FormEvent } from 'react';
import { pb } from '../api/pb.ts';
import TimelineView from '../timeline/TimelineView.tsx';
import type { PBTimelineEventRecord, TimelineEventCategory } from '../api/pbTypes.ts';
import { TIMELINE_EVENT_CATEGORIES } from '../api/pbTypes.ts';
import { currentEventAtom } from '../state/pbAtoms.ts';
import { currentEventTimelineAtom } from '../state/timelineAtoms.ts';

interface TimelineEventDraft {
	title: string;
	description: string;
	startAt: string;
	endAt: string;
	category: string;
	isAllDay: boolean;
	sortKey: string;
}

interface TimelineRowState {
	record: PBTimelineEventRecord;
	draft: TimelineEventDraft;
	dirty: boolean;
	saving: boolean;
	error: string | null;
}

const DEFAULT_NEW_TITLE = 'New timeline item';
const SHIFT_DELTA_MINUTES = 5;

export default function TimelineEditor() {
	const currentEvent = useAtomValue(currentEventAtom);
	const timelineRecords = useAtomValue(currentEventTimelineAtom);
	const sortedRecords = useMemo(() => orderTimelineRecords(timelineRecords), [timelineRecords]);

	const [drafts, setDrafts] = useState<Record<string, TimelineEventDraft>>({});
	const [saving, setSaving] = useState<Record<string, boolean>>({});
	const [errors, setErrors] = useState<Record<string, string | null>>({});
	const [cascadeShift, setCascadeShift] = useState(true);
	const [selectedIds, setSelectedIds] = useState<string[]>([]);
	const [statusMessage, setStatusMessage] = useState<string | null>(null);
	const [bulkWorking, setBulkWorking] = useState(false);
	const [reordering, setReordering] = useState(false);

	useEffect(() => {
		setDrafts((prev) => syncDrafts(prev, sortedRecords));
	}, [sortedRecords]);

	useEffect(() => {
		setSelectedIds((prev) => prev.filter((id) => sortedRecords.some((record) => record.id === id)));
	}, [sortedRecords]);

	const rows: TimelineRowState[] = useMemo(() =>
		sortedRecords.map((record) => {
			const draft = drafts[record.id] ?? createDraft(record);
			const dirty = isDirty(record, draft);
			return {
				record,
				draft,
				dirty,
				saving: Boolean(saving[record.id]),
				error: errors[record.id] ?? null,
			};
		}), [sortedRecords, drafts, saving, errors]);

	const hasSelection = selectedIds.length > 0;
	const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
	const dirtyCount = rows.reduce((count, row) => count + (row.dirty ? 1 : 0), 0);
	const hasDirty = dirtyCount > 0;

	function updateDraft(id: string, patch: Partial<TimelineEventDraft>) {
		const record = sortedRecords.find((r) => r.id === id);
		if (!record) return;
		setDrafts((prev) => ({
			...prev,
			[id]: { ...(prev[id] ?? createDraft(record)), ...patch },
		}));
	}

	async function handleDelete(id: string) {
		const record = sortedRecords.find((r) => r.id === id);
		if (!record) return;
		const confirmMessage = `Delete “${record.title || 'Untitled'}”?`;
		if (!confirm(confirmMessage)) return;
		setBulkWorking(true);
		try {
			await pb.collection('timeline_events').delete(id);
			setStatusMessage('Event deleted.');
		} catch (error: unknown) {
			setStatusMessage(extractErrorMessage(error));
		} finally {
			setBulkWorking(false);
		}
	}

	async function handleDuplicate(id: string) {
		const record = sortedRecords.find((r) => r.id === id);
		if (!record || !currentEvent) return;
		const draft = drafts[id] ?? createDraft(record);
		const start = shiftIso(record.startAt, SHIFT_DELTA_MINUTES);
		const end = record.endAt ? shiftIso(record.endAt, SHIFT_DELTA_MINUTES) : null;
		setBulkWorking(true);
		try {
			await pb.collection('timeline_events').create({
				event: currentEvent.id,
				title: draft.title ? `${draft.title} (copy)` : DEFAULT_NEW_TITLE,
				description: draft.description,
				category: draft.category || null,
				startAt: start,
				endAt: end,
				isAllDay: draft.isAllDay,
				sortKey: (record.sortKey ?? 0) + 1,
			});
			setStatusMessage('Event duplicated.');
		} catch (error: unknown) {
			setStatusMessage(extractErrorMessage(error));
		} finally {
			setBulkWorking(false);
		}
	}

	function handleShiftDraft(id: string, delta: number) {
		const index = sortedRecords.findIndex((record) => record.id === id);
		if (index === -1) return;
		const targets = cascadeShift ? sortedRecords.slice(index) : [sortedRecords[index]];
		setDrafts((prev) => {
			const next = { ...prev } as Record<string, TimelineEventDraft>;
			for (const record of targets) {
				const existing = next[record.id] ?? createDraft(record);
				const baseStart = existing.startAt || isoToLocalInput(record.startAt);
				const baseEnd = existing.endAt || isoToLocalInput(record.endAt);
				next[record.id] = {
					...existing,
					startAt: baseStart ? shiftLocalInput(baseStart, delta) : '',
					endAt: baseEnd ? shiftLocalInput(baseEnd, delta) : '',
				};
			}
			return next;
		});
		setStatusMessage(
			`Adjusted ${targets.length} draft${targets.length === 1 ? '' : 's'} by ${delta > 0 ? '+' : ''}${delta} min. Save to apply.`,
		);
	}

	async function handleAdd(event: FormEvent<HTMLButtonElement>) {
		event.preventDefault();
		if (!currentEvent) {
			setStatusMessage('Select a current event before adding timeline entries.');
			return;
		}
		setBulkWorking(true);
		try {
			const nextSort = sortedRecords.length === 0 ? 0 : Math.max(...sortedRecords.map((r) => r.sortKey ?? 0)) + 1;
			const base = sortedRecords.length > 0 ? sortedRecords[sortedRecords.length - 1] : null;
			const baseStart = base?.endAt || base?.startAt;
			const startAt = baseStart ? shiftIso(baseStart, SHIFT_DELTA_MINUTES) : new Date().toISOString();
			await pb.collection('timeline_events').create({
				event: currentEvent.id,
				title: DEFAULT_NEW_TITLE,
				description: '',
				category: null,
				startAt,
				endAt: null,
				isAllDay: false,
				sortKey: nextSort,
			});
			setStatusMessage('Timeline event created.');
		} catch (error: unknown) {
			setStatusMessage(extractErrorMessage(error));
		} finally {
			setBulkWorking(false);
		}
	}

	async function handleDeleteSelected() {
		if (!hasSelection) return;
		const confirmMessage = `Delete ${selectedIds.length} selected event(s)?`;
		if (!confirm(confirmMessage)) return;
		setBulkWorking(true);
		try {
			await Promise.all(selectedIds.map((id) => pb.collection('timeline_events').delete(id)));
			setSelectedIds([]);
			setStatusMessage('Selected events deleted.');
		} catch (error: unknown) {
			setStatusMessage(extractErrorMessage(error));
		} finally {
			setBulkWorking(false);
		}
	}

	function toggleSelection(id: string) {
		setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
	}

	function clearStatus() {
		setStatusMessage(null);
	}

	async function handleSaveAll() {
		const currentDirtyRows = rows.filter((row) => row.dirty);
		if (currentDirtyRows.length === 0) return;
		setBulkWorking(true);
		setStatusMessage(null);
		setSaving((prev) => {
			const next = { ...prev };
			for (const row of currentDirtyRows) next[row.record.id] = true;
			return next;
		});
		const results = await Promise.allSettled(currentDirtyRows.map(async (row) => {
			try {
				await pb.collection('timeline_events').update(row.record.id, buildUpdatePayload(row));
				setErrors((prev) => {
					if (!prev[row.record.id]) return prev;
					const next = { ...prev };
					delete next[row.record.id];
					return next;
				});
			} catch (error: unknown) {
				const message = extractErrorMessage(error);
				setErrors((prev) => ({ ...prev, [row.record.id]: message }));
				throw error;
			}
		}));
		setSaving((prev) => {
			const next = { ...prev };
			for (const row of currentDirtyRows) delete next[row.record.id];
			return next;
		});
		const failures = results.filter((result) => result.status === 'rejected').length;
		if (failures === 0) {
			setStatusMessage(`Saved ${currentDirtyRows.length} event${currentDirtyRows.length === 1 ? '' : 's'}.`);
		} else {
			setStatusMessage(`Saved with ${failures} error${failures === 1 ? '' : 's'}. Check highlighted rows.`);
		}
		setBulkWorking(false);
	}

	function handleResetAll() {
		const currentDirtyRows = rows.filter((row) => row.dirty);
		if (currentDirtyRows.length === 0) return;
		const nextDrafts: Record<string, TimelineEventDraft> = {};
		for (const record of sortedRecords) {
			nextDrafts[record.id] = createDraft(record);
		}
		setDrafts(nextDrafts);
		setErrors((prev) => {
			const next = { ...prev };
			for (const row of currentDirtyRows) delete next[row.record.id];
			return next;
		});
		setStatusMessage('Draft changes reset.');
	}

	async function handleDragEnd(event: DragEndEvent) {
		const { active, over } = event;
		if (!over || active.id === over.id) return;
		const currentOrder = rows.map((row) => row.record);
		const oldIndex = currentOrder.findIndex((record) => record.id === active.id);
		const newIndex = currentOrder.findIndex((record) => record.id === over.id);
		if (oldIndex === -1 || newIndex === -1) return;
		const reordered = arrayMove(currentOrder, oldIndex, newIndex);
		setReordering(true);
		try {
			await persistSortOrder(reordered);
			setStatusMessage('Timeline order updated.');
		} catch (error: unknown) {
			setStatusMessage(extractErrorMessage(error));
		} finally {
			setReordering(false);
		}
	}

	return (
		<div className='timeline-editor-page admin-page'>
			<header className='timeline-editor-header section-card'>
				<div>
					<h1>Timeline editor</h1>
					<p className='muted'>Manage public timeline entries; changes sync instantly to the pits display.</p>
				</div>
				<div className='timeline-editor-actions'>
					<button type='button' onClick={handleSaveAll} disabled={!hasDirty || bulkWorking}>Save changes</button>
					<button type='button' onClick={handleResetAll} disabled={!hasDirty || bulkWorking}>Reset drafts</button>
					<button type='button' onClick={handleAdd} disabled={bulkWorking || !currentEvent}>Add event</button>
					<button type='button' onClick={handleDeleteSelected} disabled={!hasSelection || bulkWorking}>Delete selected</button>
					<label className='toggle'>
						<input type='checkbox' checked={cascadeShift} onChange={(e) => setCascadeShift(e.currentTarget.checked)} />
						<span>Cascade shifts</span>
					</label>
					<span className='timeline-dirty-indicator muted'>
						{hasDirty ? `${dirtyCount} draft change${dirtyCount === 1 ? '' : 's'}` : 'No draft changes'}
					</span>
				</div>
			</header>

			{statusMessage && (
				<div className='status-banner' role='status'>
					<span>{statusMessage}</span>
					<button type='button' onClick={clearStatus} aria-label='Dismiss'>×</button>
				</div>
			)}

			{!currentEvent && (
				<div className='warning-banner'>
					No current event is selected. Timeline changes will not be persisted until an event is marked as current.
				</div>
			)}

			<section className='timeline-editor-grid'>
				<div className='timeline-editor-table section-card'>
					<div className='timeline-table-scroll'>
						<DndContext sensors={sensors} modifiers={[restrictToVerticalAxis]} onDragEnd={handleDragEnd}>
							<SortableContext items={rows.map((row) => row.record.id)} strategy={verticalListSortingStrategy}>
								<div className='timeline-table-head'>
									<div />
									<div>Title</div>
									<div>Timing</div>
									<div>Category</div>
									<div>Flags</div>
									<div>Actions</div>
								</div>
								{rows.map((row) => (
									<TimelineSortableRow
										key={row.record.id}
										row={row}
										toggleSelection={toggleSelection}
										selected={selectedIds.includes(row.record.id)}
										onDraftChange={updateDraft}
										onDelete={handleDelete}
										onDuplicate={handleDuplicate}
										onShiftDraft={handleShiftDraft}
										reordering={reordering}
										busy={bulkWorking}
									/>
								))}
							</SortableContext>
						</DndContext>
					</div>
				</div>

				<aside className='timeline-editor-preview section-card'>
					<h2>Live preview</h2>
					<p className='muted'>Preview updates with real data from the left-hand editor.</p>
					<div className='timeline-preview-frame'>
						<TimelineView compact />
					</div>
				</aside>
			</section>
		</div>
	);
}

function TimelineSortableRow({
	row,
	toggleSelection,
	selected,
	onDraftChange,
	onDelete,
	onDuplicate,
	onShiftDraft,
	reordering,
	busy,
}: {
	row: TimelineRowState;
	toggleSelection: (id: string) => void;
	selected: boolean;
	onDraftChange: (id: string, patch: Partial<TimelineEventDraft>) => void;
	onDelete: (id: string) => void;
	onDuplicate: (id: string) => void;
	onShiftDraft: (id: string, delta: number) => void;
	reordering: boolean;
	busy: boolean;
}) {
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.record.id });
	const style: CSSProperties = {
		transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
		transition,
		opacity: isDragging ? 0.6 : 1,
	};
	const disabled = busy || row.saving;

	return (
		<div ref={setNodeRef} className='timeline-table-row' style={style} data-dragging={isDragging}>
			<div className='timeline-row-handle'>
				<button
					type='button'
					className='drag-handle'
					{...listeners}
					{...attributes}
					disabled={reordering || busy}
					aria-label='Drag to reorder'
				>
					⋮⋮
				</button>
				<input
					type='checkbox'
					checked={selected}
					onChange={() => toggleSelection(row.record.id)}
					aria-label='Select row'
				/>
			</div>
			<div className='timeline-row-col timeline-row-main'>
				<label className='timeline-field'>
					<span>Title</span>
					<input
						type='text'
						value={row.draft.title}
						onChange={(e) => onDraftChange(row.record.id, { title: e.currentTarget.value })}
						placeholder='Event title'
						disabled={disabled}
					/>
				</label>
				<label className='timeline-field'>
					<span>Description</span>
					<textarea
						value={row.draft.description}
						onChange={(e) => onDraftChange(row.record.id, { description: e.currentTarget.value })}
						placeholder='Optional description'
						disabled={disabled}
					/>
				</label>
			</div>
			<div className='timeline-row-col timeline-row-time'>
				<label className='timeline-field'>
					<span>Start</span>
					<input
						type='datetime-local'
						value={row.draft.startAt}
						onChange={(e) => onDraftChange(row.record.id, { startAt: e.currentTarget.value })}
						disabled={disabled}
					/>
				</label>
				<label className='timeline-field'>
					<span>End</span>
					<input
						type='datetime-local'
						value={row.draft.endAt}
						onChange={(e) => onDraftChange(row.record.id, { endAt: e.currentTarget.value })}
						placeholder='Optional'
						disabled={disabled}
					/>
				</label>
			</div>
			<div className='timeline-row-col timeline-row-category'>
				<label className='timeline-field'>
					<span>Category</span>
					<select
						value={row.draft.category}
						onChange={(e) => onDraftChange(row.record.id, { category: e.currentTarget.value })}
						disabled={disabled}
					>
						<option value=''>Uncategorized</option>
						{TIMELINE_EVENT_CATEGORIES.map((category) => <option key={category} value={category}>{formatCategory(category)}</option>)}
					</select>
				</label>
				<label className='checkbox-inline'>
					<input
						type='checkbox'
						checked={row.draft.isAllDay}
						onChange={(e) => onDraftChange(row.record.id, { isAllDay: e.currentTarget.checked })}
						disabled={disabled}
					/>
					<span>All day</span>
				</label>
			</div>
			<div className='timeline-row-col timeline-row-flags'>
				<label className='timeline-field'>
					<span>Sort key</span>
					<input
						type='number'
						value={row.draft.sortKey}
						onChange={(e) => onDraftChange(row.record.id, { sortKey: e.currentTarget.value })}
						disabled={disabled}
					/>
				</label>
				<div className='timeline-row-messages'>
					{row.error && <span className='error'>{row.error}</span>}
					{row.saving && <span className='muted'>Saving…</span>}
				</div>
			</div>
			<div className='timeline-row-col timeline-row-actions'>
				<div className='button-group'>
					<button type='button' onClick={() => onShiftDraft(row.record.id, -SHIFT_DELTA_MINUTES)} disabled={disabled} title='Shift earlier'>
						−5m
					</button>
					<button type='button' onClick={() => onShiftDraft(row.record.id, SHIFT_DELTA_MINUTES)} disabled={disabled} title='Shift later'>
						+5m
					</button>
				</div>
				<div className='button-group'>
					<button type='button' onClick={() => onDuplicate(row.record.id)} disabled={disabled}>Duplicate</button>
					<button type='button' onClick={() => onDelete(row.record.id)} disabled={disabled}>Delete</button>
				</div>
			</div>
		</div>
	);
}

function createDraft(record: PBTimelineEventRecord): TimelineEventDraft {
	return {
		title: record.title ?? '',
		description: record.description ?? '',
		startAt: isoToLocalInput(record.startAt),
		endAt: isoToLocalInput(record.endAt),
		category: record.category ?? '',
		isAllDay: Boolean(record.isAllDay),
		sortKey: record.sortKey != null ? String(record.sortKey) : '',
	};
}

function syncDrafts(previous: Record<string, TimelineEventDraft>, records: PBTimelineEventRecord[]) {
	const next = { ...previous } as Record<string, TimelineEventDraft>;
	let changed = false;
	for (const record of records) {
		if (!next[record.id]) {
			next[record.id] = createDraft(record);
			changed = true;
		}
	}
	for (const id of Object.keys(next)) {
		if (!records.find((record) => record.id === id)) {
			delete next[id];
			changed = true;
		}
	}
	return changed ? next : previous;
}

function buildUpdatePayload(row: TimelineRowState) {
	const trimmedSortKey = row.draft.sortKey.trim();
	const numericSortKey = trimmedSortKey === '' ? null : Number(trimmedSortKey);
	const safeSortKey = numericSortKey != null && Number.isFinite(numericSortKey) ? numericSortKey : null;

	return {
		title: row.draft.title.trim() || DEFAULT_NEW_TITLE,
		description: row.draft.description.trim() || null,
		category: row.draft.category || null,
		startAt: localInputToIso(row.draft.startAt) ?? row.record.startAt,
		endAt: row.draft.endAt ? localInputToIso(row.draft.endAt) : null,
		isAllDay: row.draft.isAllDay,
		sortKey: safeSortKey,
	};
}

function isDirty(record: PBTimelineEventRecord, draft: TimelineEventDraft) {
	return (
		(record.title ?? '') !== draft.title ||
		(record.description ?? '') !== draft.description ||
		(record.category ?? '') !== draft.category ||
		Boolean(record.isAllDay) !== draft.isAllDay ||
		(record.sortKey == null ? '' : String(record.sortKey)) !== draft.sortKey ||
		isoToLocalInput(record.startAt) !== draft.startAt ||
		isoToLocalInput(record.endAt) !== draft.endAt
	);
}

function orderTimelineRecords(records: PBTimelineEventRecord[]) {
	return [...records].sort((a, b) => {
		const startA = safeTime(a.startAt);
		const startB = safeTime(b.startAt);
		if (startA !== startB) return startA - startB;
		const sortA = a.sortKey ?? 0;
		const sortB = b.sortKey ?? 0;
		if (sortA !== sortB) return sortA - sortB;
		return a.id.localeCompare(b.id);
	});
}

function isoToLocalInput(iso?: string | null): string {
	if (!iso) return '';
	const date = new Date(iso);
	if (!Number.isFinite(date.getTime())) return '';
	const off = date.getTimezoneOffset();
	const local = new Date(date.getTime() - off * 60_000);
	return local.toISOString().slice(0, 16);
}

function shiftLocalInput(value: string, deltaMinutes: number): string {
	if (!value) return '';
	const date = new Date(value);
	if (!Number.isFinite(date.getTime())) return value;
	date.setMinutes(date.getMinutes() + deltaMinutes);
	return date.toISOString().slice(0, 16);
}

function localInputToIso(value: string): string | null {
	if (!value) return null;
	const date = new Date(value);
	if (!Number.isFinite(date.getTime())) return null;
	return date.toISOString();
}

function shiftIso(value: string | undefined, deltaMinutes: number): string {
	if (!value) return new Date().toISOString();
	const date = new Date(value);
	if (!Number.isFinite(date.getTime())) return new Date().toISOString();
	date.setMinutes(date.getMinutes() + deltaMinutes);
	return date.toISOString();
}

async function persistSortOrder(records: PBTimelineEventRecord[]) {
	await Promise.all(records.map((record, index) => {
		const desired = index;
		if (record.sortKey === desired) return Promise.resolve();
		return pb.collection('timeline_events').update(record.id, { sortKey: desired });
	}));
}

function safeTime(value?: string | null) {
	if (!value) return Number.MAX_SAFE_INTEGER;
	const parsed = Date.parse(value);
	return Number.isNaN(parsed) ? Number.MAX_SAFE_INTEGER : parsed;
}

function extractErrorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	return 'Operation failed';
}

function formatCategory(category: TimelineEventCategory): string {
	return category.replace(/-/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}
