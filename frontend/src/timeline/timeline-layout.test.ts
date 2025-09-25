import { assertAlmostEquals, assertEquals } from '@std/assert';
import { computeTimelineLayout } from './timeline-layout.ts';
import type { TimelineEventWithMeta } from '../state/timelineAtoms.ts';

const MS = 60_000;

Deno.test('computeTimelineLayout calculates offsets and heights', () => {
	const start = Date.UTC(2025, 5, 1, 8, 0, 0);
	const events = [
		makeEvent('a', start, start + 30 * MS),
		makeEvent('b', start + 45 * MS, start + 75 * MS),
	];

	const layout = computeTimelineLayout(events, {
		pixelsPerMinute: 2,
		minimumEventMinutes: 10,
		minimumTimelineMinutes: 60,
		padStartMinutes: 0,
		padEndMinutes: 0,
		now: start + 45 * MS,
	});

	assertEquals(layout.events.length, 2);
	assertEquals(layout.events[0].offsetMinutes, 0);
	assertEquals(layout.events[0].durationMinutes, 30);
	assertEquals(layout.events[0].heightPx, 60);
	assertEquals(layout.events[1].offsetMinutes, 45);
	assertEquals(layout.events[1].heightPx, 60);
	assertEquals(layout.totalMinutes, 75);
	assertEquals(layout.totalHeightPx, 150);
	assertEquals(layout.nowOffsetMinutes, 45);
	assertEquals(layout.nowOffsetPx, 90);
});

Deno.test('computeTimelineLayout pads start before the first event when now is earlier', () => {
	const start = Date.UTC(2025, 5, 2, 15, 0, 0);
	const events = [makeEvent('a', start, start + 60 * MS)];
	const now = start - 30 * MS;

	const layout = computeTimelineLayout(events, {
		pixelsPerMinute: 1,
		minimumEventMinutes: 15,
		minimumTimelineMinutes: 60,
		padStartMinutes: 120,
		padEndMinutes: 30,
		now,
	});

	const expectedStart = start - (120 + 30) * MS;
	assertEquals(layout.startMs, expectedStart);
	assertEquals(layout.nowOffsetMinutes, 120);
	assertEquals(layout.totalMinutes, Math.ceil((layout.endMs - layout.startMs) / MS));
});

Deno.test('computeTimelineLayout pads end to include time after the last event', () => {
	const start = Date.UTC(2025, 5, 3, 10, 0, 0);
	const events = [
		makeEvent('a', start, start + 45 * MS),
		makeEvent('b', start + 90 * MS, start + 120 * MS),
	];
	const now = start + 180 * MS;

	const layout = computeTimelineLayout(events, {
		pixelsPerMinute: 3,
		minimumEventMinutes: 15,
		minimumTimelineMinutes: 120,
		padStartMinutes: 30,
		padEndMinutes: 90,
		now,
	});

	assertEquals(layout.endMs, layout.startMs + layout.totalMinutes * MS);
	assertAlmostEquals(layout.nowOffsetMinutes ?? 0, (now - layout.startMs) / MS, 1e-6);
	assertAlmostEquals(layout.nowOffsetPx ?? 0, (layout.nowOffsetMinutes ?? 0) * 3, 1e-6);
});

function makeEvent(id: string, startMs: number, endMs: number): TimelineEventWithMeta {
	const startDate = new Date(startMs);
	const endDate = new Date(endMs);
	return {
		id,
		event: 'event-1',
		title: `Event ${id}`,
		description: '',
		category: 'other',
		isAllDay: false,
		sortKey: 0,
		startAt: new Date(startMs).toISOString(),
		endAt: new Date(endMs).toISOString(),
		startDate,
		endDate,
		startMs,
		endMs,
		durationMinutes: Math.round((endMs - startMs) / MS),
		dayKey: '2025-06-01',
	};
}
