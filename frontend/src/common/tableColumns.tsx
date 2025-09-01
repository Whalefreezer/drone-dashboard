import React, { useMemo } from 'react';

export type Column<TableCtx, RowCtx> = {
    key: string;
    header: string | ((ctx: TableCtx) => React.ReactNode);
    cell: React.ComponentType<RowCtx>;
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
}

export function GenericTable<TableCtx, RowCtx extends object>(
    { columns, data, context, getRowKey, getRowClassName, className }: GenericTableProps<
        TableCtx,
        RowCtx
    >,
) {
    const ROW_HEIGHT = 40; // px, fixed row height for absolute positioning

    const gridTemplateColumns = useMemo(() => {
        const flexIndex = columns.findIndex((c) => c.width === undefined);
        const toSize = (val: number | string | undefined): string | undefined => {
            if (val === undefined) return undefined;
            return typeof val === 'number' ? `${val}px` : val;
        };
        return columns.map((col, idx) => {
            if (idx === flexIndex) {
                const minW = toSize(col.minWidth);
                return minW ? `minmax(${minW}, 1fr)` : '1fr';
            }
            const w = toSize(col.width);
            if (w) return w;
            const minW = toSize(col.minWidth);
            return minW ? `minmax(${minW}, ${minW})` : 'max-content';
        }).join(' ');
    }, [columns]);

    const totalHeight = data.length * ROW_HEIGHT;

    return (
        <div className={[className, 'gt'].filter(Boolean).join(' ')} role="grid">
            <div className="gt-header" role="row" style={{ display: 'grid', gridTemplateColumns }}>
                {columns.map((col) => {
                    const style: React.CSSProperties = {};
                    if (col.headerAlign) style.textAlign = col.headerAlign;
                    return (
                        <div key={col.key} role="columnheader" className={col.headerClassName} style={style}>
                            {typeof col.header === 'function' ? col.header(context) : col.header}
                        </div>
                    );
                })}
            </div>
            <div className="gt-body" style={{ position: 'relative', height: `${totalHeight}px` }}>
                {data.map((row, index) => {
                    const key = getRowKey(row, index);
                    const y = index * ROW_HEIGHT;
                    const rowClass = [
                        'gt-row',
                        index % 2 === 0 ? 'row-odd' : 'row-even',
                        getRowClassName?.(row, index) ?? '',
                    ].filter(Boolean).join(' ');
                    const rowStyle: React.CSSProperties = {
                        transform: `translateY(${y}px)`,
                        height: `${ROW_HEIGHT}px`,
                        display: 'grid',
                        gridTemplateColumns,
                        position: 'absolute',
                        left: 0,
                        right: 0,
                    };
                    return (
                        <div key={key} className={rowClass} role="row" style={rowStyle}>
                            {columns.map((col) => {
                                const Cell = col.cell as React.ComponentType<RowCtx>;
                                return (
                                    <div key={col.key} role="gridcell" className="gt-cell">
                                        {React.createElement(Cell, row)}
                                    </div>
                                );
                            })}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
