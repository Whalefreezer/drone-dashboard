import type { PBTimelineEventRecord, TimelineEventCategory } from '../api/pbTypes.ts';

const MS_PER_MINUTE = 60_000;
const MIN_EVENT_MINUTES = 5;
const MIN_EVENT_DURATION_MS = MIN_EVENT_MINUTES * MS_PER_MINUTE;

export interface WorkingTimelineEvent {
	record: PBTimelineEventRecord;
	id: string;
	title: string;
	description: string;
	category: TimelineEventCategory | '';
	isAllDay: boolean;
	sortKey: number | null;
	startMs: number;
	endMs: number;
}

export function buildWorkingTimeline(records: PBTimelineEventRecord[]): WorkingTimelineEvent[] {
	const sorted = [...records].sort((a, b) => safeTime(a.startAt) - safeTime(b.startAt));
	const result: WorkingTimelineEvent[] = [];
	for (let index = 0; index < sorted.length; index++) {
		const record = sorted[index];
		const next = sorted[index + 1];
		const startMs = safeTime(record.startAt);
		if (!Number.isFinite(startMs)) continue;
		let endMs = safeTime(record.endAt);
		if (!Number.isFinite(endMs) || endMs <= startMs) {
			const nextStart = next ? safeTime(next.startAt) : Number.NaN;
			if (Number.isFinite(nextStart) && nextStart > startMs) {
				endMs = nextStart;
			} else {
				endMs = startMs + 15 * MS_PER_MINUTE;
			}
		}
		result.push({
			record,
			id: record.id,
			title: record.title ?? '',
			description: record.description ?? '',
			category: record.category ?? '',
			isAllDay: Boolean(record.isAllDay),
			sortKey: record.sortKey ?? null,
			startMs,
			endMs,
		});
	}
	return result;
}

export function cloneWorkingTimeline(events: WorkingTimelineEvent[]): WorkingTimelineEvent[] {
	return events.map((event) => ({ ...event }));
}

export function msToIso(timestamp: number): string {
	return new Date(timestamp).toISOString();
}

export function applyBoundaryShift(
	events: WorkingTimelineEvent[],
	index: number,
	deltaMinutes: number,
): WorkingTimelineEvent[] {
	if (!Number.isFinite(deltaMinutes) || deltaMinutes === 0) return events;
	if (index < 0 || index >= events.length - 1) return events;
	const deltaMs = deltaMinutes * MS_PER_MINUTE;
	const next = cloneWorkingTimeline(events);
	const upstream = next[index];
	const newTimeline = next;

	if (deltaMs > 0) {
		upstream.endMs += deltaMs;
		let prevEnd = upstream.endMs;
		let carry = 0;
		for (let i = index + 1; i < newTimeline.length; i++) {
			const item = newTimeline[i];
			item.startMs += carry;
			item.endMs += carry;
			let overlap = prevEnd - item.startMs;
			if (overlap > 0) {
				if (item.category === 'break') {
					const capacity = Math.max(0, (item.endMs - item.startMs) - MIN_EVENT_DURATION_MS);
					const shrink = Math.min(overlap, capacity);
					if (shrink > 0) {
						item.startMs += shrink;
						overlap -= shrink;
					}
				}
				if (overlap > 0) {
					item.startMs += overlap;
					item.endMs += overlap;
					carry += overlap;
				}
			}
			prevEnd = item.endMs;
		}
		return newTimeline;
	}

	const pullMs = Math.abs(deltaMs);
	const currentDuration = upstream.endMs - upstream.startMs;
	const maxShrink = Math.max(0, currentDuration - MIN_EVENT_DURATION_MS);
	const appliedShrink = Math.min(pullMs, maxShrink);
	if (appliedShrink === 0) {
		return events;
	}
	upstream.endMs -= appliedShrink;
	let prevEnd = upstream.endMs;
	const shift = -appliedShrink;
	let carry = shift;
	for (let i = index + 1; i < newTimeline.length; i++) {
		const item = newTimeline[i];
		item.startMs += carry;
		item.endMs += carry;
		if (item.startMs < prevEnd) {
			const correction = prevEnd - item.startMs;
			item.startMs += correction;
			item.endMs += correction;
			carry += correction;
		}
		prevEnd = item.endMs;
	}
	return newTimeline;
}

export function updateEventFields(
	events: WorkingTimelineEvent[],
	id: string,
	patch: Partial<Omit<WorkingTimelineEvent, 'record' | 'id'>>,
): WorkingTimelineEvent[] {
	return events.map((event) => event.id === id ? { ...event, ...patch } : event);
}

export function isEventDirty(event: WorkingTimelineEvent): boolean {
	const base = event.record;
	return (
		(base.title ?? '') !== event.title ||
		(base.description ?? '') !== event.description ||
		(base.category ?? '') !== event.category ||
		Boolean(base.isAllDay) !== event.isAllDay ||
		(base.sortKey ?? null) !== event.sortKey ||
		safeTime(base.startAt) !== event.startMs ||
		safeTime(base.endAt) !== event.endMs
	);
}

export function hasDirtyEvents(events: WorkingTimelineEvent[]): boolean {
	return events.some((event) => isEventDirty(event));
}

export function safeTime(value?: string | null): number {
	if (!value) return Number.NaN;
	const parsed = Date.parse(value);
	return Number.isNaN(parsed) ? Number.NaN : parsed;
}

export function msToLocalInput(timestamp: number): string {
	const date = new Date(timestamp);
	if (!Number.isFinite(date.getTime())) return '';
	const offset = date.getTimezoneOffset();
	const local = new Date(date.getTime() - offset * 60_000);
	return local.toISOString().slice(0, 16);
}

export function localInputToMs(value: string): number | null {
	if (!value) return null;
	const date = new Date(value);
	if (!Number.isFinite(date.getTime())) return null;
	return date.getTime();
}

export const MIN_EVENT_MINUTES_VALUE = MIN_EVENT_MINUTES;
export const MIN_EVENT_DURATION_MS_VALUE = MIN_EVENT_DURATION_MS;
export const MS_PER_MINUTE_VALUE = MS_PER_MINUTE;
export const DRAG_STEP_MINUTES = 5;
