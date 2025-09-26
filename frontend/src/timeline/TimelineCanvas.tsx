import { animated, useSpring } from '@react-spring/web';
import { HTMLAttributes, MutableRefObject, Ref, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode, WheelEvent as ReactWheelEvent } from 'react';

const MS_PER_MINUTE = 60_000;
const TRACK_SPRING_CONFIG = { tension: 300, friction: 40, clamp: true } as const;
const NOW_SPRING_CONFIG = { tension: 320, friction: 32, clamp: true } as const;
const DEFAULT_TICK_SPACING = 88;

interface AssignableRef<T> {
	current: T | null;
}

function mergeRefs<T>(...refs: (Ref<T> | undefined)[]): Ref<T> {
	return (value: T | null) => {
		for (const ref of refs) {
			if (!ref) continue;
			if (typeof ref === 'function') {
				ref(value);
			} else {
				(ref as AssignableRef<T>).current = value;
			}
		}
	};
}

export interface TimelineCanvasItem<Item> {
	id: string;
	topPx: number;
	heightPx: number;
	startMs: number;
	endMs: number;
	data: Item;
}

export interface TimelineCanvasLayout<Item> {
	items: TimelineCanvasItem<Item>[];
	totalMinutes: number;
	totalHeightPx: number;
	startMs: number;
	endMs: number;
}

export interface TimelineCanvasDayMarker {
	id: string;
	topPx: number;
	label: string;
}

export interface TimelineCanvasRenderContext<Item> {
	layout: TimelineCanvasLayout<Item>;
	zoom: number;
	containerRef: MutableRefObject<HTMLDivElement | null>;
	trackRef: MutableRefObject<HTMLDivElement | null>;
}

interface AutoCenterOptions {
	enabled: boolean;
	focusMs?: number | null;
	targetRatio?: number;
}

interface TimelineCanvasProps<Item> {
	layout: TimelineCanvasLayout<Item>;
	zoom: number;
	minZoom: number;
	maxZoom: number;
	zoomStep?: number;
	panMinutes: number;
	onPanChange: (value: number) => void;
	onZoomChange: (value: number) => void;
	clampPan?: (value: number) => number;
	clampZoom?: (value: number) => number;
	autoCenter?: AutoCenterOptions;
	showNowMarker?: boolean;
	nowLabel?: string;
	nowMs?: number | null;
	showTicks?: boolean;
	tickMinSpacingPx?: number;
	dayMarkers?: TimelineCanvasDayMarker[];
	containerClassName?: string;
	trackClassName?: string;
	containerProps?: HTMLAttributes<HTMLDivElement>;
	trackProps?: HTMLAttributes<HTMLDivElement>;
	renderContent: (context: TimelineCanvasRenderContext<Item>) => ReactNode;
	renderOverlay?: (context: TimelineCanvasRenderContext<Item>) => ReactNode;
	wheelBehavior?: 'zoom' | 'none';
	trackPaddingBottom?: number;
	containerRef?: Ref<HTMLDivElement>;
}

interface GeometryOptions<Item> {
	layout: TimelineCanvasLayout<Item>;
	zoom: number;
	panMinutes: number;
	autoCenter: AutoCenterOptions;
	nowMs: number | null;
	viewportHeight: number;
}

interface GeometryResult {
	translation: number;
	nowPx: number | null;
	autoOffset: number;
	focusMinutes: number | null;
	minTranslation: number;
	maxTranslation: number;
}

interface TickDefinition {
	id: string;
	type: 'hour' | 'day';
	topPx: number;
	label: string;
}

const dayFormatter = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
const timeFormatter = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });

function clampFocus(ms: number, start: number, end: number): number {
	return Math.min(Math.max(ms, start), end);
}

function computeGeometry<Item>({
	layout,
	zoom,
	panMinutes,
	autoCenter,
	nowMs,
	viewportHeight,
}: GeometryOptions<Item>): GeometryResult {
	const { startMs, endMs, totalHeightPx, totalMinutes } = layout;
	const focusCandidate = autoCenter.enabled && autoCenter.focusMs != null ? clampFocus(autoCenter.focusMs, startMs, endMs) : null;
	const focusMinutes = focusCandidate == null ? null : (focusCandidate - startMs) / MS_PER_MINUTE;
	const targetRatio = autoCenter.targetRatio ?? 0.33;
	const autoOffset = focusMinutes == null || viewportHeight <= 0 ? 0 : targetRatio * viewportHeight - focusMinutes * zoom;
	const minTranslation = Math.min(0, viewportHeight - totalHeightPx);
	const maxTranslation = 0;
	let translation = autoOffset - panMinutes * zoom;
	translation = Math.max(minTranslation, Math.min(translation, maxTranslation));

	const nowPx = nowMs == null ? null : ((clampFocus(nowMs, startMs, endMs) - startMs) / MS_PER_MINUTE) * zoom;

	return {
		translation,
		nowPx,
		autoOffset,
		focusMinutes,
		minTranslation,
		maxTranslation,
	};
}

