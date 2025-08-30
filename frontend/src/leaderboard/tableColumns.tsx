import React from 'react';

// Generic Column type for table configuration
export type Column<TableCtx, RowCtx> = {
    key: string;
    header: string | ((ctx: TableCtx) => React.ReactNode);
    cell: React.FC<RowCtx>;
};

// Minimal, reusable generic table driven by columns + data
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
                    {columns.map((col) => (
                        <th key={col.key}>
                            {typeof col.header === 'function' ? col.header(context) : col.header}
                        </th>
                    ))}
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
