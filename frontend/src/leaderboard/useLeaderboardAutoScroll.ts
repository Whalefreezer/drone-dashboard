import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import usePrefersReducedMotion from '../common/usePrefersReducedMotion.ts';
import { useInactivityPause } from './useInactivityPause.ts';

type RowMeta = { sourceIndex: number; clone: boolean };

interface UseLeaderboardAutoScrollArgs<Row> {
	rows: Row[];
	allowAutoScroll: boolean;
	baseGetRowKey: (row: Row, index: number) => string;
	baseGetRowClassName: (row: Row, index: number) => string | undefined;
	speedPxPerSec?: number;
	resumeDelayMs?: number;
}

interface UseLeaderboardAutoScrollResult<Row> {
	rowsForRender: Row[];
	containerRef: RefObject<HTMLDivElement | null>;
	getRowKey: (row: Row, index: number) => string;
	getRowClassName: (row: Row, index: number) => string | undefined;
	isAutoScrolling: boolean;
}

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;
const INITIAL_FRAME_INTERVAL = 1000 / 60; // Assume 60 Hz until measured

// Common monitor refresh rates (Hz) -> frame intervals (ms)
const COMMON_REFRESH_RATES = [
	{ hz: 240, interval: 1000 / 240 }, // 4.167ms
	{ hz: 165, interval: 1000 / 165 }, // 6.061ms
	{ hz: 144, interval: 1000 / 144 }, // 6.944ms
	{ hz: 120, interval: 1000 / 120 }, // 8.333ms
	{ hz: 75, interval: 1000 / 75 }, // 13.333ms
	{ hz: 60, interval: 1000 / 60 }, // 16.667ms
	{ hz: 30, interval: 1000 / 30 }, // 33.333ms
];

function snapToCommonRefreshRate(measuredInterval: number): number {
	// Find the closest common refresh rate
	let closest = COMMON_REFRESH_RATES[0];
	let minDiff = Math.abs(measuredInterval - closest.interval);

	for (let i = 1; i < COMMON_REFRESH_RATES.length; i++) {
		const diff = Math.abs(measuredInterval - COMMON_REFRESH_RATES[i].interval);
		if (diff < minDiff) {
			minDiff = diff;
			closest = COMMON_REFRESH_RATES[i];
		}
	}

	// Only snap if we're within 20% of the target refresh rate
	// This prevents snapping when framerate is actually irregular
	const tolerance = closest.interval * 0.2;
	if (minDiff <= tolerance) {
		return closest.interval;
	}

	return measuredInterval;
}

