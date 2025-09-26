import './TimelineEditor.css';

import { useAtomValue } from 'jotai';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
	KeyboardEvent as ReactKeyboardEvent,
	PointerEvent as ReactPointerEvent,
	ReactNode,
	WheelEvent as ReactWheelEvent,
} from 'react';
import { pb } from '../api/pb.ts';
import TimelineCanvas, { TimelineCanvasLayout, TimelineCanvasRenderContext } from '../timeline/TimelineCanvas.tsx';
import TimelineInspector from './TimelineInspector.tsx';
import {
	applyBoundaryShift,
	buildWorkingTimeline,
	cloneWorkingTimeline,
	DRAG_STEP_MINUTES,
	isEventDirty,
	localInputToMs,
	MIN_EVENT_DURATION_MS_VALUE,
	MS_PER_MINUTE_VALUE,
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
const EDITOR_MIN_ZOOM = 2;
const EDITOR_MAX_ZOOM = 20;
const EDITOR_ZOOM_STEP = 0.5;
const SNAP_LEVELS = [5, 10, 15, 30, 60];
const SNAP_EPSILON = 1e-6;

type DragState = {
	index: number;
	pointerId: number;
	originY: number;
	totalDelta: number;
};

type PanDragState = {
	pointerId: number;
	originY: number;
	originPanMinutes: number;
};

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
		setZoom(Math.max(EDITOR_MIN_ZOOM, Math.min(EDITOR_MAX_ZOOM, value)));
	}, []);

	const handleZoomStep = useCallback((delta: number) => {
		setZoom((prev) => Math.max(EDITOR_MIN_ZOOM, Math.min(EDITOR_MAX_ZOOM, prev + delta)));
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
				<TimelineEditorViewport
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

interface TimelineEditorViewportProps {
	events: WorkingTimelineEvent[];
	selectedId: string | null;
	onSelect: (id: string | null) => void;
	onBoundaryDrag: (index: number, deltaMinutes: number) => void;
	zoom: number;
	onZoomChange: (value: number) => void;
	onZoomStep: (delta: number) => void;
	panMinutes: number;
	onPanChange: (value: number) => void;
}

function TimelineEditorViewport({
	events,
	selectedId,
	onSelect,
	onBoundaryDrag,
	zoom,
	onZoomChange,
	onZoomStep,
	panMinutes,
	onPanChange,
}: TimelineEditorViewportProps) {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const [dragState, setDragState] = useState<DragState | null>(null);
	const [hoverBoundary, setHoverBoundary] = useState<number | null>(null);
	const [panDrag, setPanDrag] = useState<PanDragState | null>(null);
	const panVelocityRef = useRef<number>(0);
	const rafRef = useRef<number | null>(null);

	const timelineBounds = useMemo(() => {
		if (events.length === 0) {
			const now = Date.now();
			return { start: now, end: now + 60 * MS_PER_MINUTE_VALUE };
		}
		let min = Number.POSITIVE_INFINITY;
		let max = Number.NEGATIVE_INFINITY;
		events.forEach((event) => {
			if (event.startMs < min) min = event.startMs;
			if (event.endMs > max) max = event.endMs;
		});
		const pad = 30 * MS_PER_MINUTE_VALUE;
		return { start: min - pad, end: max + pad };
	}, [events]);

	const totalMinutes = useMemo(() => {
		return Math.max(60, Math.ceil((timelineBounds.end - timelineBounds.start) / MS_PER_MINUTE_VALUE));
	}, [timelineBounds]);

	const canvasLayout = useMemo<TimelineCanvasLayout<WorkingTimelineEvent>>(() => {
		const items = events.map((event) => {
			const offsetMinutes = (event.startMs - timelineBounds.start) / MS_PER_MINUTE_VALUE;
			const durationMinutes = Math.max(
				(event.endMs - event.startMs) / MS_PER_MINUTE_VALUE,
				MIN_EVENT_DURATION_MS_VALUE / MS_PER_MINUTE_VALUE,
			);
			return {
				id: event.id,
				topPx: offsetMinutes * zoom,
				heightPx: durationMinutes * zoom,
				startMs: event.startMs,
				endMs: event.endMs,
				data: event,
			};
		});
		return {
			items,
			totalMinutes,
			totalHeightPx: totalMinutes * zoom,
			startMs: timelineBounds.start,
			endMs: timelineBounds.start + totalMinutes * MS_PER_MINUTE_VALUE,
		};
	}, [events, timelineBounds, totalMinutes, zoom]);

	const clampPanValue = useCallback((value: number) => {
		const limit = totalMinutes;
		return Math.min(limit, Math.max(-limit, value));
	}, [totalMinutes]);

	const zoomLabel = `${zoom.toFixed(1)}×`;

	const handleWheel = useCallback((event: ReactWheelEvent<HTMLDivElement>) => {
		event.preventDefault();
		if (event.ctrlKey) {
			const direction = Math.sign(event.deltaY);
			if (direction === 0) return;
			const current = zoom;
			const candidates = SNAP_LEVELS.map((value) => value / 5);
			const sorted = direction > 0
				? candidates.filter((value) => value < current).sort((a, b) => b - a)
				: candidates.filter((value) => value > current).sort((a, b) => a - b);
			const next = sorted[0] ?? (direction > 0 ? EDITOR_MIN_ZOOM : EDITOR_MAX_ZOOM);
			onZoomChange(Math.max(EDITOR_MIN_ZOOM, Math.min(EDITOR_MAX_ZOOM, next)));
			return;
		}
		onPanChange(clampPanValue(panMinutes + event.deltaY / (zoom * 4)));
	}, [zoom, panMinutes, onPanChange, onZoomChange, clampPanValue]);

	const handleBoundaryPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
		const target = event.currentTarget;
		const indexAttr = target.getAttribute('data-index');
		if (!indexAttr) return;
		const index = Number.parseInt(indexAttr, 10);
		if (!Number.isFinite(index)) return;
		event.preventDefault();
		target.setPointerCapture(event.pointerId);
		setDragState({ index, pointerId: event.pointerId, originY: event.clientY, totalDelta: 0 });
	}, []);

	const handleBoundaryPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
		setDragState((state) => {
			if (!state || state.pointerId !== event.pointerId) return state;
			event.preventDefault();
			const deltaPixels = event.clientY - state.originY;
			const rawMinutes = deltaPixels / zoom;
			const stepUnits = rawMinutes / DRAG_STEP_MINUTES;
			const snappedUnits = stepUnits >= 0 ? Math.floor(stepUnits + SNAP_EPSILON) : Math.ceil(stepUnits - SNAP_EPSILON);
			const snapped = snappedUnits * DRAG_STEP_MINUTES;
			const step = snapped - state.totalDelta;
			if (step !== 0) {
				onBoundaryDrag(state.index, step);
				return { ...state, totalDelta: state.totalDelta + step };
			}
			return state;
		});
	}, [zoom, onBoundaryDrag]);

	const handleBoundaryPointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
		setDragState((state) => {
			if (!state || state.pointerId !== event.pointerId) return state;
			const target = event.currentTarget;
			if (target.hasPointerCapture(event.pointerId)) {
				target.releasePointerCapture(event.pointerId);
			}
			setHoverBoundary(null);
			return null;
		});
	}, []);

	const handleViewportPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
		const target = event.target as HTMLElement;
		if (target.closest('.timeline-boundary') || target.closest('.timeline-canvas-event')) return;
		if (event.buttons !== 1 && event.pointerType === 'mouse') return;
		const element = event.currentTarget;
		element.setPointerCapture(event.pointerId);
		setPanDrag({ pointerId: event.pointerId, originY: event.clientY, originPanMinutes: panMinutes });
	}, [panMinutes]);

	const handleViewportPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
		setPanDrag((state) => {
			if (!state || state.pointerId !== event.pointerId) return state;
			event.preventDefault();
			const deltaPixels = event.clientY - state.originY;
			const deltaMinutes = deltaPixels / zoom;
			const nextPan = clampPanValue(state.originPanMinutes + deltaMinutes);
			onPanChange(nextPan);
			panVelocityRef.current = deltaMinutes - (panVelocityRef.current || 0);
			return state;
		});
	}, [zoom, onPanChange, clampPanValue]);

	const handleViewportPointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
		if (panDrag && panDrag.pointerId === event.pointerId) {
			const element = event.currentTarget;
			if (element.hasPointerCapture(event.pointerId)) {
				element.releasePointerCapture(event.pointerId);
			}
			setPanDrag(null);
			const decay = 0.9;
			const step = () => {
				panVelocityRef.current *= decay;
				if (Math.abs(panVelocityRef.current) < 0.01) {
					if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
					rafRef.current = null;
					return;
				}
				onPanChange(clampPanValue(panMinutes + panVelocityRef.current));
				rafRef.current = requestAnimationFrame(step);
			};
			if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
			rafRef.current = requestAnimationFrame(step);
		}
	}, [panDrag, panMinutes, onPanChange, clampPanValue]);

	useEffect(() => {
		return () => {
			if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
		};
	}, []);

	const handleKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
		if (!selectedId) return;
		const selectedIndex = events.findIndex((item) => item.id === selectedId);
		if (selectedIndex < 0 || selectedIndex >= events.length - 1) return;
		const factor = event.shiftKey ? 3 : 1;
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			onBoundaryDrag(selectedIndex, DRAG_STEP_MINUTES * factor);
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			onBoundaryDrag(selectedIndex, -DRAG_STEP_MINUTES * factor);
		}
	}, [events, selectedId, onBoundaryDrag]);

	const handleSelectEvent = useCallback((id: string, isSelected: boolean) => {
		onSelect(isSelected ? null : id);
	}, [onSelect]);

	const activeBoundaryTop = useMemo(() => {
		if (!dragState) return null;
		const item = canvasLayout.items[dragState.index];
		if (!item) return null;
		return item.topPx + item.heightPx;
	}, [dragState, canvasLayout.items]);

	const activeBoundaryTimeLabel = useMemo(() => {
		if (!dragState) return null;
		const item = canvasLayout.items[dragState.index];
		if (!item) return null;
		return timeFormatter.format(new Date(item.endMs));
	}, [dragState, canvasLayout.items]);

	const renderContent = useCallback((context: TimelineCanvasRenderContext<WorkingTimelineEvent>) => {
		if (events.length === 0) {
			return <div className='timeline-empty-state'>No timeline entries yet.</div>;
		}
		const nodes: ReactNode[] = [];
		context.layout.items.forEach((item) => {
			const event = item.data;
			const isSelected = selectedId === event.id;
			const classNames = ['timeline-canvas-event', `category-${sanitizeCategory(event.category)}`];
			if (isSelected) classNames.push('is-selected');
			nodes.push(
				<button
					key={event.id}
					type='button'
					className={classNames.join(' ')}
					style={{ top: item.topPx, height: item.heightPx }}
					onClick={() => handleSelectEvent(event.id, isSelected)}
				>
					<header>
						<strong>{event.title || 'Untitled'}</strong>
						<span className='timeline-event-meta'>{formatTimeRange(event)}</span>
						<span className='timeline-event-meta'>{formatDuration(event)}</span>
					</header>
					{event.description && <p>{event.description}</p>}
				</button>,
			);
		});
		context.layout.items.slice(0, -1).forEach((item, index) => {
			const boundaryTop = item.topPx + item.heightPx;
			const isHover = hoverBoundary === index || (dragState && dragState.index === index);
			nodes.push(
				<div
					key={`boundary-${item.id}`}
					className={`timeline-boundary${isHover ? ' is-active' : ''}`}
					style={{ top: boundaryTop }}
					data-index={index}
					onPointerDown={handleBoundaryPointerDown}
					onPointerMove={handleBoundaryPointerMove}
					onPointerUp={handleBoundaryPointerUp}
					onPointerCancel={handleBoundaryPointerUp}
					onPointerEnter={() => setHoverBoundary(index)}
					onPointerLeave={() => setHoverBoundary(null)}
				/>,
			);
		});
		return nodes;
	}, [
		events,
		selectedId,
		handleSelectEvent,
		hoverBoundary,
		dragState,
		handleBoundaryPointerDown,
		handleBoundaryPointerMove,
		handleBoundaryPointerUp,
	]);

	const renderOverlay = useCallback((_: TimelineCanvasRenderContext<WorkingTimelineEvent>) => {
		if (activeBoundaryTop == null || activeBoundaryTimeLabel == null) return null;
		return (
			<>
				<div className='timeline-guideline' style={{ top: activeBoundaryTop }} />
				<div className='timeline-time-tooltip' style={{ top: activeBoundaryTop }}>
					{activeBoundaryTimeLabel}
				</div>
			</>
		);
	}, [activeBoundaryTop, activeBoundaryTimeLabel]);

	return (
		<div className='timeline-editor-canvas'>
			<div className='timeline-canvas-toolbar'>
				<div className='timeline-controls-group'>
					<span className='timeline-controls-label'>Zoom</span>
					<div className='timeline-zoom-controls'>
						<button
							type='button'
							onClick={() => onZoomStep(-EDITOR_ZOOM_STEP)}
							disabled={zoom <= EDITOR_MIN_ZOOM}
							aria-label='Zoom out'
						>
							−
						</button>
						<input
							type='range'
							min={EDITOR_MIN_ZOOM}
							max={EDITOR_MAX_ZOOM}
							step={EDITOR_ZOOM_STEP}
							value={zoom}
							onChange={(event) => onZoomChange(Number(event.currentTarget.value))}
							aria-label='Adjust timeline zoom'
						/>
						<button
							type='button'
							onClick={() => onZoomStep(EDITOR_ZOOM_STEP)}
							disabled={zoom >= EDITOR_MAX_ZOOM}
							aria-label='Zoom in'
						>
							+
						</button>
						<span className='timeline-zoom-value'>{zoomLabel}</span>
					</div>
				</div>
			</div>
			<TimelineCanvas
				layout={canvasLayout}
				zoom={zoom}
				minZoom={EDITOR_MIN_ZOOM}
				maxZoom={EDITOR_MAX_ZOOM}
				zoomStep={EDITOR_ZOOM_STEP}
				panMinutes={panMinutes}
				onPanChange={(value) => onPanChange(clampPanValue(value))}
				onZoomChange={onZoomChange}
				clampPan={clampPanValue}
				clampZoom={(value) => Math.max(EDITOR_MIN_ZOOM, Math.min(EDITOR_MAX_ZOOM, value))}
				autoCenter={{ enabled: false }}
				containerClassName='timeline-canvas-viewport'
				trackClassName='timeline-canvas-track'
				renderContent={renderContent}
				renderOverlay={renderOverlay}
				wheelBehavior='none'
				containerRef={containerRef}
				containerProps={{
					onWheel: handleWheel,
					onPointerDown: handleViewportPointerDown,
					onPointerMove: handleViewportPointerMove,
					onPointerUp: handleViewportPointerUp,
					onPointerCancel: handleViewportPointerUp,
					tabIndex: 0,
					onKeyDown: handleKeyDown,
				}}
			/>
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

function sanitizeCategory(category?: string | null): string {
	if (!category) return 'other';
	return category.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

const timeFormatter = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });

function formatTimeRange(event: WorkingTimelineEvent): string {
	const start = new Date(event.startMs);
	const end = new Date(event.endMs);
	return `${timeFormatter.format(start)} – ${timeFormatter.format(end)}`;
}

function formatDuration(event: WorkingTimelineEvent): string {
	const minutes = Math.max(1, Math.round((event.endMs - event.startMs) / MS_PER_MINUTE_VALUE));
	return `${minutes} min`;
}
