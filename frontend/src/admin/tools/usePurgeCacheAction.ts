import { useCallback, useState } from 'react';
import { pb } from '../../api/pb.ts';

export type PurgeSummary = {
	events: number;
	rounds: number;
	pilots: number;
	channels: number;
	tracks: number;
	races: number;
	pilotChannels: number;
	detections: number;
	laps: number;
	gamePoints: number;
	results: number;
	ingestTargets: number;
	currentOrders: number;
	controlStats: number;
};

export function usePurgeCacheAction() {
	const [purging, setPurging] = useState(false);
	const [purgeResult, setPurgeResult] = useState<PurgeSummary | null>(null);
	const [purgeError, setPurgeError] = useState<string | null>(null);

	const handlePurge = useCallback(async () => {
		if (!confirm('This will permanently delete all FPVTrackside cache data. Are you sure?')) {
			return;
		}

		setPurging(true);
		setPurgeResult(null);
		setPurgeError(null);

		try {
			const response = await pb.send('/ingest/purge', {
				method: 'POST',
			});

			setPurgeResult(response as PurgeSummary);
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			setPurgeError(message);
		} finally {
			setPurging(false);
		}
	}, []);

	return {
		purging,
		purgeResult,
		purgeError,
		handlePurge,
	};
}
