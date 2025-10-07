import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { animated, SpringValue, useSpring, useTransition } from '@react-spring/web';

export type Column<TableCtx, RowCtx> = {
	key: string;
	header: string | ((ctx: TableCtx) => React.ReactNode);
	// Optional human-friendly name for selectors/menus
	label?: string;
	// Optional grouping key for selectors (e.g., all L1..Ln under 'laps')
	group?: string;
	groupLabel?: string;
	cell: React.ComponentType<{ item: RowCtx }>;
	headerClassName?: string;
	headerAlign?: 'left' | 'center' | 'right';
	width?: number | string; // e.g., 120 or '12rem' or '20%'
	minWidth?: number | string; // e.g., 160 or '10rem'
};

export interface GenericTableProps<TableCtx, RowCtx extends object> {
	columns: Array<Column<TableCtx, RowCtx>>;
	data: RowCtx[];
	context: TableCtx;
	getRowKey: (row: RowCtx, index: number) => string;
	getRowClassName?: (row: RowCtx, index: number) => string | undefined;
	className?: string;
	estimatedRowHeight?: number; // px; default 40
	rowMode?: 'dynamic' | 'fixed';
	visibleColumns?: string[]; // optional list of column keys to render
	scrollX?: boolean; // opt-in horizontal scroll container
	virtualization?: GenericTableVirtualizationConfig;
}

type RowItem<RowCtx> = { row: RowCtx; key: string };
type TransitionValues = { y: SpringValue<number>; height: SpringValue<number> };

type ResizeObserverMap = Map<string, ResizeObserver>;
const SCROLLABLE_OVERFLOW = /(auto|scroll|overlay)/;

export interface GenericTableVirtualizationConfig {
	enabled?: boolean;
	overscanPx?: number;
	overscanRows?: number;
	getScrollElement?: () => HTMLElement | null;
}

type VirtualizationMetrics = {
	totalItems: number;
	totalHeight: number;
	estimatedRowHeight: number;
	overscanPx?: number;
	overscanRows?: number;
};

type UseRowMeasurementsArgs<RowCtx extends object> = {
	data: RowCtx[];
	getRowKey: (row: RowCtx, index: number) => string;
	itemKeys: string[];
	estimatedRowHeight: number;
	isDynamic: boolean;
};

type RowMeasurements = {
	registerRow: (key: string) => (node: HTMLDivElement | null) => void;
	offsetsByKey: Map<string, number>;
	totalHeight: number;
	resolveHeight: (key: string) => number;
};

function isScrollableElement(element: HTMLElement | null): boolean {
	if (!element || typeof window === 'undefined') return false;
	const computed = globalThis.getComputedStyle(element);
	if (!computed) return false;
	const overflowY = computed.overflowY || computed.overflow;
	return !!overflowY && SCROLLABLE_OVERFLOW.test(overflowY);
}

function findScrollableAncestor(start: HTMLElement | null): HTMLElement | null {
	if (!start || typeof window === 'undefined') return null;
	let current: HTMLElement | null = start;
	while (current) {
		if (isScrollableElement(current)) return current;
		current = current.parentElement;
	}
	return null;
}

// Exported for regression tests.
export function findStartIndex(offsets: number[], heights: number[], target: number): number {
	if (offsets.length === 0) return 0;
	let low = 0;
	let high = offsets.length - 1;
	let result = offsets.length - 1;

	while (low <= high) {
		const mid = (low + high) >> 1;
		const rowBottom = offsets[mid] + heights[mid];
		if (rowBottom >= target) {
			result = mid;
			high = mid - 1;
		} else {
			low = mid + 1;
		}
	}

	return Math.max(0, Math.min(result, offsets.length - 1));
}

// Exported for regression tests.
export function findEndIndex(offsets: number[], target: number): number {
	if (offsets.length === 0) return 0;
	let low = 0;
	let high = offsets.length - 1;

	while (low <= high) {
		const mid = (low + high) >> 1;
		if (offsets[mid] <= target) {
			low = mid + 1;
		} else {
			high = mid - 1;
		}
	}

	return Math.max(0, Math.min(low, offsets.length));
}

