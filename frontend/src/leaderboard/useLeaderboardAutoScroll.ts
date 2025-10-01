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
const LOOP_GAP_PX = 24;
const INITIAL_FRAME_INTERVAL = 1000 / 60; // Assume 60 Hz until measured

export function useLeaderboardAutoScroll<Row extends object>(
	{
		rows,
		allowAutoScroll,
		baseGetRowKey,
		baseGetRowClassName,
		speedPxPerSec = 16,
		resumeDelayMs = 4500,
	}: UseLeaderboardAutoScrollArgs<Row>,
): UseLeaderboardAutoScrollResult<Row> {
	const containerRef = useRef<HTMLDivElement>(null);
	const bodyRef = useRef<HTMLElement | null>(null);
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
	const suppressScrollEventRef = useRef(false);

	const recomputeOverflow = useCallback(() => {
		const viewport = containerRef.current;
		if (!viewport) return;
		const body = viewport.querySelector<HTMLElement>('.gt-body');
		if (!body) return;
		bodyRef.current = body;
		const viewportHeight = viewport.clientHeight;
		const rawHeight = body.scrollHeight;
		const baseHeight = duplicationMultiplier > 1 && rawHeight > 0 ? rawHeight / duplicationMultiplier : rawHeight;
		baseContentHeightRef.current = baseHeight;
		const cycleHeight = baseHeight + (duplicationMultiplier > 1 ? LOOP_GAP_PX : 0);
		cycleHeightRef.current = cycleHeight;
		if (duplicationMultiplier > 1) body.style.paddingBottom = `${LOOP_GAP_PX}px`;
		else body.style.paddingBottom = '';

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

		recomputeOverflow();

		const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => recomputeOverflow());
		resizeObserver?.observe(viewport);
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
		const cycleHeight = cycleHeightRef.current;
		if (!viewport || cycleHeight <= 0) return;

		const normalized = ((offset % cycleHeight) + cycleHeight) % cycleHeight;
		const integralOffset = Math.round(normalized);
		virtualOffsetRef.current = integralOffset;

		if (Math.abs(viewport.scrollTop - integralOffset) > 0.5) {
			suppressScrollEventRef.current = true;
			viewport.scrollTop = integralOffset;
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
			if (!viewport) return;
			virtualOffsetRef.current = viewport.scrollTop;
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
		if (!viewport) return;
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
			frameIntervalEstimateRef.current = Math.max(4, Math.min(100, smoothedInterval));

			const frameInterval = frameIntervalEstimateRef.current;
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
		if (!viewport) return;

		let lastPointerTs = 0;
		const now = () => (typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now());

		const handleInteraction = (event: Event) => {
			if (!isAutoScrollAllowedRef.current) return;
			if (event.type === 'scroll') {
				if (suppressScrollEventRef.current) {
					suppressScrollEventRef.current = false;
					return;
				}
				virtualOffsetRef.current = viewport.scrollTop;
				resetCounters();
			}
			if (event.type === 'pointermove') {
				const currentTs = now();
				if (currentTs - lastPointerTs < 80) return;
				lastPointerTs = currentTs;
			}
			isActiveRef.current = false;
			resetCounters();
			triggerPause();
		};

		const passiveOpts: AddEventListenerOptions = { passive: true };
		viewport.addEventListener('pointermove', handleInteraction, passiveOpts);
		viewport.addEventListener('pointerdown', handleInteraction, passiveOpts);
		viewport.addEventListener('wheel', handleInteraction, passiveOpts);
		viewport.addEventListener('touchstart', handleInteraction, passiveOpts);
		viewport.addEventListener('touchmove', handleInteraction, passiveOpts);
		viewport.addEventListener('scroll', handleInteraction, passiveOpts);
		viewport.addEventListener('focusin', handleInteraction);
		viewport.addEventListener('keydown', handleInteraction);

		return () => {
			viewport.removeEventListener('pointermove', handleInteraction, passiveOpts);
			viewport.removeEventListener('pointerdown', handleInteraction, passiveOpts);
			viewport.removeEventListener('wheel', handleInteraction, passiveOpts);
			viewport.removeEventListener('touchstart', handleInteraction, passiveOpts);
			viewport.removeEventListener('touchmove', handleInteraction, passiveOpts);
			viewport.removeEventListener('scroll', handleInteraction, passiveOpts);
			viewport.removeEventListener('focusin', handleInteraction);
			viewport.removeEventListener('keydown', handleInteraction);
		};
	}, [resetCounters, shouldAutoScroll, triggerPause]);

	useEffect(() => {
		if (!shouldAutoScroll) {
			const viewport = containerRef.current;
			if (viewport) suppressScrollEventRef.current = false;
		}
	}, [shouldAutoScroll]);

	useEffect(() => {
		if (!shouldAutoScroll) return;
		applyOffset(virtualOffsetRef.current);
	}, [applyOffset, shouldAutoScroll]);

	const isAutoScrolling = shouldAutoScroll && !isInteractionPaused;

	return { rowsForRender, containerRef, getRowKey, getRowClassName, isAutoScrolling };
}

export default useLeaderboardAutoScroll;
