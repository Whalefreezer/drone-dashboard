import { useEffect, useRef, useState } from 'react';
import { useAtomValue } from 'jotai';
import { loadable } from 'jotai/utils';
import { eventDataAtom, eventIdAtom } from '../state/atoms.ts';
import { RACE_DATA_ENDPOINT_TEMPLATE, SNAPSHOT_TARGET_ENDPOINTS } from './snapshotConstants.ts';
import { RaceEvent } from '../types/types.ts';

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

function SnapshotControl() {
    const [isCapturing, setIsCapturing] = useState(false);
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [isVisible, setIsVisible] = useState(false); // Visibility state
    const hideTimeoutRef = useRef<number | null>(null); // Ref for timeout ID

    const eventIdLoadable = useAtomValue(loadable(eventIdAtom));
    const eventDataLoadable = useAtomValue(loadable(eventDataAtom));

    // Effect to handle mouse move and visibility timeout
    useEffect(() => {
        const handleMouseMove = () => {
            setIsVisible(true);
            // Clear existing timeout if mouse moves again
            if (hideTimeoutRef.current) {
                clearTimeout(hideTimeoutRef.current);
            }
            // Set new timeout to hide after delay
            hideTimeoutRef.current = window.setTimeout(() => {
                setIsVisible(false);
            }, HIDE_DELAY);
        };

        window.addEventListener('mousemove', handleMouseMove);

        // Cleanup function
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            if (hideTimeoutRef.current) {
                clearTimeout(hideTimeoutRef.current);
            }
        };
    }, []); // Empty dependency array ensures this runs only on mount and unmount

    // Helper to get the actual event ID string from the loadable query result
    const getEventId = (): string | null => {
        if (eventIdLoadable.state === 'hasData' && typeof eventIdLoadable.data?.data === 'string') {
            return eventIdLoadable.data.data;
        }
        return null;
    };

    const currentEventId = getEventId();

    const captureAndGenerateJson = async () => {
        const eventId = getEventId();
        if (!eventId) {
            setStatusMessage('Error: Event ID not available or invalid.');
            setTimeout(() => setStatusMessage(null), 3000);
            return;
        }

        if (eventDataLoadable.state !== 'hasData' || !Array.isArray(eventDataLoadable.data?.data)) {
            setStatusMessage('Error: Event Data not available or invalid.');
            setTimeout(() => setStatusMessage(null), 3000);
            return;
        }

        const eventData = eventDataLoadable.data.data as RaceEvent[];
        const raceIds = eventData[0]?.Races || [];

        setIsCapturing(true);
        setStatusMessage('Capturing live data...');
        const capturedDataMap: Record<string, any> = {};
        let fetchError = false;

        try {
            const fetchEndpoint = async (templatePath: string, specificRaceId?: string) => {
                let urlPath = templatePath.replace(':eventId', eventId);
                if (specificRaceId) {
                    urlPath = urlPath.replace(':raceId', specificRaceId);
                }
                const liveUrl = urlPath; // Use relative path directly
                console.log(`Snapshot: Fetching ${liveUrl}`);
                try {
                    const response = await fetch(liveUrl); // Direct relative fetch
                    if (!response.ok) {
                        console.error(`Snapshot Error: ${response.status} for ${liveUrl}`);
                        return { status: response.status, error: response.statusText };
                    }
                    const data = await response.json();
                    return { status: response.status, data };
                } catch (error) {
                    console.error(`Snapshot Fetch Error for ${liveUrl}:`, error);
                    fetchError = true;
                    return { status: 503, error: `Fetch failed: ${(error as Error).message}` };
                }
            };

            for (const templatePath of SNAPSHOT_TARGET_ENDPOINTS) {
                if (templatePath === RACE_DATA_ENDPOINT_TEMPLATE) {
                    capturedDataMap[templatePath] = {};
                    for (const raceId of raceIds) {
                        capturedDataMap[templatePath][raceId] = await fetchEndpoint(
                            templatePath,
                            raceId,
                        );
                    }
                } else {
                    capturedDataMap[templatePath] = await fetchEndpoint(templatePath);
                }
            }

            // Add scenario context (like the eventId used) to the map
            capturedDataMap['__scenarioContext'] = { eventId: eventId };

            // Generate JSON and trigger download
            const jsonString = JSON.stringify(capturedDataMap, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `snapshot-${Date.now()}.json`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            setStatusMessage('Snapshot downloaded! Check instructions.');
            alert(
                `Snapshot JSON downloaded as ${link.download}.\n\n` +
                    `**ACTION REQUIRED:**\n` +
                    `1. Move the downloaded file into: public/scenarios/\n` +
                    `2. Add the filename (without .json) and a display name to jsonScenarioFiles in: frontend/src/mocks/scenarios/index.ts\n\n` +
                    `(See docs/msw-snapshot-feature.md for details)`,
            );
        } catch (error) {
            console.error('Snapshot failed globally:', error);
            setStatusMessage(`Snapshot failed: ${(error as Error).message}`);
        } finally {
            setIsCapturing(false);
            if (!fetchError && !statusMessage?.startsWith('Snapshot failed')) {
                setTimeout(() => setStatusMessage(null), 5000);
            }
        }
    };

    if (!currentEventId) {
        return null;
    }

    const isEventDataReady = eventDataLoadable.state === 'hasData' &&
        Array.isArray(eventDataLoadable.data?.data);
    const finalStyle = isVisible ? snapshotControlStyle : hiddenStyle;

    return (
        <div style={finalStyle}>
            <button
                onClick={captureAndGenerateJson}
                disabled={isCapturing || !isEventDataReady}
                style={isCapturing || !isEventDataReady ? buttonDisabledStyle : buttonStyle}
                title={!isEventDataReady ? 'Waiting for event data...' : ''}
            >
                {isCapturing ? 'Capturing...' : 'Snapshot Live Data'}
            </button>
            {statusMessage && <p style={{ marginTop: '5px', color: '#ffcc00' }}>{statusMessage}</p>}
        </div>
    );
}

export default SnapshotControl;
