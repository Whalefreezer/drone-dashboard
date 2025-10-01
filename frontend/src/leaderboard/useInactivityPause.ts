import { useCallback, useEffect, useRef, useState } from 'react';

interface UseInactivityPauseOptions {
	delayMs: number;
	disabled?: boolean;
	onResume?: () => void;
}

interface UseInactivityPauseResult {
	isPaused: boolean;
	triggerPause: () => void;
	cancel: () => void;
}

export function useInactivityPause(
	{ delayMs, disabled = false, onResume }: UseInactivityPauseOptions,
): UseInactivityPauseResult {
	const [isPaused, setIsPaused] = useState(false);
	const timeoutRef = useRef<number | null>(null);
	const firstPauseRef = useRef(false);

	const clearTimer = useCallback(() => {
		if (timeoutRef.current) {
			clearTimeout(timeoutRef.current);
			timeoutRef.current = null;
		}
	}, []);

	const cancel = useCallback(() => {
		clearTimer();
		setIsPaused(false);
	}, [clearTimer]);

	const triggerPause = useCallback(() => {
		if (disabled) return;
		clearTimer();
		setIsPaused(true);
		timeoutRef.current = globalThis.setTimeout(() => {
			setIsPaused(false);
			timeoutRef.current = null;
			onResume?.();
		}, delayMs);
	}, [clearTimer, delayMs, disabled, onResume]);

	// immediately set to paused
	useEffect(() => {
		if (disabled || firstPauseRef.current) return;
		firstPauseRef.current = true;
		triggerPause();
	}, [disabled]);

	useEffect(() => cancel, [cancel]);

	useEffect(() => {
		if (disabled) cancel();
	}, [cancel, disabled]);

	return { isPaused, triggerPause, cancel };
}

export default useInactivityPause;
