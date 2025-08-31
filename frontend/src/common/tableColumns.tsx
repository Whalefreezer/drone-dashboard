import React from 'react';

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
    return (
        <table className={className}>
            {/* Use colgroup so fixed widths are respected and only unspecified columns can flex */}
            <colgroup>
                {columns.map((col) => {
                    const colStyle: React.CSSProperties = {};
                    if (col.width !== undefined) {
                        colStyle.width = typeof col.width === 'number' ? `${col.width}px` : col.width;
                    }
                    if (col.minWidth !== undefined) {
                        colStyle.minWidth = typeof col.minWidth === 'number' ? `${col.minWidth}px` : col.minWidth;
                    }
                    return <col key={col.key} style={colStyle} />;
                })}
            </colgroup>
            <thead>
                <tr>
                    {columns.map((col) => {
                        const thStyle: React.CSSProperties = {};
                        if (col.headerAlign) thStyle.textAlign = col.headerAlign;

                        return (
                            <th key={col.key} className={col.headerClassName} style={thStyle}>
                                {typeof col.header === 'function' ? col.header(context) : col.header}
                            </th>
                        );
                    })}
                </tr>
            </thead>
            <tbody>
                {data.map((row, index) => (
                    <tr key={getRowKey(row, index)} className={getRowClassName?.(row, index)}>
                        {columns.map((col) => {
                            const Cell = col.cell as React.ComponentType<RowCtx>;
                            return (
                                <React.Fragment key={col.key}>
                                    {React.createElement(Cell, row)}
                                </React.Fragment>
                            );
                        })}
                    </tr>
                ))}
            </tbody>
        </table>
    );
}