function useEffectiveColumns<TableCtx, RowCtx extends object>(
	columns: Array<Column<TableCtx, RowCtx>>,
	visibleColumns: string[] | undefined,
) {
	return useMemo(() => {
		if (!visibleColumns || visibleColumns.length === 0) return columns;
		const vis = new Set(visibleColumns);
		return columns.filter((col) => vis.has(col.key));
	}, [columns, visibleColumns]);
}

function useGridTemplateColumns<TableCtx, RowCtx extends object>(columns: Array<Column<TableCtx, RowCtx>>) {
	return useMemo(() => {
		const flexIndex = columns.findIndex((col) => col.width === undefined);
		const toSize = (val: number | string | undefined): string | undefined => {
			if (val === undefined) return undefined;
			return typeof val === 'number' ? `${val}px` : val;
		};
		return columns.map((col, idx) => {
			if (idx === flexIndex) {
				const minW = toSize(col.minWidth);
				return minW ? `minmax(${minW}, 1fr)` : '1fr';
			}
			const width = toSize(col.width);
			if (width) return width;
			const minW = toSize(col.minWidth);
			return minW ? `minmax(${minW}, ${minW})` : 'max-content';
		}).join(' ');
	}, [columns]);
}

function useRowData<RowCtx extends object>(
	data: RowCtx[],
	getRowKey: (row: RowCtx, index: number) => string,
) {
	return useMemo(() => {
		const items: Array<RowItem<RowCtx>> = [];
		const itemKeys: string[] = [];
		const indexByKey = new Map<string, number>();

		data.forEach((row, index) => {
			const key = getRowKey(row, index);
			items.push({ row, key });
			itemKeys.push(key);
			indexByKey.set(key, index);
		});

		return { items, itemKeys, indexByKey };
	}, [data, getRowKey]);
}

function useRowMeasurements<RowCtx extends object>(
	{ data, getRowKey, itemKeys, estimatedRowHeight, isDynamic }: UseRowMeasurementsArgs<RowCtx>,
): RowMeasurements {
	const [heightMap, setHeightMap] = useState<Map<string, number>>(() => new Map());
	const observersRef = useRef<ResizeObserverMap>(new Map());
	const measuredKeysRef = useRef<Set<string>>(new Set());
	const baseHeight = Math.max(1, Math.round(estimatedRowHeight));

	useEffect(() => () => {
		observersRef.current.forEach((observer) => observer.disconnect());
		observersRef.current.clear();
	}, []);

	useEffect(() => {
		setHeightMap((prev) => {
			if (!isDynamic) return prev.size === 0 ? prev : new Map();

			const keys = new Set(itemKeys);
			let changed = false;
			const next = new Map(prev);
			for (const key of prev.keys()) {
				if (!keys.has(key)) {
					next.delete(key);
					measuredKeysRef.current.delete(key);
					changed = true;
				}
			}
			return changed ? next : prev;
		});
	}, [isDynamic, itemKeys]);

	const registerRow = useCallback(
		(key: string) => (node: HTMLDivElement | null) => {
			const observers = observersRef.current;
			const existingObserver = observers.get(key);
			if (existingObserver) {
				existingObserver.disconnect();
				observers.delete(key);
			}

			if (!node || !isDynamic) return;

			const ensureHeight = (nextHeight: number, markMeasured = false) => {
				setHeightMap((prev) => {
					const currentHeight = prev.get(key);
					if (currentHeight !== undefined && Math.abs(currentHeight - nextHeight) < 0.5) return prev;
					const updated = new Map(prev);
					updated.set(key, nextHeight);
					return updated;
				});
				if (markMeasured) measuredKeysRef.current.add(key);
			};

			if (!measuredKeysRef.current.has(key)) {
				const initialHeight = Math.max(1, Math.round(node.getBoundingClientRect().height));
				if (initialHeight > 0) {
					// Defer state update to avoid infinite loop during ref attachment
					queueMicrotask(() => ensureHeight(initialHeight, true));
				}
			}

			if (typeof ResizeObserver === 'undefined') return;

			const observer = new ResizeObserver((entries) => {
				for (const entry of entries) {
					const nextHeight = Math.max(1, Math.round(entry.contentRect.height));
					ensureHeight(nextHeight);
				}
			});

			observer.observe(node);
			observers.set(key, observer);
		},
		[isDynamic],
	);

	const resolveHeight = useCallback(
		(key: string) => {
			if (!isDynamic) return baseHeight;
			return heightMap.get(key) ?? baseHeight;
		},
		[baseHeight, heightMap, isDynamic],
	);

	const { offsetsByKey, totalHeight } = useMemo(() => {
		let total = 0;
		const offsets = new Map<string, number>();
		data.forEach((row, index) => {
			const key = getRowKey(row, index);
			offsets.set(key, total);
			total += resolveHeight(key);
		});
		return { offsetsByKey: offsets, totalHeight: total };
	}, [data, getRowKey, resolveHeight]);

	return { registerRow, offsetsByKey, totalHeight, resolveHeight };
}