function clampZoomValue(value: number, minZoom: number, maxZoom: number): number {
	return Math.min(maxZoom, Math.max(minZoom, value));
}

function createTicks<Item>(
	layout: TimelineCanvasLayout<Item>,
	zoom: number,
	minSpacingPx: number,
): TickDefinition[] {
	if (layout.totalMinutes <= 0 || zoom <= 0) return [];
	const ticks: TickDefinition[] = [];
	const { startMs, endMs, totalMinutes } = layout;
	const startDate = new Date(startMs);
	startDate.setHours(0, 0, 0, 0);
	if (startDate.getTime() > startMs) {
		startDate.setDate(startDate.getDate() - 1);
	}
	const dayBoundaries = new Set<number>();
	for (const day = new Date(startDate); day.getTime() <= endMs; day.setDate(day.getDate() + 1)) {
		const ts = day.getTime();
		const offsetMinutes = (ts - startMs) / MS_PER_MINUTE;
		if (offsetMinutes < 0 || offsetMinutes > totalMinutes) continue;
		dayBoundaries.add(ts);
		ticks.push({
			id: `day-${ts}`,
			type: 'day',
			topPx: offsetMinutes * zoom,
			label: dayFormatter.format(ts),
		});
	}

	const HOUR_INTERVALS = [60, 120, 180, 240, 360, 480, 720];
	const intervalMinutes = HOUR_INTERVALS.find((minutes) => minutes * zoom >= minSpacingPx) ??
		HOUR_INTERVALS[HOUR_INTERVALS.length - 1];
	const hourCursor = new Date(startMs);
	hourCursor.setSeconds(0, 0);
	const remainder = hourCursor.getMinutes() % intervalMinutes;
	if (remainder !== 0) {
		hourCursor.setMinutes(hourCursor.getMinutes() + (intervalMinutes - remainder));
	}
	for (; hourCursor.getTime() <= endMs; hourCursor.setMinutes(hourCursor.getMinutes() + intervalMinutes)) {
		const ts = hourCursor.getTime();
		if (dayBoundaries.has(ts)) continue;
		const offsetMinutes = (ts - startMs) / MS_PER_MINUTE;
		if (offsetMinutes < 0 || offsetMinutes > totalMinutes) continue;
		ticks.push({
			id: `hour-${ts}`,
			type: 'hour',
			topPx: offsetMinutes * zoom,
			label: timeFormatter.format(ts),
		});
	}

	return ticks;
}

