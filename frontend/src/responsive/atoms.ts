import { atom } from 'jotai';
import type { Breakpoint } from './breakpoints.ts';

export interface ViewportSize {
	width: number;
	height: number;
}

export const viewportAtom = atom<ViewportSize>({ width: 0, height: 0 });

export const breakpointAtom = atom<Breakpoint>('desktop');
