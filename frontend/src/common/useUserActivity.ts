import { useEffect, useRef, useState } from 'react';

const IDLE_DELAY = 5000; // 5 seconds of inactivity

type ActivityType = 'mousemove' | 'mousedown' | 'mouseup' | 'click' | 'keydown' | 'scroll' | 'touchstart';

/**
 * Custom hook to track user activity and detect idle state.
 * Returns whether the user is currently active (not idle).
 */
export function useUserActivity(delay: number = IDLE_DELAY): boolean {
	const [isActive, setIsActive] = useState(true);
	const timeoutRef = useRef<number | null>(null);

	useEffect(() => {
		const handleActivity = () => {
			setIsActive(true);

			// Clear previous timeout
			if (timeoutRef.current) {
				clearTimeout(timeoutRef.current);
			}

			// Set timeout to mark as inactive
			timeoutRef.current = globalThis.setTimeout(() => {
				setIsActive(false);
			}, delay);
		};

		// List of events to track
		const events: ActivityType[] = [
			'mousemove',
			'mousedown',
			'mouseup',
			'click',
			'keydown',
			'scroll',
			'touchstart',
		];

		// Add event listeners
		events.forEach((event) => {
			globalThis.addEventListener(event, handleActivity, { passive: true });
		});

		// Initial setup: mark as active and start timer
		handleActivity();

		// Cleanup on unmount
		return () => {
			events.forEach((event) => {
				globalThis.removeEventListener(event, handleActivity);
			});
			if (timeoutRef.current) {
				clearTimeout(timeoutRef.current);
			}
		};
	}, [delay]);

	return isActive;
}
