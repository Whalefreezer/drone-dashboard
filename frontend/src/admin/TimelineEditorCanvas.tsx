import { useCallback, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent, WheelEvent } from 'react';
import type { WorkingTimelineEvent } from './timelineEditorUtils.ts';
import { DRAG_STEP_MINUTES, MIN_EVENT_DURATION_MS_VALUE, MS_PER_MINUTE_VALUE } from './timelineEditorUtils.ts';

const MIN_ZOOM = 2;
const MAX_ZOOM = 20;
const ZOOM_STEP = 0.5;
const SNAP_LEVELS = [5, 10, 15, 30, 60];

interface TimelineEditorCanvasProps {
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

export default function TimelineEditorCanvas({
	events,
	selectedId,
	onSelect,
	onBoundaryDrag,
	zoom,
	onZoomChange,
	onZoomStep,
	panMinutes,
	onPanChange,
}: TimelineEditorCanvasProps) {
	const containerRef = useRef<HTMLDivElement>(null);
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
		for (const event of events) {
			if (event.startMs < min) min = event.startMs;
			if (event.endMs > max) max = event.endMs;
		}
		const pad = 30 * MS_PER_MINUTE_VALUE;
		return { start: min - pad, end: max + pad };
	}, [events]);

	const totalMinutes = Math.max(60, Math.ceil((timelineBounds.end - timelineBounds.start) / MS_PER_MINUTE_VALUE));
	const trackHeight = totalMinutes * zoom;
	const translateY = -(panMinutes * zoom);

	const handleWheel = useCallback((event: WheelEvent<HTMLDivElement>) => {
		event.preventDefault();
		// Ctrl/Cmd + wheel → zoom with snapping; otherwise pan
		if (event.ctrlKey) {
			const direction = Math.sign(event.deltaY);
			const current = zoom;
			// Find nearest snap level depending on scroll direction
			const candidates = [...SNAP_LEVELS].map((lvl) => lvl / 5); // scale to our pixel/min ratio
			const sorted = direction > 0
				? candidates.filter((v) => v < current).sort((a, b) => b - a)
				: candidates.filter((v) => v > current).sort((a, b) => a - b);
			const next = sorted[0] ?? (direction > 0 ? MIN_ZOOM : MAX_ZOOM);
			onZoomChange(Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, next)));
			return;
		}
		onPanChange(panMinutes + event.deltaY / (zoom * 4));
	}, [panMinutes, zoom, onPanChange, onZoomChange]);

	const handleBoundaryPointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
		const target = event.currentTarget;
		const indexAttr = target.getAttribute('data-index');
		if (!indexAttr) return;
		const index = Number.parseInt(indexAttr, 10);
		if (!Number.isFinite(index)) return;
		event.preventDefault();
		target.setPointerCapture(event.pointerId);
		setDragState({ index, pointerId: event.pointerId, originY: event.clientY, totalDelta: 0 });
	}, []);

	const handleBoundaryPointerMove = useCallback((event: PointerEvent<HTMLDivElement>) => {
		setDragState((state) => {
			if (!state || state.pointerId !== event.pointerId) return state;
			event.preventDefault();
			const deltaPixels = event.clientY - state.originY;
			const rawMinutes = deltaPixels / zoom;
			const snapped = Math.round(rawMinutes / DRAG_STEP_MINUTES) * DRAG_STEP_MINUTES;
			const step = snapped - state.totalDelta;
			if (step !== 0) {
				onBoundaryDrag(state.index, step);
				return { ...state, totalDelta: state.totalDelta + step };
			}
			return state;
		});
	}, [zoom, onBoundaryDrag]);

	const handleBoundaryPointerUp = useCallback((event: PointerEvent<HTMLDivElement>) => {
		if (dragState && dragState.pointerId === event.pointerId) {
			const target = event.currentTarget;
			if (target.hasPointerCapture(event.pointerId)) {
				target.releasePointerCapture(event.pointerId);
			}
			setDragState(null);
			setHoverBoundary(null);
		}
	}, [dragState]);

	const handleViewportPointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
		// Avoid starting a pan when interacting with boundaries or events
		const target = event.target as HTMLElement;
		if (target.closest('.timeline-boundary') || target.closest('.timeline-canvas-event')) return;
		// Only primary button (or touch) initiates pan
		if (event.buttons !== 1 && event.pointerType === 'mouse') return;
		const element = event.currentTarget;
		element.setPointerCapture(event.pointerId);
		setPanDrag({ pointerId: event.pointerId, originY: event.clientY, originPanMinutes: panMinutes });
	}, [panMinutes]);

	const handleViewportPointerMove = useCallback((event: PointerEvent<HTMLDivElement>) => {
		setPanDrag((state) => {
			if (!state || state.pointerId !== event.pointerId) return state;
			event.preventDefault();
			const deltaPixels = event.clientY - state.originY;
			const deltaMinutes = deltaPixels / zoom;
			onPanChange(state.originPanMinutes + deltaMinutes);
			// crude velocity estimate (minutes per frame at ~60fps)
			panVelocityRef.current = deltaMinutes - (panVelocityRef.current || 0);
			return state;
		});
	}, [zoom, onPanChange]);

	const handleViewportPointerUp = useCallback((event: PointerEvent<HTMLDivElement>) => {
		if (panDrag && panDrag.pointerId === event.pointerId) {
			const element = event.currentTarget;
			if (element.hasPointerCapture(event.pointerId)) {
				element.releasePointerCapture(event.pointerId);
			}
			setPanDrag(null);
			// apply simple inertia
			const decay = 0.9;
			const step = () => {
				panVelocityRef.current *= decay;
				if (Math.abs(panVelocityRef.current) < 0.01) {
					if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
					rafRef.current = null;
					return;
				}
				onPanChange(panMinutes + panVelocityRef.current);
				rafRef.current = requestAnimationFrame(step);
			};
			if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
			rafRef.current = requestAnimationFrame(step);
		}
	}, [panDrag, panMinutes, onPanChange]);

	const handleKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
		if (!selectedId) return;
		const selectedIndex = events.findIndex((e) => e.id === selectedId);
		if (selectedIndex < 0 || selectedIndex >= events.length - 1) return; // no boundary after last
		const factor = event.shiftKey ? 3 : 1; // 5m or 15m with shift
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

	const zoomLabel = `${zoom.toFixed(1)}×`;

	const activeBoundaryTop = useMemo(() => {
		if (!dragState) return null;
		const upstream = events[dragState.index];
		if (!upstream) return null;
		return ((upstream.endMs - timelineBounds.start) / MS_PER_MINUTE_VALUE) * zoom;
	}, [dragState, events, timelineBounds, zoom]);

	const activeBoundaryTimeLabel = useMemo(() => {
		if (!dragState) return null;
		const upstream = events[dragState.index];
		if (!upstream) return null;
		const endDate = new Date(upstream.endMs);
		return timeFormatter.format(endDate);
	}, [dragState, events]);

	return (
		<div className='timeline-editor-canvas'>
			<div className='timeline-canvas-toolbar'>
				<div className='timeline-controls-group'>
					<span className='timeline-controls-label'>Zoom</span>
					<div className='timeline-zoom-controls'>
						<button
							type='button'
							onClick={() => onZoomStep(-ZOOM_STEP)}
							disabled={zoom <= MIN_ZOOM}
							aria-label='Zoom out'
						>
							−
						</button>
						<input
							type='range'
							min={MIN_ZOOM}
							max={MAX_ZOOM}
							step={ZOOM_STEP}
							value={zoom}
							onChange={(event) => onZoomChange(Number(event.currentTarget.value))}
							aria-label='Adjust timeline zoom'
						/>
						<button
							type='button'
							onClick={() => onZoomStep(ZOOM_STEP)}
							disabled={zoom >= MAX_ZOOM}
							aria-label='Zoom in'
						>
							+
						</button>
						<span className='timeline-zoom-value'>{zoomLabel}</span>
					</div>
				</div>
			</div>
			<div
				className='timeline-canvas-viewport'
				ref={containerRef}
				onWheel={handleWheel}
				onPointerDown={handleViewportPointerDown}
				onPointerMove={handleViewportPointerMove}
				onPointerUp={handleViewportPointerUp}
				onPointerCancel={handleViewportPointerUp}
				tabIndex={0}
				onKeyDown={handleKeyDown}
			>
				<div className='timeline-canvas-track' style={{ height: trackHeight, transform: `translateY(${translateY}px)` }}>
					{events.length === 0 ? <div className='timeline-empty-state'>No timeline entries yet.</div> : (
						<>
							{events.map((event) => {
								const top = ((event.startMs - timelineBounds.start) / MS_PER_MINUTE_VALUE) * zoom;
								const height = Math.max(
									(event.endMs - event.startMs) / MS_PER_MINUTE_VALUE * zoom,
									MIN_EVENT_DURATION_MS_VALUE / MS_PER_MINUTE_VALUE * zoom,
								);
								const isSelected = selectedId === event.id;
								const classNames = ['timeline-canvas-event', `category-${sanitizeCategory(event.category)}`];
								if (isSelected) classNames.push('is-selected');
								return (
									<button
										key={event.id}
										type='button'
										className={classNames.join(' ')}
										style={{ top, height }}
										onClick={() => handleSelectEvent(event.id, isSelected)}
									>
										<header>
											<strong>{event.title || 'Untitled'}</strong>
											<span className='timeline-event-meta'>{formatTimeRange(event)}</span>
											<span className='timeline-event-meta'>{formatDuration(event)}</span>
										</header>
										{event.description && <p>{event.description}</p>}
									</button>
								);
							})}
							{events.slice(0, -1).map((event, index) => {
								const top = ((event.endMs - timelineBounds.start) / MS_PER_MINUTE_VALUE) * zoom;
								const isHover = hoverBoundary === index || (dragState && dragState.index === index);
								return (
									<div
										key={`boundary-${event.id}`}
										className={`timeline-boundary${isHover ? ' is-active' : ''}`}
										style={{ top }}
										data-index={index}
										onPointerDown={handleBoundaryPointerDown}
										onPointerMove={handleBoundaryPointerMove}
										onPointerUp={handleBoundaryPointerUp}
										onPointerCancel={handleBoundaryPointerUp}
										onPointerEnter={() => setHoverBoundary(index)}
										onPointerLeave={() => setHoverBoundary(null)}
									/>
								);
							})}
						</>
					)}
				</div>
				{activeBoundaryTop != null && (
					<>
						<div className='timeline-guideline' style={{ top: activeBoundaryTop }} />
						<div className='timeline-time-tooltip' style={{ top: activeBoundaryTop }}>
							{activeBoundaryTimeLabel}
						</div>
					</>
				)}
			</div>
		</div>
	);
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