export function GenericTable<TableCtx, RowCtx extends object>(
	{
		columns,
		data,
		context,
		getRowKey,
		getRowClassName,
		className,
		estimatedRowHeight = 40,
		rowMode = 'dynamic',
		visibleColumns,
		scrollX = false,
		virtualization,
	}: GenericTableProps<TableCtx, RowCtx>,
) {
	const isDynamic = rowMode === 'dynamic';
	const virtualizationConfig = useMemo(() => virtualization ?? {}, [virtualization]);
	const virtualizationEnabled = virtualizationConfig.enabled ?? true;
	const rootRef = useRef<HTMLDivElement | null>(null);
	const scrollWrapperRef = useRef<HTMLDivElement | null>(null);
	const scrollElementRef = useRef<HTMLElement | null>(null);
	const pendingRafRef = useRef<number | null>(null);
	const layoutRef = useRef<{ offsets: number[]; heights: number[] }>({ offsets: [], heights: [] });
	const metricsRef = useRef<VirtualizationMetrics>({
		totalItems: data.length,
		totalHeight: 0,
		estimatedRowHeight,
		overscanPx: virtualizationConfig.overscanPx,
		overscanRows: virtualizationConfig.overscanRows,
	});
	const virtualizationEnabledRef = useRef(virtualizationEnabled);

	const effectiveColumns = useEffectiveColumns(columns, visibleColumns);
	const gridTemplateColumns = useGridTemplateColumns(effectiveColumns);
	const { items, itemKeys, indexByKey } = useRowData(data, getRowKey);
	const { registerRow, offsetsByKey, totalHeight, resolveHeight } = useRowMeasurements({
		data,
		getRowKey,
		itemKeys,
		estimatedRowHeight,
		isDynamic,
	});
	const layout = useMemo(() => {
		const offsets: number[] = [];
		const heights: number[] = [];
		items.forEach((item, index) => {
			offsets[index] = offsetsByKey.get(item.key) ?? 0;
			heights[index] = resolveHeight(item.key);
		});
		return { offsets, heights };
	}, [items, offsetsByKey, resolveHeight]);
	layoutRef.current = layout;
	metricsRef.current = {
		totalItems: items.length,
		totalHeight,
		estimatedRowHeight,
		overscanPx: virtualizationConfig.overscanPx,
		overscanRows: virtualizationConfig.overscanRows,
	};
	virtualizationEnabledRef.current = virtualizationEnabled;
	const approximateViewportPx = 600;
	const approxRowHeight = Math.max(1, estimatedRowHeight);
	const initialVisibleEnd = virtualizationEnabled
		? Math.min(items.length, Math.max(1, Math.ceil((approximateViewportPx * 2) / approxRowHeight)))
		: items.length;
	const [visibleRange, setVisibleRange] = useState<[number, number]>(() => [0, initialVisibleEnd]);
	const rangeRef = useRef<[number, number]>([0, initialVisibleEnd]);
	const setRangeIfChanged = useCallback((rawStart: number, rawEnd: number) => {
		const { totalItems } = metricsRef.current;
		if (totalItems === 0) {
			const [prevStart, prevEnd] = rangeRef.current;
			if (prevStart === 0 && prevEnd === 0) return;
			rangeRef.current = [0, 0];
			setVisibleRange([0, 0]);
			return;
		}

		const start = Math.max(0, Math.min(rawStart, totalItems - 1));
		const end = Math.max(start + 1, Math.min(rawEnd, totalItems));

		const [prevStart, prevEnd] = rangeRef.current;
		if (prevStart === start && prevEnd === end) return;
		rangeRef.current = [start, end];
		setVisibleRange([start, end]);
	}, []);
	const recalcVisibleRange = useCallback((container: HTMLElement) => {
		const { offsets, heights } = layoutRef.current;
		const {
			totalItems,
			totalHeight: totalMeasuredHeight,
			estimatedRowHeight: estimate,
			overscanPx,
			overscanRows,
		} = metricsRef.current;

		if (!virtualizationEnabledRef.current) {
			setRangeIfChanged(0, totalItems);
			return;
		}

		if (totalItems === 0) {
			setRangeIfChanged(0, 0);
			return;
		}

		const viewportHeight = container.clientHeight;
		const scrollTop = container.scrollTop;
		const fallbackOverscan = overscanPx ?? (viewportHeight > 0 ? viewportHeight : estimate * 6);
		const buffer = fallbackOverscan + (overscanRows ?? 0) * estimate;
		const maxScrollTop = Math.max(0, totalMeasuredHeight - viewportHeight);
		const clampedScrollTop = Math.max(0, Math.min(scrollTop, maxScrollTop));
		const startTarget = Math.max(0, clampedScrollTop - buffer);
		const endTarget = Math.min(totalMeasuredHeight, clampedScrollTop + viewportHeight + buffer);

		const startIndex = findStartIndex(offsets, heights, startTarget);
		const endIndex = findEndIndex(offsets, endTarget);

		setRangeIfChanged(startIndex, endIndex);
	}, [setRangeIfChanged]);
	const requestRecalc = useCallback(() => {
		const { totalItems } = metricsRef.current;
		if (!virtualizationEnabledRef.current) {
			setRangeIfChanged(0, totalItems);
			return;
		}

		const container = scrollElementRef.current;
		if (!container) {
			setRangeIfChanged(0, totalItems);
			return;
		}

		if (pendingRafRef.current !== null) return;
		pendingRafRef.current = requestAnimationFrame(() => {
			pendingRafRef.current = null;
			recalcVisibleRange(container);
		});
	}, [recalcVisibleRange, setRangeIfChanged]);
	useEffect(() => () => {
		if (pendingRafRef.current !== null) {
			cancelAnimationFrame(pendingRafRef.current);
			pendingRafRef.current = null;
		}
	}, []);
	const resolveScrollElement = useCallback((): HTMLElement | null => {
		const provided = virtualizationConfig.getScrollElement?.();
		if (provided) return provided;
		if (scrollWrapperRef.current && isScrollableElement(scrollWrapperRef.current)) {
			return scrollWrapperRef.current;
		}
		return findScrollableAncestor(rootRef.current);
	}, [virtualizationConfig]);
	useLayoutEffect(() => {
		if (!virtualizationEnabled) {
			scrollElementRef.current = null;
			requestRecalc();
			return;
		}

		const container = resolveScrollElement();
		scrollElementRef.current = container;

		if (!container) {
			requestRecalc();
			return;
		}

		const handleScroll = () => requestRecalc();
		handleScroll();

		container.addEventListener('scroll', handleScroll, { passive: true });
		let resizeObserver: ResizeObserver | null = null;
		if (typeof ResizeObserver !== 'undefined') {
			resizeObserver = new ResizeObserver(handleScroll);
			resizeObserver.observe(container);
		}

		return () => {
			container.removeEventListener('scroll', handleScroll);
			resizeObserver?.disconnect();
		};
	}, [virtualizationEnabled, resolveScrollElement, requestRecalc]);
	useEffect(() => {
		requestRecalc();
	}, [
		requestRecalc,
		layout,
		virtualizationEnabled,
		items.length,
		totalHeight,
		virtualizationConfig.overscanPx,
		virtualizationConfig.overscanRows,
		estimatedRowHeight,
	]);
	const [rangeStart, rangeEnd] = visibleRange;
	const visibleItems = useMemo(() => items.slice(rangeStart, rangeEnd), [items, rangeStart, rangeEnd]);

	const initialRenderRef = useRef(true);
	useEffect(() => {
		setTimeout(() => {
			initialRenderRef.current = false;
		}, 0);
	}, []);

	const bufferToPreventFlickeringOfScrollbar = 0;

	const bodySpring = useSpring({
		height: totalHeight + bufferToPreventFlickeringOfScrollbar,
		config: { tension: 300, friction: 30 },
		immediate: initialRenderRef.current,
	});

	const transitions = useTransition<RowItem<RowCtx>, TransitionValues>(visibleItems, {
		keys: (item) => item.key,
		from: (item) => {
			const key = item.key;
			const height = resolveHeight(key);
			return { y: offsetsByKey.get(key) ?? 0, height };
		},
		enter: (item) => {
			const key = item.key;
			const height = resolveHeight(key);
			return { y: offsetsByKey.get(key) ?? 0, height };
		},
		update: (item) => {
			const key = item.key;
			const height = resolveHeight(key);
			return { y: offsetsByKey.get(key) ?? 0, height };
		},
		initial: (item) => {
			const key = item.key;
			const height = resolveHeight(key);
			return { y: offsetsByKey.get(key) ?? 0, height };
		},
		immediate: initialRenderRef.current,
		config: { tension: 300, friction: 30 },
	});

	return (
		<div ref={rootRef} className={[className, 'gt'].filter(Boolean).join(' ')} role='grid'>
			<div
				ref={scrollWrapperRef}
				className={scrollX ? 'gt-scroll' : undefined}
				style={scrollX ? { overflowX: 'auto' } : undefined}
			>
				<div style={{ display: 'inline-block', minWidth: '100%' }}>
					<div className='gt-header' role='row' style={{ minWidth: '100%', gridTemplateColumns }}>
						{effectiveColumns.map((col) => {
							const style: React.CSSProperties = {};
							if (col.headerAlign) style.textAlign = col.headerAlign;
							return (
								<div key={col.key} role='columnheader' className={col.headerClassName} style={style} data-col={col.key}>
									{typeof col.header === 'function' ? col.header(context) : col.header}
								</div>
							);
						})}
					</div>
					<animated.div className='gt-body' style={{ ...bodySpring, position: 'relative' }}>
						{transitions((animatedStyle, item) => {
							const row = item.row as RowCtx;
							const idx = indexByKey.get(item.key) ?? 0;
							const rowClass = [
								'gt-row',
								idx % 2 === 0 ? 'row-odd' : 'row-even',
								getRowClassName?.(row, idx) ?? '',
							].filter(Boolean).join(' ');
							return (
								<animated.div
									key={item.key}
									className='gt-row-wrapper'
									style={{
										transform: animatedStyle.y.to((y) => `translateY(${y}px)`),
										height: animatedStyle.height.to((h) => `${h}px`),
										position: 'absolute',
										left: 0,
										right: 0,
										willChange: 'transform,height',
									}}
								>
									<div
										ref={registerRow(item.key)}
										className={rowClass}
										role='row'
										style={{
											display: 'inline-grid',
											minWidth: '100%',
											gridTemplateColumns,
										}}
									>
										{effectiveColumns.map((col) => {
											const Cell = col.cell as React.ComponentType<{ item: RowCtx }>;
											return (
												<div key={col.key} role='gridcell' className='gt-cell' data-col={col.key}>
													{React.createElement(Cell, { item: row })}
												</div>
											);
										})}
									</div>
								</animated.div>
							);
						})}
					</animated.div>
				</div>
			</div>
		</div>
	);
}
