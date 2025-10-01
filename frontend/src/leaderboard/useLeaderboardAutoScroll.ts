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

export function useLeaderboardAutoScroll<Row extends object>(
	{
		rows,
		allowAutoScroll,
		baseGetRowKey,
		baseGetRowClassName,
		speedPxPerSec = 120,
		resumeDelayMs = 4500,
	}: UseLeaderboardAutoScrollArgs<Row>,
): UseLeaderboardAutoScrollResult<Row> {
	const containerRef = useRef<HTMLDivElement>(null);
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
		const originalClass = baseGetRowClassName(rows[metaItem.sourceIndex], metaItem.sourceIndex);
		if (!originalClass) return undefined;
		if (!metaItem.clone) return originalClass;
		const filtered = originalClass.split(' ').filter((cls) => cls && cls !== 'split-after');
		return filtered.length > 0 ? filtered.join(' ') : undefined;
	}, [baseGetRowClassName, meta, rows]);

	const baseContentHeightRef = useRef(0);
	const isAutoScrollAllowedRef = useRef(false);
	const isActiveRef = useRef(false);
	const lastFrameTimeRef = useRef<number | null>(null);

	const recomputeOverflow = useCallback(() => {
		const viewport = containerRef.current;
		if (!viewport) return;
		const body = viewport.querySelector<HTMLElement>('.gt-body');
		if (!body) return;
		const viewportHeight = viewport.clientHeight;
		const rawHeight = body.scrollHeight;
		const baseHeight = duplicationMultiplier > 1 && rawHeight > 0 ? rawHeight / duplicationMultiplier : rawHeight;
		baseContentHeightRef.current = baseHeight;
		if (viewportHeight <= 0) {
			setIsOverflowing(false);
			return;
		}
		const needsScroll = allowAutoScroll && baseHeight - viewportHeight > 1;
		setIsOverflowing(needsScroll);
	}, [allowAutoScroll, duplicationMultiplier]);

	useIsomorphicLayoutEffect(() => {
		if (typeof window === 'undefined') return;
		const viewport = containerRef.current;
		if (!viewport) return;
		const body = viewport.querySelector<HTMLElement>('.gt-body');
		if (!body) return;

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

	const { isPaused: isInteractionPaused, triggerPause, cancel } = useInactivityPause({
		delayMs: resumeDelayMs,
		disabled: !shouldAutoScroll,
		onResume: () => {
			const viewport = containerRef.current;
			if (!viewport) return;
			const baseHeight = baseContentHeightRef.current;
			if (baseHeight > 0 && viewport.scrollTop >= baseHeight) {
				viewport.scrollTop = viewport.scrollTop % baseHeight;
			}
			lastFrameTimeRef.current = null;
		},
	});

	useEffect(() => {
		isAutoScrollAllowedRef.current = shouldAutoScroll;
		if (!shouldAutoScroll) {
			lastFrameTimeRef.current = null;
			baseContentHeightRef.current = 0;
			cancel();
		}
	}, [cancel, shouldAutoScroll]);

	useEffect(() => {
		isActiveRef.current = shouldAutoScroll && !isInteractionPaused;
		if (isActiveRef.current) lastFrameTimeRef.current = null;
	}, [isInteractionPaused, shouldAutoScroll]);

	useEffect(() => {
		const viewport = containerRef.current;
		if (!viewport) return;
		let frameId = 0;

		const step = (time: number) => {
			if (!isAutoScrollAllowedRef.current) {
				frameId = requestAnimationFrame(step);
				return;
			}

			const baseHeight = baseContentHeightRef.current;
			if (baseHeight <= 0) {
				frameId = requestAnimationFrame(step);
				return;
			}

			if (!isActiveRef.current) {
				frameId = requestAnimationFrame(step);
				return;
			}

			const previous = lastFrameTimeRef.current ?? time;
			const delta = time - previous;
			lastFrameTimeRef.current = time;

			if (delta <= 0) {
				frameId = requestAnimationFrame(step);
				return;
			}

			const distance = (speedPxPerSec * delta) / 1000;
			let next = viewport.scrollTop + distance;
			if (baseHeight > 0) {
				next = next % baseHeight;
			}
			viewport.scrollTop = next;
			frameId = requestAnimationFrame(step);
		};

		frameId = requestAnimationFrame(step);
		return () => {
			cancelAnimationFrame(frameId);
			lastFrameTimeRef.current = null;
		};
	}, [rows.length, speedPxPerSec]);

	useEffect(() => {
		if (!shouldAutoScroll) return;
		const viewport = containerRef.current;
		if (!viewport) return;

		let lastPointerTs = 0;
		const now = () => (typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now());

		const handleInteraction = (event: Event) => {
			if (!isAutoScrollAllowedRef.current) return;
			if (event.type === 'scroll' && !event.isTrusted) return;
			if (event.type === 'pointermove') {
				const currentTs = now();
				if (currentTs - lastPointerTs < 80) return;
				lastPointerTs = currentTs;
			}
			isActiveRef.current = false;
			lastFrameTimeRef.current = null;
			triggerPause();
		};

		const passiveOpts: AddEventListenerOptions = { passive: true };
		viewport.addEventListener('pointermove', handleInteraction, passiveOpts);
		viewport.addEventListener('pointerdown', handleInteraction, passiveOpts);
		viewport.addEventListener('wheel', handleInteraction, passiveOpts);
		viewport.addEventListener('touchstart', handleInteraction, passiveOpts);
		viewport.addEventListener('touchmove', handleInteraction, passiveOpts);
		// viewport.addEventListener('scroll', handleInteraction, passiveOpts);
		viewport.addEventListener('focusin', handleInteraction);
		viewport.addEventListener('keydown', handleInteraction);

		return () => {
			viewport.removeEventListener('pointermove', handleInteraction, passiveOpts);
			viewport.removeEventListener('pointerdown', handleInteraction, passiveOpts);
			viewport.removeEventListener('wheel', handleInteraction, passiveOpts);
			viewport.removeEventListener('touchstart', handleInteraction, passiveOpts);
			viewport.removeEventListener('touchmove', handleInteraction, passiveOpts);
			// viewport.removeEventListener('scroll', handleInteraction, passiveOpts);
			viewport.removeEventListener('focusin', handleInteraction);
			viewport.removeEventListener('keydown', handleInteraction);
		};
	}, [shouldAutoScroll, triggerPause]);

	const isAutoScrolling = shouldAutoScroll && !isInteractionPaused;

	return { rowsForRender, containerRef, getRowKey, getRowClassName, isAutoScrolling };
}

export default useLeaderboardAutoScroll;
