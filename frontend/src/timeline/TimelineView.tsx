import './TimelineView.css';

import { useAtomValue } from 'jotai';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
	activeTimelineEventAtom,
	groupedTimelineDaysAtom,
	previousTimelineEventAtom,
	timelineBoundsAtom,
	timelineEventModelsAtom,
	TimelineEventWithMeta,
	timelineNowAtom,
	upcomingTimelineEventsAtom,
} from '../state/timelineAtoms.ts';
import { computeTimelineLayout } from './timeline-layout.ts';
import type { TimelineLayoutEvent } from './timeline-layout.ts';
import type { TimelineEventCategory } from '../api/pbTypes.ts';

const MS_PER_MINUTE = 60_000;
const MIN_ZOOM = 2;
const MAX_ZOOM = 12;
const ZOOM_STEP = 0.5;
const PAN_STEP_MINUTES = 15;
const PAN_LIMIT_MINUTES = 360;

interface TimelineViewProps {
	compact?: boolean;
}

export default function TimelineView({ compact = false }: TimelineViewProps = {}) {
	const events = useAtomValue(timelineEventModelsAtom);
	const groupedDays = useAtomValue(groupedTimelineDaysAtom);
	const activeEvent = useAtomValue(activeTimelineEventAtom);
	const previousEvent = useAtomValue(previousTimelineEventAtom);
	const upcomingEvents = useAtomValue(upcomingTimelineEventsAtom);
	const baseNow = useAtomValue(timelineNowAtom);
	const bounds = useAtomValue(timelineBoundsAtom);
	const [zoom, setZoom] = useState<number>(5);
	const [panMinutes, setPanMinutes] = useState<number>(0);

	const layout = useMemo(() => {
		return computeTimelineLayout(events, {
			now: baseNow,
			pixelsPerMinute: zoom,
			minimumEventMinutes: 8,
			minimumTimelineMinutes: 180,
		});
	}, [events, baseNow, zoom]);

	const layoutMap = useMemo(() => {
		return new Map<string, TimelineLayoutEvent>(layout.events.map((item) => [item.event.id, item]));
	}, [layout.events]);

	const dayMarkers = useMemo(() => {
		return groupedDays.map((group) => {
			const firstEvent = group.events[0];
			const layoutEvent = firstEvent ? layoutMap.get(firstEvent.id) : undefined;
			return {
				dayKey: group.dayKey,
				date: group.date,
				label: formatDayLabel(group.date),
				topPx: layoutEvent?.topPx ?? 0,
			};
		});
	}, [groupedDays, layoutMap]);

	const trackRef = useRef<HTMLDivElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const nowRef = useRef<HTMLDivElement>(null);
	const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

	useEffect(() => {
		setSelectedEventId((current) => (current && events.find((event) => event.id === current) ? current : null));
	}, [events]);

	useEffect(() => {
		setPanMinutes(0);
	}, [events.length]);

	useEffect(() => {
		const track = trackRef.current;
		const container = containerRef.current;
		const nowEl = nowRef.current;
		if (!track || !container || !nowEl || layout.totalHeightPx === 0) return;

		let rafId = 0;
		const pixelsPerMinute = zoom;

		const tick = () => {
			const now = Date.now();
			const clampedNow = clampNow(now, layout.startMs, layout.endMs);
			const minutesFromStart = (clampedNow - layout.startMs) / MS_PER_MINUTE;
			const nowPx = minutesFromStart * pixelsPerMinute;

			nowEl.style.transform = `translateY(${nowPx}px)`;

			const viewportHeight = container.clientHeight;
			const targetPosition = viewportHeight * 0.33;
			const desiredTranslation = targetPosition - nowPx + panMinutes * pixelsPerMinute;
			const minTranslation = Math.min(0, viewportHeight - layout.totalHeightPx);
			const maxTranslation = 0;
			const translation = Math.max(minTranslation, Math.min(desiredTranslation, maxTranslation));
			track.style.transform = `translateY(${translation}px)`;

			rafId = requestAnimationFrame(tick);
		};

		rafId = requestAnimationFrame(tick);

		return () => cancelAnimationFrame(rafId);
	}, [layout, panMinutes, zoom]);

	const clampZoom = useCallback((value: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value)), []);
	const clampPan = useCallback((value: number) => Math.min(PAN_LIMIT_MINUTES, Math.max(-PAN_LIMIT_MINUTES, value)), []);

	const handleZoomChange = useCallback((value: number) => {
		setZoom((prev) => {
			const next = clampZoom(value);
			return Math.abs(prev - next) < 0.001 ? prev : next;
		});
	}, [clampZoom]);

	const stepZoom = useCallback((delta: number) => {
		handleZoomChange(zoom + delta);
	}, [handleZoomChange, zoom]);

	const stepPan = useCallback((deltaMinutes: number) => {
		setPanMinutes((prev) => clampPan(prev + deltaMinutes));
	}, [clampPan]);

	const resetPan = useCallback(() => setPanMinutes(0), []);

	const viewClassName = 'timeline-view' + (compact ? ' compact' : '');

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;
		const wheelHandler = (event: WheelEvent) => {
			event.preventDefault();
			setPanMinutes((prev) => clampPan(prev + event.deltaY / (zoom * 4)));
		};
		container.addEventListener('wheel', wheelHandler, { passive: false });
		return () => {
			container.removeEventListener('wheel', wheelHandler);
		};
	}, [clampPan, zoom]);

	if (events.length === 0) {
		return (
			<div className={`${viewClassName} empty-state`}>
				<div className='empty-card'>
					<h2>No timeline scheduled</h2>
					<p>
						We don’t have any timeline entries for today. Once race control adds events, they will appear here automatically.
					</p>
				</div>
			</div>
		);
	}

	const upcomingHighlight = upcomingEvents.find((event) => event.id !== activeEvent?.id);

	return (
		<div className={viewClassName}>
			<div className='timeline-main'>
				<TimelineControls
					zoom={zoom}
					onZoomChange={handleZoomChange}
					onZoomStep={stepZoom}
					onPanStep={stepPan}
					onPanReset={resetPan}
					panMinutes={panMinutes}
				/>
				<div className='timeline-body' ref={containerRef}>
					<div className='timeline-rail' />
					<div className='timeline-track' ref={trackRef} style={{ height: layout.totalHeightPx }}>
						<div className='timeline-now-marker' ref={nowRef} aria-hidden='true'>
							<span>Now</span>
						</div>
						{dayMarkers.map((marker) => (
							<div key={marker.dayKey} className='timeline-day-marker' style={{ top: marker.topPx }}>
								<div className='timeline-day-chip'>{marker.label}</div>
							</div>
						))}
						{layout.events.map((item) => {
							const { event } = item;
							const isActive = activeEvent?.id === event.id;
							const isSelected = selectedEventId === event.id;
							const isPrevious = previousEvent?.id === event.id;
							const isUpcoming = upcomingHighlight?.id === event.id;
							return (
								<ArticleButton
									key={event.id}
									event={event}
									layout={item}
									onToggle={() => setSelectedEventId((current) => current === event.id ? null : event.id)}
									isActive={isActive}
									isSelected={isSelected || isActive}
									isPrevious={isPrevious}
									isUpcoming={isUpcoming}
								/>
							);
						})}
					</div>
				</div>
			</div>
			{!compact && (
				<aside className='timeline-side-panel'>
					<EventSummary
						active={activeEvent ?? null}
						upcoming={upcomingEvents}
						bounds={bounds}
						now={baseNow}
					/>
				</aside>
			)}
		</div>
	);
}

