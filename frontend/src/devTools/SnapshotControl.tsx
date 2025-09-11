import { useEffect, useRef, useState } from 'react';
import { useAtomValue } from 'jotai';
import {
	channelRecordsAtom,
	clientKVRecordsAtom,
	currentEventAtom,
	detectionRecordsAtom,
	eventRaceIdsAtom,
	eventsAtom,
	gamePointRecordsAtom,
	lapRecordsAtom,
	pilotChannelRecordsAtom,
	pilotsRecordsAtom,
	raceRecordsAtom,
	roundRecordsAtom,
} from '../state/atoms.ts';

// Basic styling for the button container
const snapshotControlStyle: React.CSSProperties = {
	position: 'fixed',
	bottom: '50px', // Position slightly above ScenarioSelector
	right: '10px',
	zIndex: 9998, // Slightly below ScenarioSelector if they overlap
	transition: 'opacity 0.5s ease-in-out', // Add transition for smooth fade
	opacity: 1, // Default opacity when visible
};

const hiddenStyle: React.CSSProperties = {
	...snapshotControlStyle,
	opacity: 0,
	pointerEvents: 'none', // Prevent interaction when hidden
};

const buttonStyle: React.CSSProperties = {
	padding: '5px 10px',
	backgroundColor: '#4CAF50',
	color: 'white',
	border: 'none',
	borderRadius: '4px',
	cursor: 'pointer',
	fontSize: '12px',
};

const buttonDisabledStyle: React.CSSProperties = {
	...buttonStyle,
	backgroundColor: '#aaa',
	cursor: 'not-allowed',
};

const HIDE_DELAY = 2000; // milliseconds

/**
 * PB Snapshot exporter
 *
 * Exports PocketBase-backed records from atoms into a single JSON with schema:
 * {
 *   version: 'pb-snapshot@v1',
 *   snapshotTime: string,
 *   currentEventId: string | null,
 *   collections: {
 *     events, pilots, channels, rounds,
 *     races, pilotChannels, laps, detections, gamePoints,
 *     client_kv
 *   }
 * }
 *
 * Import via backend: -import-snapshot=/path/to/file.json
 */
function SnapshotControl() {
	const [isCapturing, setIsCapturing] = useState(false);
	const [statusMessage, setStatusMessage] = useState<string | null>(null);
	const [isVisible, setIsVisible] = useState(false); // Visibility state
	const hideTimeoutRef = useRef<number | null>(null); // Ref for timeout ID

	const currentEvent = useAtomValue(currentEventAtom);
	const raceIds = useAtomValue(eventRaceIdsAtom);

	// Collections from PB-backed atoms
	const events = useAtomValue(eventsAtom);
	const pilots = useAtomValue(pilotsRecordsAtom);
	const channels = useAtomValue(channelRecordsAtom);
	const rounds = useAtomValue(roundRecordsAtom);
	const races = useAtomValue(tracePass(raceRecordsAtom));
	const pilotChannels = useAtomValue(pilotChannelRecordsAtom);
	const laps = useAtomValue(lapRecordsAtom);
	const detections = useAtomValue(detectionRecordsAtom);
	const gamePoints = useAtomValue(gamePointRecordsAtom);
	const client_kv = useAtomValue(clientKVRecordsAtom);

	// Effect to handle mouse move and visibility timeout
	useEffect(() => {
		const handleMouseMove = () => {
			setIsVisible(true);
			// Clear existing timeout if mouse moves again
			if (hideTimeoutRef.current) {
				clearTimeout(hideTimeoutRef.current);
			}
			// Set new timeout to hide after delay
			hideTimeoutRef.current = globalThis.setTimeout(() => {
				setIsVisible(false);
			}, HIDE_DELAY);
		};

		globalThis.addEventListener('mousemove', handleMouseMove as EventListener);

		// Cleanup function
		return () => {
			globalThis.removeEventListener('mousemove', handleMouseMove as EventListener);
			if (hideTimeoutRef.current) {
				clearTimeout(hideTimeoutRef.current);
			}
		};
	}, []); // Empty dependency array ensures this runs only on mount and unmount

	// currentEventId already read from atom

	const captureAndGenerateJson = () => {
		const eventId = currentEvent?.id || null;
		setIsCapturing(true);
		setStatusMessage('Capturing PocketBase data...');
		try {
			const payload = {
				version: 'pb-snapshot@v1' as const,
				snapshotTime: new Date().toISOString(),
				currentEventId: eventId,
				collections: {
					events,
					pilots,
					channels,
					rounds,
					races,
					pilotChannels,
					laps,
					detections,
					gamePoints,
					client_kv,
				},
			};

			const jsonString = JSON.stringify(payload, null, 2);
			const blob = new Blob([jsonString], { type: 'application/json' });
			const url = URL.createObjectURL(blob);
			const link = document.createElement('a');
			const suffix = eventId ?? 'none';
			const ts = new Date().toISOString().replace(/[:.]/g, '-');
			link.href = url;
			link.download = `pb-snapshot-${suffix}-${ts}.json`;
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);
			URL.revokeObjectURL(url);

			setStatusMessage('PB snapshot downloaded. Import with backend flag.');
		} catch (error) {
			console.error('PB snapshot failed:', error);
			setStatusMessage(`PB snapshot failed: ${(error as Error).message}`);
		} finally {
			setIsCapturing(false);
			setTimeout(() => setStatusMessage(null), 5000);
		}
	};

	if (!currentEvent) {
		return null;
	}

	const isEventDataReady = Array.isArray(raceIds);
	const finalStyle = isVisible ? snapshotControlStyle : hiddenStyle;

	return (
		<div style={finalStyle}>
			<button
				type='button'
				onClick={captureAndGenerateJson}
				disabled={isCapturing || !isEventDataReady}
				style={isCapturing || !isEventDataReady ? buttonDisabledStyle : buttonStyle}
				title={!isEventDataReady ? 'Waiting for event data...' : ''}
			>
				{isCapturing ? 'Capturing...' : 'Download PB Snapshot'}
			</button>
			{statusMessage && <p style={{ marginTop: '5px', color: '#ffcc00' }}>{statusMessage}</p>}
		</div>
	);
}

export default SnapshotControl;

// Small indirection for type inference on atoms returning arrays
function tracePass<T>(v: T): T {
	return v;
}
