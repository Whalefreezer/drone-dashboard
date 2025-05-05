import { useEffect, useRef } from 'react';

const CURSOR_HIDE_DELAY = 3000; // milliseconds

/**
 * Custom hook to automatically hide the mouse cursor after a period of inactivity.
 */
export function useIdleCursor(): void {
    const cursorHideTimeoutRef = useRef<number | null>(null);

    useEffect(() => {
        const handleMouseMove = () => {
            // Ensure cursor is visible and reset style
            document.body.style.cursor = 'default';

            // Clear previous timeout
            if (cursorHideTimeoutRef.current) {
                clearTimeout(cursorHideTimeoutRef.current);
            }

            // Set timeout to hide cursor
            cursorHideTimeoutRef.current = globalThis.setTimeout(() => {
                document.body.style.cursor = 'none';
            }, CURSOR_HIDE_DELAY);
        };

        // Initial setup: make cursor visible and start the timer
        handleMouseMove();

        globalThis.addEventListener('mousemove', handleMouseMove);

        // Cleanup on unmount
        return () => {
            globalThis.removeEventListener('mousemove', handleMouseMove);
            if (cursorHideTimeoutRef.current) {
                clearTimeout(cursorHideTimeoutRef.current);
            }
            // Ensure cursor is visible when hook unmounts
            document.body.style.cursor = 'default';
        };
    }, []); // Empty dependency array - run effect once on mount
}
