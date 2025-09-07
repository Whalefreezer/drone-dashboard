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

		// Initial measurement
		const measure = () => ({ width: globalThis.innerWidth, height: globalThis.innerHeight });
		const apply = (w: number, h: number) => {
			setViewport({ width: w, height: h });
			setBreakpoint(computeBreakpoint(w, cfg));
		};

		// MatchMedia listeners (preferred for efficiency)
		const mqlDesktopMin = globalThis.matchMedia(`(min-width: ${cfg.desktopMin}px)`);
		const mqlTabletMin = globalThis.matchMedia(`(min-width: ${cfg.tabletMin}px)`);

		const updateFromMql = () => {
			// Fallback to measuring to keep viewportAtom in sync
			const { width, height } = measure();
			apply(width, height);
		};

		// Debounced generic resize fallback (covers orientation and when MQL isn’t supported)
		let debounceId: number | null = null;
		const onResize = () => {
			if (debounceId !== null) clearTimeout(debounceId);
			debounceId = setTimeout(() => {
				const { width, height } = measure();
				apply(width, height);
			}, 120) as unknown as number;
		};

		// ResizeObserver fallback on documentElement if available
		let ro: ResizeObserver | null = null;
		if (typeof ResizeObserver !== 'undefined') {
			ro = new ResizeObserver(() => onResize());
			try {
				ro.observe(document.documentElement);
			} catch {
				// ignore
			}
		}

		// Attach listeners
		if ('addEventListener' in mqlDesktopMin) {
			// Modern browsers
			mqlDesktopMin.addEventListener('change', updateFromMql);
			mqlTabletMin.addEventListener('change', updateFromMql);
		} else {
			// Legacy Safari
			// deno-lint-ignore ban-ts-comment
			// @ts-ignore
			mqlDesktopMin.addListener(updateFromMql);
			// deno-lint-ignore ban-ts-comment
			// @ts-ignore
			mqlTabletMin.addListener(updateFromMql);
		}

		globalThis.addEventListener('resize', onResize);
		globalThis.addEventListener('orientationchange', onResize);

		// Set initial state
		const { width, height } = measure();
		apply(width, height);

		return () => {
			globalThis.removeEventListener('resize', onResize);
			globalThis.removeEventListener('orientationchange', onResize);
			if (ro) ro.disconnect();
			if ('removeEventListener' in mqlDesktopMin) {
				mqlDesktopMin.removeEventListener('change', updateFromMql);
				mqlTabletMin.removeEventListener('change', updateFromMql);
			} else {
				// deno-lint-ignore ban-ts-comment
				// @ts-ignore
				mqlDesktopMin.removeListener(updateFromMql);
				// deno-lint-ignore ban-ts-comment
				// @ts-ignore
				mqlTabletMin.removeListener(updateFromMql);
			}
		};
	}, [setViewport, setBreakpoint]);

	return <>{children}</>;
}

export default ResponsiveProvider;
