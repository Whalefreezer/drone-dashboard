import { useCallback, useState } from 'react';
import { pb } from '../../api/pb.ts';
import type { PBDetectionRecord, PBEventPilotRecord, PBGamePointRecord, PBPilotChannelRecord } from '../../api/pbTypes.ts';
import { collectReferencedPilotIds, getUnusedEventPilotIds } from './pilotReferenceIndex.ts';

interface UseUnusedPilotsActionParams {
	eventPilots: PBEventPilotRecord[];
	detections: PBDetectionRecord[];
	gamePoints: PBGamePointRecord[];
	pilotChannels: PBPilotChannelRecord[];
}

export function useUnusedPilotsAction({
	eventPilots,
	detections,
	gamePoints,
	pilotChannels,
}: UseUnusedPilotsActionParams) {
	const [findingUnused, setFindingUnused] = useState(false);
	const [unusedPilots, setUnusedPilots] = useState<string[] | null>(null);
	const [unusedError, setUnusedError] = useState<string | null>(null);
	const [deletingUnused, setDeletingUnused] = useState(false);

	const handleFindUnusedPilots = useCallback(() => {
		setFindingUnused(true);
		setUnusedPilots(null);
		setUnusedError(null);

		try {
			const referencedPilotIds = collectReferencedPilotIds({ detections, gamePoints, pilotChannels });
			const unused = getUnusedEventPilotIds(referencedPilotIds, eventPilots);
			setUnusedPilots(unused);
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			setUnusedError(message);
		} finally {
			setFindingUnused(false);
		}
	}, [detections, gamePoints, pilotChannels, eventPilots]);

	const handleDeleteUnusedPilots = useCallback(async () => {
		if (!unusedPilots || unusedPilots.length === 0) return;

		if (!confirm(`This will remove ${unusedPilots.length} unused pilot(s) from event_pilots. Are you sure?`)) {
			return;
		}

		setDeletingUnused(true);
		setUnusedError(null);

		try {
			let deleted = 0;
			for (const pilotId of unusedPilots) {
				const eventPilotRecords = eventPilots.filter((eventPilot) => eventPilot.pilot === pilotId);

				for (const record of eventPilotRecords) {
					try {
						await pb.collection('event_pilots').delete(record.id);
						deleted++;
					} catch (error) {
						console.error(`Failed to delete event_pilot ${record.id}:`, error);
					}
				}
			}

			setUnusedPilots(null);
			alert(`Successfully removed ${deleted} event_pilot record(s).`);
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			setUnusedError(message);
		} finally {
			setDeletingUnused(false);
		}
	}, [unusedPilots, eventPilots]);

	return {
		findingUnused,
		unusedPilots,
		unusedError,
		deletingUnused,
		handleFindUnusedPilots,
		handleDeleteUnusedPilots,
	};
}
