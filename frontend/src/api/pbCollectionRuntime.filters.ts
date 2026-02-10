import type { SubscribeOptions } from './pbRealtimeTypes.ts';
import type { AnyRecord, CollectionListener } from './pbCollectionRuntime.state.ts';

export function buildFilterMap(
	listeners: Iterable<CollectionListener<AnyRecord>>,
): Map<string, SubscribeOptions<AnyRecord>> {
	const asArray = Array.from(listeners);
	const filters = asArray.length > 0
		? asArray.reduce<Map<string, SubscribeOptions<AnyRecord>>>((acc, listener) => {
			const key = listener.options.filter?.trim() ?? '';
			if (!acc.has(key)) {
				acc.set(key, listener.options as SubscribeOptions<AnyRecord>);
			}
			return acc;
		}, new Map())
		: new Map<string, SubscribeOptions<AnyRecord>>();

	if (filters.size === 0) {
		filters.set('', {});
	}

	return filters;
}

export function combineFilters(a: string, b: string): string {
	const parts = [a?.trim(), b?.trim()].filter((part) => part && part.length > 0) as string[];
	if (parts.length === 0) return '';
	if (parts.length === 1) return parts[0]!;
	return `(${parts.join(') && (')})`;
}

export function cursorFilter(since: string): string {
	const escaped = since.replace(/"/g, '\\"');
	return `lastUpdated >= "${escaped}"`;
}
