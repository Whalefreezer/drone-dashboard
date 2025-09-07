import { useAtomValue } from 'jotai';
import { breakpointAtom, viewportAtom } from './atoms.ts';
import type { Breakpoint } from './breakpoints.ts';

export interface BreakpointInfo {
	breakpoint: Breakpoint;
	isMobile: boolean;
	isTablet: boolean;
	isDesktop: boolean;
	width: number;
	height: number;
}

export function useBreakpoint(): BreakpointInfo {
	const bp = useAtomValue(breakpointAtom);
	const { width, height } = useAtomValue(viewportAtom);
	return {
		breakpoint: bp,
		isMobile: bp === 'mobile',
		isTablet: bp === 'tablet',
		isDesktop: bp === 'desktop',
		width,
		height,
	};
}

export default useBreakpoint;
