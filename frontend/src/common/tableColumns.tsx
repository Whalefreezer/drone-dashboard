import React from 'react';

export type Column<TableCtx, RowCtx> = {
    key: string;
    header: string | ((ctx: TableCtx) => React.ReactNode);
    cell: React.FC<RowCtx>;
    headerClassName?: string;
    headerAlign?: 'left' | 'center' | 'right';
    width?: number | string; // e.g., 120 or '12rem' or '20%'
    minWidth?: number | string; // e.g., 160 or '10rem'
};

export interface GenericTableProps<TableCtx, RowCtx> {
    columns: Array<Column<TableCtx, RowCtx>>;
    data: RowCtx[];
    context: TableCtx;
    getRowKey: (row: RowCtx, index: number) => string;
    getRowClassName?: (row: RowCtx, index: number) => string | undefined;
    className?: string;
}

export function GenericTable<TableCtx, RowCtx>(
    { columns, data, context, getRowKey, getRowClassName, className }: GenericTableProps<
        TableCtx,
        RowCtx
    >,
) {
    return (
        <table className={className}>
            <thead>
                <tr>
                    {columns.map((col) => {
                        const thStyle: React.CSSProperties = {};
                        if (col.headerAlign) thStyle.textAlign = col.headerAlign;
                        if (col.width !== undefined) {
                            thStyle.width = typeof col.width === 'number'
                                ? `${col.width}px`
                                : col.width;
                        }
                        if (col.minWidth !== undefined) {
                            thStyle.minWidth = typeof col.minWidth === 'number'
                                ? `${col.minWidth}px`
                                : col.minWidth;
                        }
                        return (
                            <th key={col.key} className={col.headerClassName} style={thStyle}>
                                {typeof col.header === 'function'
                                    ? col.header(context)
                                    : col.header}
                            </th>
                        );
                    })}
                </tr>
            </thead>
            <tbody>
                {data.map((row, index) => (
                    <tr key={getRowKey(row, index)} className={getRowClassName?.(row, index)}>
                        {columns.map((col) => {
                            const Cell = col.cell;
                            return (
                                <React.Fragment key={col.key}>
                                    <Cell {...row} />
                                </React.Fragment>
                            );
                        })}
                    </tr>
                ))}
            </tbody>
        </table>
    );
}
