export const overlayColors = {
	bestLap: '#9ba3ff',
	consecutive: '#ffb347',
	raceTotal: '#71e0c9',
} as const;

export const barPalette = [
	'#9ba3ff',
	'#9bd2ff',
	'#ffade2',
	'#beffc9',
	'#ffd6a5',
	'#a5d6ff',
	'#ffb3ba',
	'#baffc9',
];

export const sliderZoomId = 'pilot-analytics-slider-zoom';
export const insideZoomId = 'pilot-analytics-inside-zoom';

export type LapPoint = {
	id: string;
	order: number;
	timeSeconds: number | null;
	lapTime: number;
	raceId: string;
	raceLabel: string;
	lapNumber: number;
	deltaBest: number | null;
};

export type OverlayPoint = {
	order: number;
	timeSeconds: number | null;
	value: number | null;
};

export type ChartSlot = {
	key: string;
	lap: LapPoint | null;
	barValue: number | null;
	overlays: {
		bestLap: number | null;
		consecutive: number | null;
		raceTotal: number | null;
	};
};

export type OverlayToggleState = {
	bestLap: boolean;
	consecutive: boolean;
	raceTotal: boolean;
	bars: boolean;
	markLines: boolean;
};

export interface OverlaySeriesBundle {
	bestLap: OverlayPoint[];
	consecutive: OverlayPoint[];
	raceTotal: OverlayPoint[];
}

export interface ChartStructure {
	slots: ChartSlot[];
	raceIndexRanges: Map<string, { start: number; end: number }>;
}
