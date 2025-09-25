import { atom } from 'jotai';
import { eagerAtom } from 'jotai-eager';
import { getEnvEventIdFallback, pbSubscribeCollection } from '../api/pb.ts';
import { PBTimelineEventRecord } from '../api/pbTypes.ts';
import { currentEventAtom } from './pbAtoms.ts';

const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 86_400_000;
const DEFAULT_EVENT_DURATION_MINUTES = 15;
const fallbackEventId = getEnvEventIdFallback();

export const timelineEventsAtom = pbSubscribeCollection<PBTimelineEventRecord>('timeline_events');

const sortedTimelineEventsAtom = eagerAtom((get) => {
	const events = get(timelineEventsAtom);
	return [...events].sort((a, b) => {
		const eventCompare = a.event.localeCompare(b.event);
		if (eventCompare !== 0) return eventCompare;

		const startA = safeTime(a.startAt);
		const startB = safeTime(b.startAt);
		const startAIsNaN = Number.isNaN(startA);
		const startBIsNaN = Number.isNaN(startB);
		if (startAIsNaN && !startBIsNaN) return 1;
		if (startBIsNaN && !startAIsNaN) return -1;
		if (!startAIsNaN && !startBIsNaN && startA !== startB) return startA - startB;

		const sortKeyA = a.sortKey ?? 0;
		const sortKeyB = b.sortKey ?? 0;
		if (sortKeyA !== sortKeyB) return sortKeyA - sortKeyB;

		return a.id.localeCompare(b.id);
	});
});

const targetEventIdAtom = eagerAtom((get) => {
	const currentEvent = get(currentEventAtom);
	return currentEvent?.id ?? fallbackEventId;
});

export const currentEventTimelineAtom = eagerAtom((get) => {
	const targetEventId = get(targetEventIdAtom);
	if (!targetEventId) return [] as PBTimelineEventRecord[];
	return get(sortedTimelineEventsAtom).filter((event) => event.event === targetEventId);
});

export interface TimelineEventWithMeta extends PBTimelineEventRecord {
	startDate: Date;
	endDate: Date;
	startMs: number;
	endMs: number;
	durationMinutes: number;
	dayKey: string;
}

export const timelineEventModelsAtom = eagerAtom((get) => {
	const events = get(currentEventTimelineAtom);
	const models: TimelineEventWithMeta[] = [];
	for (const event of events) {
		const normalized = normalizeTimelineEvent(event);
		if (normalized) models.push(normalized);
	}
	return models;
});

export interface TimelineDayGroup {
	dayKey: string;
	date: Date;
	events: TimelineEventWithMeta[];
}

export const groupedTimelineDaysAtom = eagerAtom((get) => {
	const events = get(timelineEventModelsAtom);
	if (events.length === 0) return [] as TimelineDayGroup[];

	const groups = new Map<string, TimelineDayGroup>();
	for (const event of events) {
		let group = groups.get(event.dayKey);
		if (!group) {
			group = {
				dayKey: event.dayKey,
				date: startOfDay(event.startDate),
				events: [],
			};
			groups.set(event.dayKey, group);
		}
		group.events.push(event);
	}

	return Array.from(groups.values()).sort((a, b) => a.date.getTime() - b.date.getTime());
});

export const timelineBoundsAtom = eagerAtom((get) => {
	const events = get(timelineEventModelsAtom);
	if (events.length === 0) return null as null | { min: number; max: number };
	let min = Number.POSITIVE_INFINITY;
	let max = Number.NEGATIVE_INFINITY;
	for (const event of events) {
		if (event.startMs < min) min = event.startMs;
		if (event.endMs > max) max = event.endMs;
	}
	return { min, max };
});

export const timelineNowAtom = atom(Date.now());

timelineNowAtom.onMount = (set) => {
	const update = () => set(Date.now());
	const interval = setInterval(update, 30_000);
	update();
	return () => clearInterval(interval);
};

export const activeTimelineEventAtom = eagerAtom((get) => {
	const now = get(timelineNowAtom);
	const events = get(timelineEventModelsAtom);
	return events.find((event) => event.startMs <= now && now < event.endMs) ?? null;
});

export const upcomingTimelineEventsAtom = eagerAtom((get) => {
	const now = get(timelineNowAtom);
	const events = get(timelineEventModelsAtom);
	return events.filter((event) => event.startMs >= now);
});

export const previousTimelineEventAtom = eagerAtom((get) => {
	const now = get(timelineNowAtom);
	const events = get(timelineEventModelsAtom);
	for (let i = events.length - 1; i >= 0; i--) {
		if (events[i].endMs <= now) return events[i];
	}
	return null;
});

function normalizeTimelineEvent(record: PBTimelineEventRecord): TimelineEventWithMeta | null {
	const startDate = safeDate(record.startAt);
	if (!startDate) return null;

	let endDate = record.endAt ? safeDate(record.endAt) : null;

	if (record.isAllDay) {
		const dayStart = startOfDay(startDate);
		endDate = new Date(dayStart.getTime() + MS_PER_DAY);
	} else if (!endDate || endDate <= startDate) {
		endDate = new Date(startDate.getTime() + DEFAULT_EVENT_DURATION_MINUTES * MS_PER_MINUTE);
	}

	return {
		...record,
		startDate,
		endDate,
		startMs: startDate.getTime(),
		endMs: endDate.getTime(),
		durationMinutes: Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / MS_PER_MINUTE)),
		dayKey: buildDayKey(startDate),
	};
}

function startOfDay(date: Date): Date {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function buildDayKey(date: Date): string {
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${date.getFullYear()}-${month}-${day}`;
}

function safeDate(value?: string | null): Date | null {
	const time = safeTime(value);
	if (Number.isNaN(time)) return null;
	return new Date(time);
}

function safeTime(value?: string | null): number {
	if (!value) return Number.NaN;
	const trimmed = value.trim();
	if (!trimmed) return Number.NaN;
	const numeric = Number(trimmed);
	if (Number.isFinite(numeric)) return numeric;
	const parsed = Date.parse(trimmed);
	return Number.isNaN(parsed) ? Number.NaN : parsed;
}