interface ArticleButtonProps {
	event: TimelineEventWithMeta;
	layout: TimelineLayoutEvent;
	onToggle: () => void;
	isActive: boolean;
	isSelected: boolean;
	isPrevious: boolean;
	isUpcoming: boolean;
}

function ArticleButton({
	event,
	layout,
	onToggle,
	isActive,
	isSelected,
	isPrevious,
	isUpcoming,
}: ArticleButtonProps) {
	const classNames = ['timeline-event'];
	classNames.push(`category-${sanitizeCategory(event.category)}`);
	if (isActive) classNames.push('is-active');
	if (isSelected) classNames.push('is-expanded');
	if (isPrevious) classNames.push('is-previous');
	if (isUpcoming) classNames.push('is-upcoming');

	return (
		<button
			type='button'
			className={classNames.join(' ')}
			style={{ top: layout.topPx, height: layout.heightPx }}
			onClick={onToggle}
			aria-pressed={isSelected}
			aria-expanded={isSelected}
		>
			<header className='timeline-event-header'>
				<span className='timeline-event-time'>{formatEventTime(event)}</span>
				<strong className='timeline-event-title'>{event.title}</strong>
			</header>
			<div className='timeline-event-meta'>
				<span className='timeline-event-category'>{formatCategory(event.category)}</span>
				<span className='timeline-event-duration'>{formatDuration(event)}</span>
			</div>
			{event.description && <p className='timeline-event-description'>{event.description}</p>}
		</button>
	);
}

