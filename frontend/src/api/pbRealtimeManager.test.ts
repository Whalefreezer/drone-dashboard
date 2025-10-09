import { assert, assertEquals } from '@std/assert';
import { type CollectionSubscriptionSnapshot, PBCollectionSubscriptionManager } from './pbRealtimeManager.ts';
import type PocketBase from 'pocketbase';
import type { RecordSubscription } from 'pocketbase';
import type { PBBaseRecord } from './pbTypes.ts';

interface MockRecord extends PBBaseRecord {
	name: string;
	lastUpdated?: string;
	event?: string;
}

function deferred<T>() {
	let resolve: (value: T | PromiseLike<T>) => void;
	let reject: (reason?: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve: resolve!, reject: reject! };
}

class MockCollection<TRecord extends MockRecord> {
	private readonly subscribers = new Set<(event: RecordSubscription<TRecord>) => void>();
	private fullListHandler?: (filter?: string) => Promise<TRecord[]>;
	lastRequestedFilter?: string;

	constructor(
		private readonly name: string,
		private readonly owner: MockPocketBase,
		private records: TRecord[] = [],
	) {}

	setRecords(records: TRecord[]) {
		this.records = records.map((record) => ({ ...record }));
	}

	setFullListHandler(handler: (filter?: string) => Promise<TRecord[]>) {
		this.fullListHandler = handler;
	}

	subscribe(_topic: string, callback: (event: RecordSubscription<TRecord>) => void): Promise<() => void> {
		this.subscribers.add(callback);
		// Simulate initial connect event
		callback({ action: 'PB_CONNECT', record: { id: 'pb-connect' } as TRecord } as RecordSubscription<TRecord>);
		return Promise.resolve(() => {
			this.subscribers.delete(callback);
		});
	}

	getFullList(_batch: number, params?: { filter?: string }): Promise<TRecord[]> {
		this.lastRequestedFilter = params?.filter;
		if (this.fullListHandler) {
			return this.fullListHandler(params?.filter);
		}
		return Promise.resolve(this.applyFilter(params?.filter));
	}

	emit(action: string, record: Partial<TRecord> & { id: string }) {
		const payload: RecordSubscription<TRecord> = { action, record: { ...record } as TRecord };
		for (const subscriber of this.subscribers) {
			subscriber(payload);
		}
	}

	private applyFilter(filter?: string): TRecord[] {
		const filtered = !filter || filter.trim().length === 0
			? this.records
			: this.records.filter((record) => this.matchesFilter(record, filter));
		return filtered.map((record) => ({ ...record }));
	}

	private matchesFilter(record: TRecord, rawFilter: string): boolean {
		const clauses = rawFilter
			.split('&&')
			.map((clause) => clause.replace(/[()]/g, '').trim())
			.filter((clause) => clause.length > 0);

		for (const clause of clauses) {
			if (clause.startsWith('lastUpdated')) {
				const match = clause.match(/lastUpdated\s*>=\s*"([^"]+)"/);
				if (!match) continue;
				const cursor = match[1];
				const stamp = record.lastUpdated ?? '';
				if (!stamp || stamp < cursor) {
					return false;
				}
			} else {
				const equality = clause.match(/^([\w]+)\s*=\s*"([^"]+)"/);
				if (equality) {
					const [, field, value] = equality;
					if ((record as Record<string, unknown>)[field] !== value) {
						return false;
					}
				}
			}
		}

		return true;
	}
}

class MockPocketBase {
	public readonly realtime: {
		onDisconnect?: (activeSubscriptions: unknown[]) => void;
	} = {};

	private readonly collections = new Map<string, MockCollection<MockRecord>>();

	collection(name: string): MockCollection<MockRecord> {
		if (!this.collections.has(name)) {
			this.collections.set(name, new MockCollection<MockRecord>(name, this));
		}
		return this.collections.get(name)!;
	}

	triggerDisconnect() {
		this.realtime.onDisconnect?.([]);
	}
}

Deno.test('subscription manager buffers realtime events during initial fetch', async () => {
	const mock = new MockPocketBase();
	const manager = new PBCollectionSubscriptionManager(mock as unknown as PocketBase);

	const collection = mock.collection('events');
	const initialRecords: MockRecord[] = [
		{ id: 'alpha', name: 'Alpha', lastUpdated: '2025-10-09T01:00:00Z' },
	];
	collection.setRecords(initialRecords);

	const slowFetch = deferred<MockRecord[]>();
	collection.setFullListHandler(() => slowFetch.promise);

	let latestSnapshot: CollectionSubscriptionSnapshot<MockRecord> | null = null;
	const { initialSnapshotPromise } = manager.subscribe<MockRecord>(
		'events',
		{},
		(snapshot) => {
			latestSnapshot = snapshot;
		},
	);

	// Allow subscription setup to start before emitting events.
	await Promise.resolve();

	collection.emit('create', { id: 'beta', name: 'Buffered', lastUpdated: '2025-10-09T01:01:00Z' });

	slowFetch.resolve(initialRecords);

	const snapshot = await initialSnapshotPromise;
	assertEquals(snapshot.records.length, 2);
	assertEquals(snapshot.records.find((record) => record.id === 'beta')?.name, 'Buffered');

	// Ensure the debounced listener eventually flushed the same snapshot.
	await Promise.resolve();
	if (!latestSnapshot) {
		throw new Error('Expected latest snapshot to be present');
	}
	const finalSnapshot: CollectionSubscriptionSnapshot<MockRecord> = latestSnapshot;
	assertEquals(finalSnapshot.records.length, 2);
});

Deno.test('subscription manager backfills after reconnect using lastUpdated cursor', async () => {
	const mock = new MockPocketBase();
	const manager = new PBCollectionSubscriptionManager(mock as unknown as PocketBase);

	const collection = mock.collection('laps');
	const initialRecords: MockRecord[] = [
		{ id: 'lap-1', name: 'Lap 1', lastUpdated: '2025-10-09T01:00:00Z' },
	];
	collection.setRecords(initialRecords);

	const firstSnapshot = await manager.subscribe<MockRecord>('laps', {}, () => {}).initialSnapshotPromise;
	assertEquals(firstSnapshot.records.length, 1);

	let receivedFilter: string | undefined;
	collection.setFullListHandler((filter?: string) => {
		receivedFilter = filter;
		const nextRecords: MockRecord[] = [
			...initialRecords,
			{ id: 'lap-2', name: 'Lap 2', lastUpdated: '2025-10-09T01:05:00Z' },
		];
		collection.setRecords(nextRecords);
		return Promise.resolve(nextRecords);
	});

	mock.triggerDisconnect();

	collection.emit('PB_CONNECT', { id: 'pb-reconnect' } as MockRecord);

	// Wait for the backfill to finish (manager uses async operations).
	for (let i = 0; i < 10 && !receivedFilter; i++) {
		await Promise.resolve();
	}

	const cached = manager.getCachedSnapshot('laps', {}) as CollectionSubscriptionSnapshot<MockRecord> | undefined;
	assert(cached);
	assertEquals(cached?.records.length, 2);
	assert(receivedFilter);
	assert(receivedFilter?.includes('lastUpdated >= "2025-10-09T01:00:00Z"'));
});
