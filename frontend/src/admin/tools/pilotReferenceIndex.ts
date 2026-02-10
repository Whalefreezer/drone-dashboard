import type { PBDetectionRecord, PBEventPilotRecord, PBGamePointRecord, PBPilotChannelRecord } from '../../api/pbTypes.ts';

interface PilotReferenceIndexParams {
	detections: PBDetectionRecord[];
	gamePoints: PBGamePointRecord[];
	pilotChannels: PBPilotChannelRecord[];
}

export function collectReferencedPilotIds({
	detections,
	gamePoints,
	pilotChannels,
}: PilotReferenceIndexParams): Set<string> {
	const pilotIds = new Set<string>();

	detections.forEach((detection) => {
		if (detection.pilot) pilotIds.add(detection.pilot);
	});
	gamePoints.forEach((point) => {
		if (point.pilot) pilotIds.add(point.pilot);
	});
	pilotChannels.forEach((pilotChannel) => {
		if (pilotChannel.pilot) pilotIds.add(pilotChannel.pilot);
	});

	return pilotIds;
}

export function getMissingEventPilotIds(
	referencedPilotIds: Set<string>,
	eventPilots: PBEventPilotRecord[],
): string[] {
	const existingPilotIds = new Set(eventPilots.map((eventPilot) => eventPilot.pilot));
	return Array.from(referencedPilotIds).filter((id) => !existingPilotIds.has(id));
}

export function getUnusedEventPilotIds(
	referencedPilotIds: Set<string>,
	eventPilots: PBEventPilotRecord[],
): string[] {
	return eventPilots
		.filter((eventPilot) => eventPilot.pilot && !referencedPilotIds.has(eventPilot.pilot))
		.map((eventPilot) => eventPilot.pilot);
}
