import type { Breakpoint, BreakpointThresholds } from './breakpoints.ts';

export function computeBreakpoint(width: number, cfg: BreakpointThresholds): Breakpoint {
	if (width >= cfg.desktopMin) return 'desktop';
	if (width >= cfg.tabletMin) return 'tablet';
	return 'mobile';
}