export default function TimelineCanvas<Item>({
	layout,
	zoom,
	minZoom,
	maxZoom,
	zoomStep = 0.5,
	panMinutes,
	onPanChange,
	onZoomChange,
	clampPan,
	clampZoom,
	autoCenter = { enabled: false },
	showNowMarker = false,
	nowLabel = 'Now',
	nowMs = null,
	showTicks = false,
	tickMinSpacingPx = DEFAULT_TICK_SPACING,
	dayMarkers = [],
	containerClassName,
	trackClassName,
	containerProps,
	trackProps,
	renderContent,
	renderOverlay,
	wheelBehavior = 'zoom',
	trackPaddingBottom = 0,
	containerRef,
}: TimelineCanvasProps<Item>) {
	const mergedContainerRef = useRef<HTMLDivElement>(null);
	const trackRef = useRef<HTMLDivElement>(null);
	const [viewportHeight, setViewportHeight] = useState(0);
	const [{ y: trackY }, trackApi] = useSpring(() => ({ y: 0, config: TRACK_SPRING_CONFIG }));
	const [{ y: nowY }, nowApi] = useSpring(() => ({ y: 0, config: NOW_SPRING_CONFIG }));
	const clampPanFn = useCallback((value: number) => clampPan ? clampPan(value) : value, [clampPan]);
	const clampZoomFn = useCallback(
		(value: number) => clampZoom ? clampZoom(value) : clampZoomValue(value, minZoom, maxZoom),
		[clampZoom, minZoom, maxZoom],
	);

	useEffect(() => {
		const node = mergedContainerRef.current;
		if (!node) return;
		const observer = new ResizeObserver((entries) => {
			if (!entries[0]) return;
			setViewportHeight(entries[0].contentRect.height);
		});
		observer.observe(node);
		return () => observer.disconnect();
	}, []);

	const geometry = useMemo(() =>
		computeGeometry({
			layout,
			zoom,
			panMinutes,
			autoCenter,
			nowMs,
			viewportHeight,
		}), [layout, zoom, panMinutes, autoCenter, nowMs, viewportHeight]);

	useEffect(() => {
		trackApi.start({ y: geometry.translation });
		if (showNowMarker && geometry.nowPx != null) {
			nowApi.start({ y: geometry.nowPx });
		}
	}, [geometry.translation, geometry.nowPx, trackApi, nowApi, showNowMarker]);

	const ticks = useMemo(() => showTicks ? createTicks(layout, zoom, tickMinSpacingPx) : [], [layout, zoom, showTicks, tickMinSpacingPx]);

	const handleWheel = useCallback((event: ReactWheelEvent<HTMLDivElement>) => {
		if (wheelBehavior !== 'zoom') return;
		if (viewportHeight <= 0) return;
		if (geometry.minTranslation === geometry.maxTranslation && autoCenter.enabled) {
			// Nothing to zoom toward when the track entirely fits.
		}
		event.preventDefault();
		if (event.deltaY === 0) return;
		const direction = event.deltaY < 0 ? 1 : -1;
		const nextZoom = clampZoomFn(zoom + direction * zoomStep);
		if (Math.abs(nextZoom - zoom) < 0.001) return;

		const container = mergedContainerRef.current;
		if (!container) {
			onZoomChange(nextZoom);
			return;
		}
		const rect = container.getBoundingClientRect();
		const pointerY = event.clientY - rect.top;
		const pointerMinutes = (pointerY - geometry.translation) / zoom;

		const targetRatio = autoCenter.targetRatio ?? 0.33;
		const focusMinutes = geometry.focusMinutes;
		const autoOffsetNext = autoCenter.enabled && focusMinutes != null ? targetRatio * viewportHeight - focusMinutes * nextZoom : 0;
		let nextPan = pointerMinutes - (pointerY - autoOffsetNext) / nextZoom;
		nextPan = clampPanFn(nextPan);
		const nextGeometry = computeGeometry({
			layout,
			zoom: nextZoom,
			panMinutes: nextPan,
			autoCenter,
			nowMs,
			viewportHeight,
		});
		trackApi.start({ y: nextGeometry.translation, immediate: true });
		if (showNowMarker && nextGeometry.nowPx != null) {
			nowApi.start({ y: nextGeometry.nowPx, immediate: true });
		}
		onPanChange(nextPan);
		onZoomChange(nextZoom);
	}, [
		wheelBehavior,
		clampZoomFn,
		zoom,
		zoomStep,
		mergedContainerRef,
		geometry.translation,
		geometry.focusMinutes,
		geometry,
		clampPanFn,
		autoCenter,
		viewportHeight,
		layout,
		nowMs,
		trackApi,
		onPanChange,
		onZoomChange,
		showNowMarker,
		nowApi,
	]);

	const combinedWheelHandler = useCallback((event: ReactWheelEvent<HTMLDivElement>) => {
		if (wheelBehavior === 'zoom') {
			handleWheel(event);
			if (event.defaultPrevented) {
				containerProps?.onWheel?.(event);
				return;
			}
		}
		containerProps?.onWheel?.(event);
	}, [containerProps, handleWheel, wheelBehavior]);

	const context: TimelineCanvasRenderContext<Item> = {
		layout,
		zoom,
		containerRef: mergedContainerRef,
		trackRef,
	};

	const content = renderContent(context);
	const overlay = renderOverlay ? renderOverlay(context) : null;

	const mergedRef = useMemo(() => mergeRefs<HTMLDivElement>(mergedContainerRef, containerRef), [containerRef]);

	return (
		<div
			{...containerProps}
			className={containerClassName}
			onWheel={combinedWheelHandler}
			ref={mergedRef}
		>
			<animated.div
				{...trackProps}
				className={trackClassName}
				ref={trackRef}
				style={{
					height: layout.totalHeightPx,
					paddingBottom: trackPaddingBottom,
					y: trackY,
				}}
			>
				{showNowMarker && geometry.nowPx != null && (
					<animated.div className='timeline-now-marker' aria-hidden='true' style={{ y: nowY }}>
						<span>{nowLabel}</span>
					</animated.div>
				)}
				{showTicks &&
					ticks.map((tick) => (
						<div key={tick.id} className={`timeline-tick timeline-tick-${tick.type}`} style={{ top: tick.topPx }}>
							<span>{tick.label}</span>
						</div>
					))}
				{dayMarkers.map((marker) => (
					<div key={marker.id} className='timeline-day-marker' style={{ top: marker.topPx }}>
						<div className='timeline-day-chip'>{marker.label}</div>
					</div>
				))}
				{content}
			</animated.div>
			{overlay}
		</div>
	);
}
