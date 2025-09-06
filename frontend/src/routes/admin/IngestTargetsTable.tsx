import { type Column, GenericTable } from '../../common/GenericTable.tsx';
import type { PBIngestTargetRecord } from '../../api/pbTypes.ts';
import { Center, Mono, Right } from './cells.tsx';
import { formatEpochMs, formatSecondsFromNow } from './admin-utils.ts';

type IngestCtx = Record<PropertyKey, never>;
type IngestRow = PBIngestTargetRecord;

const ingestColumns: Array<Column<IngestCtx, IngestRow>> = [
	{ key: 'type', header: 'Type', width: 80, cell: (r: IngestRow) => <span>{r.type}</span> },
	{ key: 'sourceId', header: 'Source ID', width: 200, cell: (r: IngestRow) => <Mono>{r.sourceId}</Mono> },
	{ key: 'event', header: 'Event', width: 140, cell: (r: IngestRow) => <Mono>{r.event ?? ''}</Mono> },
	{
		key: 'intervalMs',
		header: 'Interval (ms)',
		width: 80,
		headerAlign: 'right',
		cell: (r: IngestRow) => <Right>{r.intervalMs ?? ''}</Right>,
	},
	{
		key: 'nextDueAt',
		header: 'Next Due (s)',
		width: 80,
		headerAlign: 'right',
		cell: (r: IngestRow) => <Right>{formatSecondsFromNow(r.nextDueAt)}</Right>,
	},
	{ key: 'priority', header: 'Priority', width: 80, headerAlign: 'right', cell: (r: IngestRow) => <Right>{r.priority ?? ''}</Right> },
	{
		key: 'enabled',
		header: 'Enabled',
		width: 80,
		headerAlign: 'center',
		cell: (r: IngestRow) => <Center>{String(r.enabled ?? '')}</Center>,
	},
	{ key: 'lastFetchedAt', header: 'Last Fetched', width: 180, cell: (r: IngestRow) => <span>{formatEpochMs(r.lastFetchedAt)}</span> },
	{
		key: 'lastStatus',
		header: 'Last Status',
		minWidth: 240,
		cell: (r: IngestRow) => <span title={r.lastStatus ?? ''}>{r.lastStatus ?? ''}</span>,
	},
];

export function IngestTargetsTable({ data }: { data: IngestRow[] }) {
	return (
		<GenericTable
			columns={ingestColumns}
			data={data}
			context={{}}
			getRowKey={(row) => row.id}
			rowHeight={40}
			className='ingest-table'
		/>
	);
}