export function useLeaderboardAutoScroll<Row extends object>(
	{
		rows,
		allowAutoScroll,
		baseGetRowKey,
		baseGetRowClassName,
		speedPxPerSec = 30,
		resumeDelayMs = 2_000,
	}: UseLeaderboardAutoScrollArgs<Row>,
): UseLeaderboardAutoScrollResult<Row> {
	const containerRef = useRef<HTMLDivElement>(null);
	const bodyRef = useRef<HTMLElement | null>(null);
	const scrollTargetRef = useRef<HTMLElement | null>(null);
	const prefersReducedMotion = usePrefersReducedMotion();
	const [isOverflowing, setIsOverflowing] = useState(false);

	const shouldAutoScroll = allowAutoScroll && !prefersReducedMotion && isOverflowing && rows.length > 0;
	const duplicationMultiplier = shouldAutoScroll ? 2 : 1;

	const baseKeys = useMemo(() => rows.map((row, index) => baseGetRowKey(row, index)), [rows, baseGetRowKey]);

	const meta = useMemo<RowMeta[]>(() => {
		const baseMeta = rows.map((_row, index) => ({ sourceIndex: index, clone: false }));
		if (duplicationMultiplier === 1) return baseMeta;
		const clones = rows.map((_row, index) => ({ sourceIndex: index, clone: true }));
		return [...baseMeta, ...clones];
	}, [rows, duplicationMultiplier]);

	const rowsForRender = useMemo(() => meta.map((item) => rows[item.sourceIndex]), [meta, rows]);

	const getRowKey = useCallback((row: Row, index: number) => {
		const metaItem = meta[index];
		const baseKey = baseKeys[metaItem.sourceIndex];
		return metaItem.clone ? `${baseKey}::clone` : baseKey;
	}, [baseKeys, meta]);

	const getRowClassName = useCallback((row: Row, index: number) => {
		const metaItem = meta[index];
		return baseGetRowClassName(rows[metaItem.sourceIndex], metaItem.sourceIndex);
	}, [baseGetRowClassName, meta, rows]);

	const baseContentHeightRef = useRef(0);
	const cycleHeightRef = useRef(0);
	const isAutoScrollAllowedRef = useRef(false);
	const isActiveRef = useRef(false);
	const lastFrameTimeRef = useRef<number | null>(null);
	const frameIntervalEstimateRef = useRef(INITIAL_FRAME_INTERVAL);
	const framesSinceMoveRef = useRef(0);
	const residualPixelsRef = useRef(0);
	const virtualOffsetRef = useRef(0);

	const recomputeOverflow = useCallback(() => {
		const viewport = containerRef.current;
		if (!viewport) return;
		const body = viewport.querySelector<HTMLElement>('.gt-body');
		if (!body) return;
		bodyRef.current = body;
		const scrollTarget = viewport.querySelector<HTMLElement>('.gt-scroll') ?? viewport;
		scrollTargetRef.current = scrollTarget;
		const viewportHeight = scrollTarget.clientHeight;
		const rawHeight = body.scrollHeight;
		const baseHeight = duplicationMultiplier > 1 && rawHeight > 0 ? rawHeight / duplicationMultiplier : rawHeight;
		baseContentHeightRef.current = baseHeight;
		const cycleHeight = baseHeight;
		cycleHeightRef.current = cycleHeight;

		if (viewportHeight <= 0) {
			setIsOverflowing(false);
			return;
		}

		const needsScroll = allowAutoScroll && baseHeight - viewportHeight > 1;
		setIsOverflowing(needsScroll);
	}, [allowAutoScroll, duplicationMultiplier]);

	useIsomorphicLayoutEffect(() => {
		const viewport = containerRef.current;
		if (!viewport) return;
		const body = viewport.querySelector<HTMLElement>('.gt-body');
		if (!body) return;
		bodyRef.current = body;
		scrollTargetRef.current = viewport.querySelector<HTMLElement>('.gt-scroll') ?? viewport;
		virtualOffsetRef.current = (scrollTargetRef.current ?? viewport).scrollTop;

		recomputeOverflow();

		const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => recomputeOverflow());
		const scrollTarget = scrollTargetRef.current ?? viewport;
		resizeObserver?.observe(scrollTarget);
		resizeObserver?.observe(body);

		const mutationObserver = typeof MutationObserver === 'undefined' ? null : new MutationObserver(() => recomputeOverflow());
		mutationObserver?.observe(body, { childList: true, subtree: true });

		return () => {
			resizeObserver?.disconnect();
			mutationObserver?.disconnect();
		};
	}, [recomputeOverflow, rows.length]);

	const applyOffset = useCallback((offset: number) => {
		const viewport = containerRef.current;
		const scrollTarget = scrollTargetRef.current ?? viewport;
		const cycleHeight = cycleHeightRef.current;
		if (!scrollTarget || cycleHeight <= 0) return;

		const normalized = ((offset % cycleHeight) + cycleHeight) % cycleHeight;
		const integralOffset = Math.round(normalized);
		virtualOffsetRef.current = integralOffset;

		if (Math.abs(scrollTarget.scrollTop - integralOffset) > 0.5) {
			scrollTarget.scrollTop = integralOffset;
		}
	}, []);

	const resetCounters = useCallback(() => {
		framesSinceMoveRef.current = 0;
		residualPixelsRef.current = 0;
		lastFrameTimeRef.current = null;
	}, []);

	const { isPaused: isInteractionPaused, triggerPause, cancel } = useInactivityPause({
		delayMs: resumeDelayMs,
		disabled: !shouldAutoScroll,
		onResume: () => {
			const viewport = containerRef.current;
			const scrollTarget = scrollTargetRef.current ?? viewport;
			if (!scrollTarget) return;
			virtualOffsetRef.current = scrollTarget.scrollTop;
			applyOffset(virtualOffsetRef.current);
			resetCounters();
		},
	});

	useEffect(() => {
		isAutoScrollAllowedRef.current = shouldAutoScroll;
		if (!shouldAutoScroll) {
			resetCounters();
			cancel();
		}
	}, [cancel, resetCounters, shouldAutoScroll]);

	useEffect(() => {
		isActiveRef.current = shouldAutoScroll && !isInteractionPaused;
		if (!isActiveRef.current) {
			resetCounters();
		}
		if (isActiveRef.current) applyOffset(virtualOffsetRef.current);
	}, [applyOffset, isInteractionPaused, resetCounters, shouldAutoScroll]);

	useEffect(() => {
		if (!shouldAutoScroll) return;
		const viewport = containerRef.current;
		const scrollTarget = scrollTargetRef.current ?? viewport;
		if (!viewport || !scrollTarget) return;
		let frameId = 0;

		const step = (time: number) => {
			const cycleHeight = cycleHeightRef.current;
			if (cycleHeight <= 0) {
				frameId = requestAnimationFrame(step);
				return;
			}

			if (!isAutoScrollAllowedRef.current || !isActiveRef.current) {
				frameId = requestAnimationFrame(step);
				return;
			}

			const previousTimestamp = lastFrameTimeRef.current;
			lastFrameTimeRef.current = time;

			if (previousTimestamp === null) {
				frameId = requestAnimationFrame(step);
				return;
			}

			const delta = time - previousTimestamp;
			if (delta <= 0 || delta > 500) {
				frameId = requestAnimationFrame(step);
				return;
			}

			const smoothedInterval = (frameIntervalEstimateRef.current * 0.8) + (delta * 0.2);
			const clampedInterval = Math.max(4, Math.min(100, smoothedInterval));
			const snappedInterval = snapToCommonRefreshRate(clampedInterval);
			frameIntervalEstimateRef.current = clampedInterval;

			const frameInterval = snappedInterval;
			const pixelsPerFrameTarget = (speedPxPerSec * frameInterval) / 1000;
			let pixelsToAdvance = 0;

			if (pixelsPerFrameTarget < 1) {
				const framesPerPixel = Math.max(1, Math.round(1 / Math.max(pixelsPerFrameTarget, 0.0001)));
				framesSinceMoveRef.current += 1;
				if (framesSinceMoveRef.current >= framesPerPixel) {
					pixelsToAdvance = 1;
					framesSinceMoveRef.current = 0;
				}
			} else {
				residualPixelsRef.current += pixelsPerFrameTarget;
				pixelsToAdvance = Math.floor(residualPixelsRef.current);
				if (pixelsToAdvance > 0) residualPixelsRef.current -= pixelsToAdvance;
			}

			if (pixelsToAdvance > 0) {
				const nextOffset = virtualOffsetRef.current + pixelsToAdvance;
				applyOffset(nextOffset);
			}

			frameId = requestAnimationFrame(step);
		};

		frameId = requestAnimationFrame(step);
		return () => {
			cancelAnimationFrame(frameId);
			lastFrameTimeRef.current = null;
		};
	}, [applyOffset, resetCounters, rows.length, shouldAutoScroll, speedPxPerSec]);

	useEffect(() => {
		if (!shouldAutoScroll) return;
		const viewport = containerRef.current;
		const scrollTarget = scrollTargetRef.current ?? viewport;
		if (!viewport || !scrollTarget) return;

		let lastPointerTs = 0;
		const now = () => (typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now());

		const handleInteraction = (event: Event) => {
			if (!isAutoScrollAllowedRef.current) return;
			if (event.type === 'pointermove') {
				const currentTs = now();
				if (currentTs - lastPointerTs < 80) return;
				lastPointerTs = currentTs;
			}
			if (scrollTarget) {
				virtualOffsetRef.current = scrollTarget.scrollTop;
			}
			isActiveRef.current = false;
			resetCounters();
			triggerPause();
		};

		const passiveOpts: AddEventListenerOptions = { passive: true };
		const targetForEvents = scrollTarget ?? viewport;
		targetForEvents.addEventListener('pointermove', handleInteraction, passiveOpts);
		targetForEvents.addEventListener('pointerdown', handleInteraction, passiveOpts);
		targetForEvents.addEventListener('wheel', handleInteraction, passiveOpts);
		targetForEvents.addEventListener('touchstart', handleInteraction, passiveOpts);
		targetForEvents.addEventListener('touchmove', handleInteraction, passiveOpts);
		targetForEvents.addEventListener('focusin', handleInteraction);
		targetForEvents.addEventListener('keydown', handleInteraction);

		return () => {
			targetForEvents.removeEventListener('pointermove', handleInteraction, passiveOpts);
			targetForEvents.removeEventListener('pointerdown', handleInteraction, passiveOpts);
			targetForEvents.removeEventListener('wheel', handleInteraction, passiveOpts);
			targetForEvents.removeEventListener('touchstart', handleInteraction, passiveOpts);
			targetForEvents.removeEventListener('touchmove', handleInteraction, passiveOpts);
			targetForEvents.removeEventListener('focusin', handleInteraction);
			targetForEvents.removeEventListener('keydown', handleInteraction);
		};
	}, [resetCounters, rows.length, shouldAutoScroll, triggerPause]);

	useEffect(() => {
		if (!shouldAutoScroll) return;
		applyOffset(virtualOffsetRef.current);
	}, [applyOffset, rows.length, shouldAutoScroll]);

	const isAutoScrolling = shouldAutoScroll && !isInteractionPaused;

	return { rowsForRender, containerRef, getRowKey, getRowClassName, isAutoScrolling };
}

export default useLeaderboardAutoScroll;
