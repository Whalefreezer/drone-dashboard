import { TimelineEventWithMeta } from '../state/timelineAtoms.ts';

const MS_PER_MINUTE = 60_000;

export interface TimelineLayoutOptions {
	pixelsPerMinute?: number;
	minimumEventMinutes?: number;
	minimumTimelineMinutes?: number;
	padStartMinutes?: number;
	padEndMinutes?: number;
	now?: number;
}

export interface TimelineLayoutEvent {
	event: TimelineEventWithMeta;
	offsetMinutes: number;
	durationMinutes: number;
	topPx: number;
	heightPx: number;
}

export interface TimelineLayoutResult {
	events: TimelineLayoutEvent[];
	totalMinutes: number;
	totalHeightPx: number;
	startMs: number;
	endMs: number;
	nowOffsetMinutes: number | null;
	nowOffsetPx: number | null;
}

const DEFAULT_LAYOUT_OPTIONS: Required<
	Pick<TimelineLayoutOptions, 'pixelsPerMinute' | 'minimumEventMinutes' | 'minimumTimelineMinutes' | 'padStartMinutes' | 'padEndMinutes'>
> = {
	pixelsPerMinute: 4,
	minimumEventMinutes: 10,
	minimumTimelineMinutes: 60,
	padStartMinutes: 120,
	padEndMinutes: 60,
};

export function computeTimelineLayout(
	events: TimelineEventWithMeta[],
	options: TimelineLayoutOptions = {},
): TimelineLayoutResult {
	if (events.length === 0) {
		const defaults = resolveOptions(options);
		return {
			events: [],
			totalMinutes: defaults.minimumTimelineMinutes,
			totalHeightPx: defaults.minimumTimelineMinutes * defaults.pixelsPerMinute,
			startMs: 0,
			endMs: 0,
			nowOffsetMinutes: null,
			nowOffsetPx: null,
		};
	}

	const resolved = resolveOptions(options);
	const firstStart = events[0].startMs;
	const lastEnd = events.reduce((acc, event) => Math.max(acc, event.endMs), events[0].endMs);

	const paddedStart = resolved.now == null ? firstStart : Math.min(firstStart, resolved.now - resolved.padStartMinutes * MS_PER_MINUTE);
	const paddedEnd = resolved.now == null ? lastEnd : Math.max(lastEnd, resolved.now + resolved.padEndMinutes * MS_PER_MINUTE);

	const totalMinutes = Math.max(
		resolved.minimumTimelineMinutes,
		Math.ceil((paddedEnd - paddedStart) / MS_PER_MINUTE),
	);

	const layoutEvents: TimelineLayoutEvent[] = [];
	for (const event of events) {
		const offsetMinutes = Math.max(0, (event.startMs - paddedStart) / MS_PER_MINUTE);
		const durationMinutes = Math.max(resolved.minimumEventMinutes, event.durationMinutes);
		const topPx = offsetMinutes * resolved.pixelsPerMinute;
		const heightPx = durationMinutes * resolved.pixelsPerMinute;
		layoutEvents.push({
			event,
			offsetMinutes,
			durationMinutes,
			topPx,
			heightPx,
		});
	}

	const totalHeightPx = totalMinutes * resolved.pixelsPerMinute;
	const nowOffsetMinutes = resolved.now == null
		? null
		: clampNowOffset(resolved.now, paddedStart, paddedStart + totalMinutes * MS_PER_MINUTE);
	const nowOffsetPx = nowOffsetMinutes == null ? null : nowOffsetMinutes * resolved.pixelsPerMinute;

	return {
		events: layoutEvents,
		totalMinutes,
		totalHeightPx,
		startMs: paddedStart,
		endMs: paddedStart + totalMinutes * MS_PER_MINUTE,
		nowOffsetMinutes,
		nowOffsetPx,
	};
}

function resolveOptions(options: TimelineLayoutOptions) {
	return {
		pixelsPerMinute: options.pixelsPerMinute ?? DEFAULT_LAYOUT_OPTIONS.pixelsPerMinute,
		minimumEventMinutes: options.minimumEventMinutes ?? DEFAULT_LAYOUT_OPTIONS.minimumEventMinutes,
		minimumTimelineMinutes: options.minimumTimelineMinutes ?? DEFAULT_LAYOUT_OPTIONS.minimumTimelineMinutes,
		padStartMinutes: options.padStartMinutes ?? DEFAULT_LAYOUT_OPTIONS.padStartMinutes,
		padEndMinutes: options.padEndMinutes ?? DEFAULT_LAYOUT_OPTIONS.padEndMinutes,
		now: options.now ?? null,
	};
}

function clampNowOffset(now: number, startMs: number, endMs: number): number {
	const clampedNow = Math.min(Math.max(now, startMs), endMs);
	return (clampedNow - startMs) / MS_PER_MINUTE;
}
