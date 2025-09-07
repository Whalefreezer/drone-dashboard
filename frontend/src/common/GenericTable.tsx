import React, { useMemo } from 'react';
import { animated, SpringValue, useTransition } from '@react-spring/web';

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
	rowHeight?: number; // px; default 40
	visibleColumns?: string[]; // optional list of column keys to render
	scrollX?: boolean; // opt-in horizontal scroll container
}

export function GenericTable<TableCtx, RowCtx extends object>(
	{
		columns,
		data,
		context,
		getRowKey,
		getRowClassName,
		className,
		rowHeight = 40,
		visibleColumns,
		scrollX = false,
	}: GenericTableProps<TableCtx, RowCtx>,
) {
	const effectiveColumns = useMemo(() => {
		if (!visibleColumns || visibleColumns.length === 0) return columns;
		const vis = new Set(visibleColumns);
		return columns.filter((c) => vis.has(c.key));
	}, [columns, visibleColumns]);

	const gridTemplateColumns = useMemo(() => {
		const flexIndex = effectiveColumns.findIndex((c) => c.width === undefined);
		const toSize = (val: number | string | undefined): string | undefined => {
			if (val === undefined) return undefined;
			return typeof val === 'number' ? `${val}px` : val;
		};
		return effectiveColumns.map((col, idx) => {
			if (idx === flexIndex) {
				const minW = toSize(col.minWidth);
				return minW ? `minmax(${minW}, 1fr)` : '1fr';
			}
			const w = toSize(col.width);
			if (w) return w;
			const minW = toSize(col.minWidth);
			return minW ? `minmax(${minW}, ${minW})` : 'max-content';
		}).join(' ');
	}, [effectiveColumns]);

	const totalHeight = data.length * rowHeight;

	// Build keyed items for stable transitions
	const items = useMemo(() => data.map((row, i) => ({ row, key: getRowKey(row, i) })), [data, getRowKey]);
	const indexByKey = useMemo(() => {
		const m = new Map<string, number>();
		data.forEach((row, i) => m.set(getRowKey(row, i), i));
		return m;
	}, [data, getRowKey]);

	const transitions = useTransition<typeof items[number], { y: SpringValue<number> }>(items, {
		keys: (item) => item.key,
		from: (item) => ({ y: (indexByKey.get(item.key) ?? 0) * rowHeight }),
		enter: (item) => ({ y: (indexByKey.get(item.key) ?? 0) * rowHeight }),
		update: (item) => ({ y: (indexByKey.get(item.key) ?? 0) * rowHeight }),
		config: { tension: 300, friction: 30 },
	});

	return (
		<div className={[className, 'gt'].filter(Boolean).join(' ')} role='grid'>
			<div className={scrollX ? 'gt-scroll' : undefined} style={scrollX ? { overflowX: 'auto' } : undefined}>
				<div className='gt-header' role='row' style={{ display: 'grid', gridTemplateColumns }}>
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
				<div className='gt-body' style={{ position: 'relative', height: `${totalHeight}px` }}>
					{transitions((style, item) => {
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
								className={rowClass}
								role='row'
								style={{
									transform: style.y.to((y) => `translateY(${y}px)`),
									height: `${rowHeight}px`,
									display: 'grid',
									gridTemplateColumns,
									position: 'absolute',
									left: 0,
									right: 0,
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
							</animated.div>
						);
					})}
				</div>
			</div>
		</div>
	);
}
