import './TimelineEditor.css';

import { useAtomValue } from 'jotai';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { pb } from '../api/pb.ts';
import TimelineEditorCanvas from './TimelineEditorCanvas.tsx';
import TimelineInspector from './TimelineInspector.tsx';
import {
	applyBoundaryShift,
	buildWorkingTimeline,
	cloneWorkingTimeline,
	DRAG_STEP_MINUTES,
	isEventDirty,
	localInputToMs,
	MIN_EVENT_DURATION_MS_VALUE,
	msToIso,
	updateEventFields,
	WorkingTimelineEvent,
} from './timelineEditorUtils.ts';
import { TIMELINE_EVENT_CATEGORIES } from '../api/pbTypes.ts';
import type { TimelineEventCategory } from '../api/pbTypes.ts';
import { currentEventAtom } from '../state/pbAtoms.ts';
import { currentEventTimelineAtom } from '../state/timelineAtoms.ts';

const DEFAULT_NEW_TITLE = 'New timeline item';
const DEFAULT_EVENT_DURATION_MINUTES = 15;
const DEFAULT_EVENT_DURATION_MS = DEFAULT_EVENT_DURATION_MINUTES * 60_000;

export default function TimelineEditor() {
	const currentEvent = useAtomValue(currentEventAtom);
	const timelineRecords = useAtomValue(currentEventTimelineAtom);

	const baseline = useMemo(() => buildWorkingTimeline(timelineRecords), [timelineRecords]);
	const [working, setWorking] = useState<WorkingTimelineEvent[]>(() => cloneWorkingTimeline(baseline));
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [zoom, setZoom] = useState<number>(6);
	const [panMinutes, setPanMinutes] = useState<number>(0);
	const [statusMessage, setStatusMessage] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [saving, setSaving] = useState(false);

	useEffect(() => {
		setWorking((prev) => mergeWorkingTimeline(baseline, prev));
	}, [baseline]);

	useEffect(() => {
		if (!selectedId && working.length > 0) {
			setSelectedId(working[0].id);
			return;
		}
		if (selectedId && !working.some((event) => event.id === selectedId)) {
			setSelectedId(working.length > 0 ? working[0].id : null);
		}
	}, [working, selectedId]);

	const dirtyEvents = useMemo(() => working.filter((event) => isEventDirty(event)), [working]);
	const dirtyCount = dirtyEvents.length;
	const hasDirty = dirtyCount > 0;

	const diffSummary = useMemo(() => {
		if (!hasDirty) return '';
		const created = 0;
		let modified = 0;
		const removed = 0; // not tracked locally; could be inferred if baseline had entries not present
		for (const event of working) {
			if (!event.record) continue;
			if (isEventDirty(event)) modified++;
		}
		// Heuristic: in this editor we currently only modify; creation/deletion updates server immediately via buttons
		return modified > 0 ? `${modified} modified` : '';
	}, [hasDirty, working]);

	const handleSelect = useCallback((id: string | null) => {
		setSelectedId(id);
	}, []);

	const handleBoundaryDrag = useCallback((index: number, deltaMinutes: number) => {
		setWorking((prev) => sortTimeline(applyBoundaryShift(prev, index, deltaMinutes)));
	}, []);

	const handleFieldChange = useCallback((id: string, patch: Partial<Omit<WorkingTimelineEvent, 'id' | 'record'>>) => {
		setWorking((prev) => {
			let next = updateEventFields(prev, id, patch);
			// Enforce minimum duration if start/end moved directly via inspector
			next = next.map((event) => {
				if (event.id !== id) return event;
				let { startMs, endMs } = event;
				if (endMs <= startMs) {
					endMs = startMs + MIN_EVENT_DURATION_MS_VALUE;
				}
				return { ...event, startMs, endMs };
			});
			if (Object.prototype.hasOwnProperty.call(patch, 'sortKey')) {
				return sortTimeline(next);
			}
			return next;
		});
	}, []);

	const handleStartChange = useCallback((id: string, value: string) => {
		const nextStart = localInputToMs(value);
		if (nextStart == null) return;
		setWorking((prev) => sortTimeline(adjustEventTime(prev, id, { startMs: nextStart })));
	}, []);

	const handleEndChange = useCallback((id: string, value: string) => {
		const nextEnd = localInputToMs(value);
		if (nextEnd == null) return;
		setWorking((prev) => sortTimeline(adjustEventTime(prev, id, { endMs: nextEnd })));
	}, []);

	const handleZoomChange = useCallback((value: number) => {
		setZoom(value);
	}, []);

	const handleZoomStep = useCallback((delta: number) => {
		setZoom((prev) => Math.max(2, Math.min(20, prev + delta)));
	}, []);

	const handlePanChange = useCallback((value: number) => {
		setPanMinutes(value);
	}, []);

	const handleAddEvent = useCallback(async () => {
		if (!currentEvent) {
			setStatusMessage('Select a current event before adding timeline entries.');
			return;
		}
		setBusy(true);
		try {
			const last = working[working.length - 1] ?? null;
			const baseStartMs = last ? last.endMs + DRAG_STEP_MINUTES * 60_000 : Date.now();
			const endMs = baseStartMs + DEFAULT_EVENT_DURATION_MS;
			await pb.collection('timeline_events').create({
				event: currentEvent.id,
				title: DEFAULT_NEW_TITLE,
				description: '',
				category: null,
				startAt: msToIso(baseStartMs),
				endAt: msToIso(endMs),
				isAllDay: false,
				sortKey: working.length,
			});
			setStatusMessage('Timeline event created.');
		} catch (error: unknown) {
			setStatusMessage(extractErrorMessage(error));
		} finally {
			setBusy(false);
		}
	}, [currentEvent, working]);

	const handleDeleteEvent = useCallback(async () => {
		if (!selectedId) return;
		const target = working.find((event) => event.id === selectedId);
		if (!target) return;
		const confirmMessage = `Delete “${target.title || 'Untitled'}”?`;
		if (!confirm(confirmMessage)) return;
		setBusy(true);
		try {
			await pb.collection('timeline_events').delete(target.id);
			setStatusMessage('Event deleted.');
		} catch (error: unknown) {
			setStatusMessage(extractErrorMessage(error));
		} finally {
			setBusy(false);
		}
	}, [selectedId, working]);

	const handleDuplicateEvent = useCallback(async () => {
		if (!selectedId || !currentEvent) return;
		const source = working.find((event) => event.id === selectedId);
		if (!source) return;
		setBusy(true);
		try {
			const shiftMs = DRAG_STEP_MINUTES * 60_000;
			await pb.collection('timeline_events').create({
				event: currentEvent.id,
				title: source.title ? `${source.title} (copy)` : DEFAULT_NEW_TITLE,
				description: source.description,
				category: source.category || null,
				startAt: msToIso(source.startMs + shiftMs),
				endAt: msToIso(source.endMs + shiftMs),
				isAllDay: source.isAllDay,
				sortKey: (source.sortKey ?? 0) + 1,
			});
			setStatusMessage('Event duplicated.');
		} catch (error: unknown) {
			setStatusMessage(extractErrorMessage(error));
		} finally {
			setBusy(false);
		}
	}, [selectedId, working, currentEvent]);

	const handleReset = useCallback(() => {
		setWorking(cloneWorkingTimeline(baseline));
		setStatusMessage('Draft changes reset.');
	}, [baseline]);

	const handleSave = useCallback(async () => {
		if (!hasDirty) return;
		setSaving(true);
		setStatusMessage(null);
		try {
			const updates = dirtyEvents.map((event) => pb.collection('timeline_events').update(event.id, buildUpdatePayload(event)));
			const results = await Promise.allSettled(updates);
			const failures = results.filter((result) => result.status === 'rejected').length;
			if (failures === 0) {
				setStatusMessage(`Saved ${dirtyEvents.length} event${dirtyEvents.length === 1 ? '' : 's'}.`);
			} else {
				setStatusMessage(`Saved with ${failures} error${failures === 1 ? '' : 's'}.`);
			}
		} catch (error: unknown) {
			setStatusMessage(extractErrorMessage(error));
		} finally {
			setSaving(false);
		}
	}, [dirtyEvents, hasDirty]);

	return (
		<div className='timeline-editor-page admin-page'>
			<header className='timeline-editor-header section-card'>
				<div>
					<h1>Timeline editor</h1>
					<p className='muted'>Adjust the live schedule with direct manipulation. Changes remain local until saved.</p>
				</div>
				<div className='timeline-editor-actions'>
					<button type='button' onClick={handleSave} disabled={!hasDirty || saving || busy}>Save changes</button>
					<button type='button' onClick={handleReset} disabled={!hasDirty || saving || busy}>Reset drafts</button>
					<button type='button' onClick={handleAddEvent} disabled={busy || saving}>Add event</button>
					<button type='button' onClick={handleDuplicateEvent} disabled={!selectedId || busy || saving}>Duplicate</button>
					<button type='button' onClick={handleDeleteEvent} disabled={!selectedId || busy || saving}>Delete</button>
					<span className='muted'>
						{hasDirty ? `${dirtyCount} draft change${dirtyCount === 1 ? '' : 's'}` : 'No draft changes'}
						{diffSummary && (
							<>
								{' · '}
								{diffSummary}
							</>
						)}
					</span>
				</div>
			</header>

			{statusMessage && (
				<div className='status-banner' role='status'>
					<span>{statusMessage}</span>
					<button type='button' onClick={() => setStatusMessage(null)} aria-label='Dismiss'>×</button>
				</div>
			)}

			{!currentEvent && (
				<div className='warning-banner'>
					No current event is selected. Timeline changes will not be persisted until an event is marked as current.
				</div>
			)}

			<section className='timeline-editor-body'>
				<TimelineEditorCanvas
					events={working}
					selectedId={selectedId}
					onSelect={handleSelect}
					onBoundaryDrag={handleBoundaryDrag}
					zoom={zoom}
					onZoomChange={handleZoomChange}
					onZoomStep={handleZoomStep}
					panMinutes={panMinutes}
					onPanChange={handlePanChange}
				/>
				<TimelineInspector
					event={selectedId ? working.find((event) => event.id === selectedId) ?? null : null}
					onFieldChange={handleFieldChange}
					onStartChange={handleStartChange}
					onEndChange={handleEndChange}
					disabled={busy || saving}
					categories={TIMELINE_EVENT_CATEGORIES}
				/>
			</section>
		</div>
	);
}