interface EventSummaryProps {
	active: TimelineEventWithMeta | null;
	upcoming: TimelineEventWithMeta[];
	bounds: { min: number; max: number } | null;
	now: number;
}

function EventSummary({ active, upcoming, bounds, now }: EventSummaryProps) {
	const nextEvents = upcoming.slice(0, 3);
	return (
		<div className='timeline-summary'>
			<div className='summary-card'>
				<h3>Timeline status</h3>
				<dl>
					<dt>Window</dt>
					<dd>{bounds ? `${formatAbsolute(bounds.min)} – ${formatAbsolute(bounds.max)}` : '—'}</dd>
				</dl>
				<dl>
					<dt>Now</dt>
					<dd>{formatAbsolute(now)}</dd>
				</dl>
			</div>
			<div className='summary-card'>
				<h3>Now playing</h3>
				{active
					? (
						<div className='summary-active'>
							<strong>{active.title}</strong>
							<span>{formatEventTime(active)}</span>
						</div>
					)
					: <p className='muted'>No event is running right now.</p>}
			</div>
			<div className='summary-card'>
				<h3>Up next</h3>
				{nextEvents.length === 0 ? <p className='muted'>Nothing else is scheduled.</p> : (
					<ul>
						{nextEvents.map((event) => (
							<li key={event.id}>
								<strong>{event.title}</strong>
								<span>{formatEventTime(event)}</span>
							</li>
						))}
					</ul>
				)}
			</div>
		</div>
	);
}

interface TimelineControlsProps {
	zoom: number;
	onZoomChange: (value: number) => void;
	onZoomStep: (delta: number) => void;
	onPanStep: (delta: number) => void;
	onPanReset: () => void;
	panMinutes: number;
}

function TimelineControls({ zoom, onZoomChange, onZoomStep, onPanStep, onPanReset, panMinutes }: TimelineControlsProps) {
	const zoomLabel = `${zoom.toFixed(1)}×`;
	const isPanNeutral = Math.abs(panMinutes) < 0.1;
	const panLabel = `${panMinutes > 0 ? '+' : ''}${Math.round(panMinutes)} min`;
	return (
		<div className='timeline-controls'>
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
			<div className='timeline-controls-group'>
				<span className='timeline-controls-label'>Pan</span>
				<div className='timeline-pan-controls'>
					<button type='button' onClick={() => onPanStep(-PAN_STEP_MINUTES)} aria-label='Shift earlier'>←</button>
					<button type='button' onClick={onPanReset} disabled={isPanNeutral} aria-label='Reset pan'>Reset</button>
					<button type='button' onClick={() => onPanStep(PAN_STEP_MINUTES)} aria-label='Shift later'>→</button>
					<span className='timeline-pan-value'>{panLabel}</span>
				</div>
			</div>
		</div>
	);
}

function formatEventTime(event: TimelineEventWithMeta): string {
	if (event.isAllDay) return 'All day';
	const start = toDateSafe(event.startDate);
	const end = toDateSafe(event.endDate);
	if (!start || !end) return 'Unknown';
	const startText = timeFormatter.format(start);
	const endText = timeFormatter.format(end);
	return startText === endText ? startText : `${startText} – ${endText}`;
}

function formatDuration(event: TimelineEventWithMeta): string {
	if (event.isAllDay) return 'Whole day';
	return `${event.durationMinutes} min`;
}

function formatDayLabel(date: Date): string {
	return dayFormatter.format(date);
}

function formatCategory(category?: TimelineEventCategory): string {
	const friendlySource = category ?? 'other';
	const friendly = friendlySource.replace(/-/g, ' ').toLowerCase();
	return friendly.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function sanitizeCategory(category?: TimelineEventCategory | string): string {
	return (category ?? 'other').toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

function clampNow(now: number, start: number, end: number): number {
	return Math.min(Math.max(now, start), end);
}

function toDateSafe(value: Date | null | undefined): Date | null {
	if (!value) return null;
	const time = value.getTime();
	return Number.isNaN(time) ? null : value;
}

const dayFormatter = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
const timeFormatter = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const absoluteFormatter = new Intl.DateTimeFormat(undefined, {
	year: 'numeric',
	month: 'short',
	day: 'numeric',
	hour: 'numeric',
	minute: '2-digit',
});

function formatAbsolute(timestamp: number): string {
	return absoluteFormatter.format(new Date(timestamp));
}
