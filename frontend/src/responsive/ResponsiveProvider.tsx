import { PropsWithChildren, useEffect } from 'react';
import { useSetAtom } from 'jotai';
import { breakpointAtom, viewportAtom } from './atoms.ts';
import { defaultBreakpointThresholds } from './breakpoints.ts';
import { computeBreakpoint } from './computeBreakpoint.ts';

// Debounce handled within the effect using a local timer id.

export function ResponsiveProvider({ children }: PropsWithChildren) {
	const setViewport = useSetAtom(viewportAtom);
	const setBreakpoint = useSetAtom(breakpointAtom);

	useEffect(() => {
		const cfg = defaultBreakpointThresholds;

		// Initial measurement + helper to set atoms
		const measure = () => ({ width: globalThis.innerWidth, height: globalThis.innerHeight });
		const applyFromWindow = () => {
			const { width, height } = measure();
			setViewport({ width, height });
			setBreakpoint(computeBreakpoint(width, cfg));
		};

		// MatchMedia listeners only (all target platforms support it)
		const mqlDesktopMin = globalThis.matchMedia(`(min-width: ${cfg.desktopMin}px)`);
		const mqlTabletMin = globalThis.matchMedia(`(min-width: ${cfg.tabletMin}px)`);
		const onChange = () => applyFromWindow();

		mqlDesktopMin.addEventListener('change', onChange);
		mqlTabletMin.addEventListener('change', onChange);

		// Set initial state
		applyFromWindow();

		return () => {
			mqlDesktopMin.removeEventListener('change', onChange);
			mqlTabletMin.removeEventListener('change', onChange);
		};
	}, [setViewport, setBreakpoint]);

	return <>{children}</>;
}

export default ResponsiveProvider;
