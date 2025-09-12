import { type Column, GenericTable } from '../common/GenericTable.tsx';
import type { PBClientKVRecord } from '../api/pbTypes.ts';
import { Mono, Right } from './cells.tsx';
import { OverflowFadeCell } from '../common/OverflowFadeCell.tsx';
import { formatSecondsFromNow } from './admin-utils.ts';

type KVRow = PBClientKVRecord;
type KVCtx = Record<PropertyKey, never>;

function formatValuePreview(v?: string) {
	if (!v) return '';
	try {
		const parsed = JSON.parse(v);
		const asStr = JSON.stringify(parsed);
		return asStr;
	} catch {
		return v;
	}
}

const kvColumns: Array<Column<KVCtx, KVRow>> = [
	{ key: 'namespace', header: 'Namespace', width: 120, cell: ({ item }) => <span>{item.namespace}</span> },
	{ key: 'key', header: 'Key', width: 180, cell: ({ item }) => <Mono>{item.key}</Mono> },
	{ key: 'event', header: 'Event', width: 140, cell: ({ item }) => <Mono>{item.event ?? ''}</Mono> },
	{
		key: 'expiresIn',
		header: 'Expires (s)',
		width: 90,
		headerAlign: 'right',
		cell: ({ item }) => <Right>{formatSecondsFromNow(item.expiresAt)}</Right>,
	},
	{
		key: 'value',
		header: 'Value',
		minWidth: 100,
		cell: ({ item }) => {
			const preview = formatValuePreview(item.value);
			return (
				<OverflowFadeCell title={item.value ?? ''}>
					<span style={{ whiteSpace: 'nowrap' }}>{preview}</span>
				</OverflowFadeCell>
			);
		},
	},
];

export function ClientKVTable({ data }: { data: KVRow[] }) {
	return (
		<GenericTable
			columns={kvColumns}
			data={data}
			context={{}}
			getRowKey={(r) => r.id}
			rowHeight={36}
			className='kv-table'
		/>
	);
}
