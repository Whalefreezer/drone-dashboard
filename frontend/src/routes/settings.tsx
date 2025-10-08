import { createFileRoute, Link } from '@tanstack/react-router';
import { useAtom, useAtomValue } from 'jotai';
import { useEffect, useMemo } from 'react';
import { GenericSuspense } from '../common/GenericSuspense.tsx';
import { currentEventAtom, EVENT_SELECTION_CURRENT, eventsAtom, pbCurrentEventAtom, selectedEventIdAtom } from '../state/pbAtoms.ts';
import type { PBEventRecord } from '../api/pbTypes.ts';
import '../settings/SettingsPage.css';

// @ts-ignore - TanStack Router type issue, see https://github.com/denoland/deno/issues/30444
export const Route = createFileRoute('/settings')({
	component: SettingsPage,
});

function SettingsPage() {
	return (
		<div className='settings-page'>
			<header className='settings-header'>
				<h1>Settings</h1>
				{/* @ts-ignore - TanStack Router type issue, see https://github.com/denoland/deno/issues/30444 */}
				<Link to='/' className='settings-back-link'>
					← Back to dashboard
				</Link>
			</header>

			<GenericSuspense id='event-selector'>
				<EventSelectionSection />
			</GenericSuspense>
		</div>
	);
}

function EventSelectionSection() {
	const [selectedEventId, setSelectedEventId] = useAtom(selectedEventIdAtom);
	const events = useAtomValue(eventsAtom);
	const activeEvent = useAtomValue(currentEventAtom);
	const pbCurrentEvent = useAtomValue(pbCurrentEventAtom);

	const sortedEvents = useMemo(() => {
		return [...events].sort((a, b) => {
			const aStart = a.start ? Date.parse(a.start) : 0;
			const bStart = b.start ? Date.parse(b.start) : 0;
			if (aStart === bStart) return a.name.localeCompare(b.name);
			return bStart - aStart;
		});
	}, [events]);

	useEffect(() => {
		if (selectedEventId !== EVENT_SELECTION_CURRENT) {
			const found = sortedEvents.find((event) => event.id === selectedEventId);
			if (!found) setSelectedEventId(EVENT_SELECTION_CURRENT);
		}
	}, [selectedEventId, sortedEvents, setSelectedEventId]);

	const handleSelectChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
		setSelectedEventId(event.target.value as string);
	};

	const renderEventLabel = (event: PBEventRecord): string => {
		const prefix = event.name.trim() || 'Untitled event';
		return prefix;
	};

	return (
		<section className='settings-card' aria-labelledby='settings-event-heading'>
			<h2 id='settings-event-heading'>Active Event</h2>
			<p className='settings-help-text'>
				Choose which event the dashboard should use. Selecting a specific event overrides auto-detection until you switch back to{' '}
				<strong>Current (auto)</strong>.
			</p>
			<label htmlFor='settings-event-select' className='settings-label'>
				Event source
			</label>
			<select
				id='settings-event-select'
				className='settings-select'
				value={selectedEventId}
				onChange={handleSelectChange}
			>
				<option value={EVENT_SELECTION_CURRENT}>Current (auto)</option>
				{sortedEvents.map((event) => (
					<option key={event.id} value={event.id}>
						{renderEventLabel(event)}
					</option>
				))}
			</select>
			{activeEvent
				? (
					<div className='settings-active-event'>
						<div className='settings-active-name'>{activeEvent.name}</div>
						<div className='settings-active-meta'>
							{formatDateRange(activeEvent.start, activeEvent.end)}
							{activeEvent.isCurrent && selectedEventId !== EVENT_SELECTION_CURRENT && <span className='settings-chip'>Auto-detected</span>}
							{selectedEventId === EVENT_SELECTION_CURRENT && <span className='settings-chip'>Auto</span>}
						</div>
					</div>
				)
				: (
					<div className='settings-active-event'>
						<div className='settings-active-name'>No event selected</div>
						<div className='settings-active-meta'>The dashboard will fall back to PocketBase defaults.</div>
					</div>
				)}
		</section>
	);
}

function formatDateRange(start?: string | null, end?: string | null): string {
	const startMs = start ? Date.parse(start) : NaN;
	const endMs = end ? Date.parse(end) : NaN;
	if (!Number.isFinite(startMs) && !Number.isFinite(endMs)) return 'Dates unknown';
	const startLabel = Number.isFinite(startMs) ? new Date(startMs).toLocaleString() : null;
	const endLabel = Number.isFinite(endMs) ? new Date(endMs).toLocaleString() : null;
	if (startLabel && endLabel) return `${startLabel} → ${endLabel}`;
	return startLabel ?? endLabel ?? 'Dates unknown';
}
