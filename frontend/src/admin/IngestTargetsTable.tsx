import { type Column, GenericTable } from '../common/GenericTable.tsx';
import type { PBIngestTargetRecord } from '../api/pbTypes.ts';
import { Center, Mono, Right } from './cells.tsx';
import { formatEpochMs, formatSecondsFromNow } from './admin-utils.ts';

type IngestCtx = Record<PropertyKey, never>;
type IngestRow = PBIngestTargetRecord;

const ingestColumns: Array<Column<IngestCtx, IngestRow>> = [
	{ key: 'type', header: 'Type', width: 80, cell: ({ item }) => <span>{item.type}</span> },
	{ key: 'sourceId', header: 'Source ID', width: 200, cell: ({ item }) => <Mono>{item.sourceId}</Mono> },
	{ key: 'event', header: 'Event', width: 140, cell: ({ item }) => <Mono>{item.event ?? ''}</Mono> },
	{
		key: 'intervalMs',
		header: 'Interval (ms)',
		width: 80,
		headerAlign: 'right',
		cell: ({ item }) => <Right>{item.intervalMs ?? ''}</Right>,
	},
	{
		key: 'nextDueAt',
		header: 'Next Due (s)',
		width: 80,
		headerAlign: 'right',
		cell: ({ item }) => <Right>{formatSecondsFromNow(item.nextDueAt)}</Right>,
	},
	{ key: 'priority', header: 'Priority', width: 80, headerAlign: 'right', cell: ({ item }) => <Right>{item.priority ?? ''}</Right> },
	{
		key: 'enabled',
		header: 'Enabled',
		width: 80,
		headerAlign: 'center',
		cell: ({ item }) => <Center>{String(item.enabled ?? '')}</Center>,
	},
	{ key: 'lastFetchedAt', header: 'Last Fetched', width: 180, cell: ({ item }) => <span>{formatEpochMs(item.lastFetchedAt)}</span> },
	{
		key: 'lastStatus',
		header: 'Last Status',
		minWidth: 240,
		cell: ({ item }) => <span title={item.lastStatus ?? ''}>{item.lastStatus ?? ''}</span>,
	},
];

export function IngestTargetsTable({ data }: { data: IngestRow[] }) {
	return (
		<GenericTable
			columns={ingestColumns}
			data={data}
			context={{}}
			getRowKey={(row) => row.id}
			estimatedRowHeight={40}
			rowMode='fixed'
			className='ingest-table'
		/>
	);
}
