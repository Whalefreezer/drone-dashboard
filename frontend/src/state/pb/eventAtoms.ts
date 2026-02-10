import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import { pbSubscribeCollection } from '../../api/pb.ts';
import type { PBEventRecord } from '../../api/pbTypes.ts';

// Live events collection; we filter locally for the current event
export const eventsAtom = pbSubscribeCollection<PBEventRecord>('events');

export const pbCurrentEventAtom = atom((get) => {
	const events = get(eventsAtom);
	const currentEvent = events.find((event) => event.isCurrent);
	return currentEvent || null;
});

const EVENT_SELECTION_STORAGE_KEY = 'selected-event-id';
export const EVENT_SELECTION_CURRENT = 'current';

export const selectedEventIdAtom = atomWithStorage<string>(
	EVENT_SELECTION_STORAGE_KEY,
	EVENT_SELECTION_CURRENT,
);

export const currentEventAtom = atom((get) => {
	const selection = get(selectedEventIdAtom);
	if (selection === EVENT_SELECTION_CURRENT) return get(pbCurrentEventAtom);
	const events = get(eventsAtom);
	const match = events.find((event) => event.id === selection);
	if (match) return match;
	return get(pbCurrentEventAtom);
});

export const consecutiveLapsAtom = atom((get) => {
	const event = get(currentEventAtom);
	return Number(event?.laps ?? 3);
});