function mergeWorkingTimeline(
	baseline: WorkingTimelineEvent[],
	working: WorkingTimelineEvent[],
): WorkingTimelineEvent[] {
	if (baseline.length === 0) return [];
	const previous = new Map<string, WorkingTimelineEvent>();
	for (const item of working) previous.set(item.id, item);
	return sortTimeline(baseline.map((item) => {
		const existing = previous.get(item.id);
		if (!existing) return { ...item };
		return { ...existing, record: item.record };
	}));
}

function adjustEventTime(
	events: WorkingTimelineEvent[],
	id: string,
	patch: Partial<Pick<WorkingTimelineEvent, 'startMs' | 'endMs'>>,
): WorkingTimelineEvent[] {
	return events.map((event) => {
		if (event.id !== id) return event;
		const nextStart = patch.startMs ?? event.startMs;
		let nextEnd = patch.endMs ?? event.endMs;
		if (nextEnd <= nextStart) {
			nextEnd = nextStart + MIN_EVENT_DURATION_MS_VALUE;
		}
		return { ...event, startMs: nextStart, endMs: nextEnd };
	});
}

function sortTimeline(events: WorkingTimelineEvent[]): WorkingTimelineEvent[] {
	return [...events].sort((a, b) => {
		if (a.startMs !== b.startMs) return a.startMs - b.startMs;
		const sortA = a.sortKey ?? 0;
		const sortB = b.sortKey ?? 0;
		if (sortA !== sortB) return sortA - sortB;
		return a.id.localeCompare(b.id);
	});
}

function buildUpdatePayload(event: WorkingTimelineEvent) {
	return {
		title: event.title.trim() || DEFAULT_NEW_TITLE,
		description: event.description.trim() || null,
		category: event.category || null,
		isAllDay: event.isAllDay,
		sortKey: event.sortKey,
		startAt: msToIso(event.startMs),
		endAt: msToIso(event.endMs),
	};
}

function extractErrorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	return 'Operation failed';
}
