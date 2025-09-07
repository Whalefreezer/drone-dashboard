import { describe, it } from '@std/testing/bdd';
import { assertEquals } from '@std/assert';
import { computeBreakpoint } from './computeBreakpoint.ts';
import { defaultBreakpointThresholds as cfg } from './breakpoints.ts';

// Basic unit tests validating the width → breakpoint mapping
describe('computeBreakpoint', () => {
	it('maps to mobile below tabletMin', () => {
		assertEquals(computeBreakpoint(0, cfg), 'mobile');
		assertEquals(computeBreakpoint(cfg.tabletMin - 1, cfg), 'mobile');
		assertEquals(computeBreakpoint(320, cfg), 'mobile');
	});

	it('maps to tablet for [tabletMin, desktopMin)', () => {
		assertEquals(computeBreakpoint(cfg.tabletMin, cfg), 'tablet');
		assertEquals(computeBreakpoint(cfg.desktopMin - 1, cfg), 'tablet');
		assertEquals(computeBreakpoint(800, cfg), 'tablet');
	});

	it('maps to desktop for >= desktopMin', () => {
		assertEquals(computeBreakpoint(cfg.desktopMin, cfg), 'desktop');
		assertEquals(computeBreakpoint(1600, cfg), 'desktop');
	});
});
