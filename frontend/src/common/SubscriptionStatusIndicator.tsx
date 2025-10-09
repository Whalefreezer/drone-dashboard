import { useMemo } from 'react';
import { useAtomValue } from 'jotai';
import { aggregatedSubscriptionStatusAtom, type CollectionStatusEntry } from '../state/subscriptionStatusAtoms.ts';

function joinCollections(entries: CollectionStatusEntry[], maxVisible = 3): string {
	if (entries.length === 0) return '';
	const names = entries.map((entry) => entry.collection);
	const visible = names.slice(0, maxVisible);
	const remaining = names.length - visible.length;
	const base = visible.join(', ');
	return remaining > 0 ? `${base} +${remaining}` : base;
}

export function SubscriptionStatusIndicator() {
	const aggregated = useAtomValue(aggregatedSubscriptionStatusAtom);

	const { message, collectionsClass, collectionsText } = useMemo(() => {
		const worst = aggregated.worst;
		if (!worst) {
			return { message: '', collectionsText: '', collectionsClass: '' };
		}

		if (worst.payload.status === 'ready' || worst.payload.status === 'idle') {
			return { message: '', collectionsText: '', collectionsClass: '' };
		}

		let statusMessage = '';
		switch (worst.payload.status) {
			case 'initializing':
				statusMessage = 'Loading data…';
				break;
			case 'reconnecting':
				statusMessage = 'Realtime connection lost. Attempting to reconnect…';
				break;
			case 'backfilling':
				statusMessage = 'Replaying missed updates after reconnect…';
				break;
			case 'error':
				statusMessage = 'Realtime error. Some data may be stale.';
				break;
			default:
				statusMessage = '';
				break;
		}

		if (!statusMessage) {
			return { message: '', collectionsText: '', collectionsClass: '' };
		}

		const affected = aggregated.statuses.filter((entry) => entry.payload.status === worst.payload.status);
		const details = joinCollections(affected);
		return {
			message: statusMessage,
			collectionsClass: `subscription-status-indicator ${worst.payload.status}`,
			collectionsText: details,
		};
	}, [aggregated]);

	if (!message) return null;

	return (
		<div className={collectionsClass}>
			<span>{message}</span>
			{collectionsText && <span className='subscription-status-indicator__collections'>{collectionsText}</span>}
		</div>
	);
}

export default SubscriptionStatusIndicator;
