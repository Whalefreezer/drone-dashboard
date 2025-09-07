export type Breakpoint = 'mobile' | 'tablet' | 'desktop';

// Simplified thresholds: define only min-width cutoffs.
// mobile: width < tabletMin
// tablet: tabletMin <= width < desktopMin
// desktop: width >= desktopMin
export interface BreakpointThresholds {
	tabletMin: number; // inclusive
	desktopMin: number; // inclusive
}

export const defaultBreakpointThresholds: BreakpointThresholds = {
	tabletMin: 600,
	desktopMin: 960,
};
