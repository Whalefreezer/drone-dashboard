import { useMemo } from 'react';
import type { TimelineEventCategory } from '../api/pbTypes.ts';
import type { WorkingTimelineEvent } from './timelineEditorUtils.ts';
import { DRAG_STEP_MINUTES, MIN_EVENT_DURATION_MS_VALUE, MS_PER_MINUTE_VALUE, msToLocalInput } from './timelineEditorUtils.ts';

interface TimelineInspectorProps {
	event: WorkingTimelineEvent | null;
	onFieldChange: (id: string, patch: Partial<Omit<WorkingTimelineEvent, 'id' | 'record'>>) => void;
	onStartChange: (id: string, value: string) => void;
	onEndChange: (id: string, value: string) => void;
	disabled: boolean;
	categories: readonly TimelineEventCategory[];
}

export default function TimelineInspector({
	event,
	onFieldChange,
	onStartChange,
	onEndChange,
	disabled,
	categories,
}: TimelineInspectorProps) {
	const durationMinutes = useMemo(() => {
		if (!event) return null;
		return Math.max(1, Math.round((event.endMs - event.startMs) / MS_PER_MINUTE_VALUE));
	}, [event]);

	if (!event) {
		return (
			<aside className='timeline-inspector section-card'>
				<h2>Inspector</h2>
				<p className='muted'>Select an event on the canvas to edit its details.</p>
			</aside>
		);
	}

	return (
		<aside className='timeline-inspector section-card'>
			<h2>Inspector</h2>
			<div className='inspector-grid'>
				<label className='timeline-field'>
					<span>Title</span>
					<input
						type='text'
						value={event.title}
						onChange={(e) => onFieldChange(event.id, { title: e.currentTarget.value })}
						disabled={disabled}
					/>
				</label>
				<label className='timeline-field'>
					<span>Description</span>
					<textarea
						value={event.description}
						onChange={(e) => onFieldChange(event.id, { description: e.currentTarget.value })}
						disabled={disabled}
					/>
				</label>
				<label className='timeline-field'>
					<span>Category</span>
					<select
						value={event.category}
						onChange={(e) => onFieldChange(event.id, { category: e.currentTarget.value as TimelineEventCategory | '' })}
						disabled={disabled}
					>
						<option value=''>Uncategorized</option>
						{categories.map((category) => <option key={category} value={category}>{formatCategory(category)}</option>)}
					</select>
				</label>
				<label className='timeline-field'>
					<span>Sort key</span>
					<input
						type='number'
						value={event.sortKey ?? ''}
						onChange={(e) => onFieldChange(event.id, { sortKey: parseOptionalNumber(e.currentTarget.value) })}
						disabled={disabled}
					/>
				</label>
				<label className='timeline-field inline'>
					<input
						type='checkbox'
						checked={event.isAllDay}
						onChange={(e) => onFieldChange(event.id, { isAllDay: e.currentTarget.checked })}
						disabled={disabled}
					/>
					<span>All day</span>
				</label>
				<label className='timeline-field'>
					<span>Start</span>
					<input
						type='datetime-local'
						value={msToLocalInput(event.startMs)}
						onChange={(e) => onStartChange(event.id, e.currentTarget.value)}
						disabled={disabled}
					/>
					<div className='inline-controls'>
						<button
							type='button'
							disabled={disabled}
							onClick={() => onFieldChange(event.id, { startMs: event.startMs - DRAG_STEP_MINUTES * MS_PER_MINUTE_VALUE })}
						>
							−5m
						</button>
						<button
							type='button'
							disabled={disabled}
							onClick={() => onFieldChange(event.id, { startMs: event.startMs + DRAG_STEP_MINUTES * MS_PER_MINUTE_VALUE })}
						>
							+5m
						</button>
						<button
							type='button'
							disabled={disabled}
							onClick={() => onFieldChange(event.id, { startMs: event.startMs - 3 * DRAG_STEP_MINUTES * MS_PER_MINUTE_VALUE })}
						>
							−15m
						</button>
						<button
							type='button'
							disabled={disabled}
							onClick={() => onFieldChange(event.id, { startMs: event.startMs + 3 * DRAG_STEP_MINUTES * MS_PER_MINUTE_VALUE })}
						>
							+15m
						</button>
					</div>
				</label>
				<label className='timeline-field'>
					<span>End</span>
					<input
						type='datetime-local'
						value={msToLocalInput(event.endMs)}
						onChange={(e) => onEndChange(event.id, e.currentTarget.value)}
						disabled={disabled}
					/>
					<div className='inline-controls'>
						<button
							type='button'
							disabled={disabled}
							onClick={() => onFieldChange(event.id, { endMs: event.endMs - DRAG_STEP_MINUTES * MS_PER_MINUTE_VALUE })}
						>
							−5m
						</button>
						<button
							type='button'
							disabled={disabled}
							onClick={() => onFieldChange(event.id, { endMs: event.endMs + DRAG_STEP_MINUTES * MS_PER_MINUTE_VALUE })}
						>
							+5m
						</button>
						<button
							type='button'
							disabled={disabled}
							onClick={() => onFieldChange(event.id, { endMs: event.endMs - 3 * DRAG_STEP_MINUTES * MS_PER_MINUTE_VALUE })}
						>
							−15m
						</button>
						<button
							type='button'
							disabled={disabled}
							onClick={() => onFieldChange(event.id, { endMs: event.endMs + 3 * DRAG_STEP_MINUTES * MS_PER_MINUTE_VALUE })}
						>
							+15m
						</button>
					</div>
				</label>
			</div>
			<div className='inspector-footer'>
				<span className='muted'>Duration: {durationMinutes} min (minimum {MIN_EVENT_DURATION_MS_VALUE / MS_PER_MINUTE_VALUE} min)</span>
				{renderOffsets(event)}
			</div>
		</aside>
	);
}

function parseOptionalNumber(value: string): number | null {
	const trimmed = value.trim();
	if (!trimmed) return null;
	const parsed = Number(trimmed);
	return Number.isFinite(parsed) ? parsed : null;
}

function formatCategory(category: string): string {
	return category.replace(/-/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function renderOffsets(event: WorkingTimelineEvent) {
	const dayStart = new Date(event.startMs);
	dayStart.setHours(0, 0, 0, 0);
	const offsetStart = Math.round((event.startMs - dayStart.getTime()) / MS_PER_MINUTE_VALUE);
	const offsetEnd = Math.round((event.endMs - dayStart.getTime()) / MS_PER_MINUTE_VALUE);
	return (
		<div className='muted'>
			Offsets from day start: start +{offsetStart}m, end +{offsetEnd}m
		</div>
	);
}
