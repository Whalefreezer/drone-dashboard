import { useCallback, useState } from 'react';
import { pb } from '../../api/pb.ts';
import type { PBDetectionRecord, PBEventPilotRecord, PBEventRecord, PBGamePointRecord, PBPilotChannelRecord } from '../../api/pbTypes.ts';
import { collectReferencedPilotIds, getMissingEventPilotIds } from './pilotReferenceIndex.ts';

interface UseSyncEventPilotsActionParams {
	currentEvent: PBEventRecord | null;
	eventPilots: PBEventPilotRecord[];
	detections: PBDetectionRecord[];
	gamePoints: PBGamePointRecord[];
	pilotChannels: PBPilotChannelRecord[];
}

export function useSyncEventPilotsAction({
	currentEvent,
	eventPilots,
	detections,
	gamePoints,
	pilotChannels,
}: UseSyncEventPilotsActionParams) {
	const [syncing, setSyncing] = useState(false);
	const [syncResult, setSyncResult] = useState<{ added: number; pilotIds: string[] } | null>(null);
	const [syncError, setSyncError] = useState<string | null>(null);
	const [syncPreview, setSyncPreview] = useState<{ pilotIds: string[] } | null>(null);

	const handlePreviewSync = useCallback(() => {
		if (!currentEvent) {
			setSyncError('No current event selected');
			return;
		}

		setSyncError(null);
		setSyncResult(null);

		try {
			const referencedPilotIds = collectReferencedPilotIds({ detections, gamePoints, pilotChannels });
			const missingPilotIds = getMissingEventPilotIds(referencedPilotIds, eventPilots);
			setSyncPreview({ pilotIds: missingPilotIds });
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			setSyncError(message);
		}
	}, [currentEvent, detections, gamePoints, pilotChannels, eventPilots]);

	const handleSyncPilots = useCallback(async () => {
		if (!currentEvent) {
			setSyncError('No current event selected');
			return;
		}

		if (!confirm('This will add any missing pilots from client-side data to event_pilots. Continue?')) {
			return;
		}

		setSyncing(true);
		setSyncResult(null);
		setSyncError(null);
		setSyncPreview(null);

		try {
			const referencedPilotIds = collectReferencedPilotIds({ detections, gamePoints, pilotChannels });
			const missingPilotIds = getMissingEventPilotIds(referencedPilotIds, eventPilots);

			let added = 0;
			for (const pilotId of missingPilotIds) {
				try {
					await pb.collection('event_pilots').create({
						event: currentEvent.id,
						pilot: pilotId,
						removed: false,
					});
					added++;
				} catch (error) {
					console.error(`Failed to add pilot ${pilotId}:`, error);
				}
			}

			setSyncResult({
				added,
				pilotIds: missingPilotIds,
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			setSyncError(message);
		} finally {
			setSyncing(false);
		}
	}, [currentEvent, detections, gamePoints, pilotChannels, eventPilots]);

	return {
		syncing,
		syncResult,
		syncError,
		syncPreview,
		handlePreviewSync,
		handleSyncPilots,
	};
}
