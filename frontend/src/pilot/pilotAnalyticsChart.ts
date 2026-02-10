import type { EChartsOption, SeriesOption } from 'echarts';
import type { BarSeriesOption, LineSeriesOption } from 'echarts/charts';
import type { CallbackDataParams } from 'echarts/types/dist/shared';
import type { StreamLink } from '../stream/stream-utils.ts';
import type { PilotTimelineLap } from './pilot-state.ts';
import { formatDelta, formatSeconds } from './analyticsFormat.ts';
import {
	type ChartSlot,
	type ChartStructure,
	insideZoomId,
	type LapPoint,
	overlayColors,
	type OverlaySeriesBundle,
	type OverlayToggleState,
	sliderZoomId,
} from './analyticsTypes.ts';

type BarSeriesData = NonNullable<BarSeriesOption['data']>;
type LineSeriesData = NonNullable<LineSeriesOption['data']>;
type MarkLineData = NonNullable<NonNullable<BarSeriesOption['markLine']>['data']>;

interface ChartOptionParams {
	structure: ChartStructure;
	raceColorMap: Map<string, string>;
	overlays: OverlayToggleState;
	yDomain: { min: number; max: number };
	timeline: PilotTimelineLap[];
	getStreamLink: (timestamp: number | null) => StreamLink | null;
}

interface BestMarkerIndices {
	newBestLapIndices: Set<number>;
	newBestConsecutiveIndices: Set<number>;
	newBestRaceTotalIndices: Set<number>;
}

export function buildChartStructure(
	lapPoints: LapPoint[],
	overlaySeries: OverlaySeriesBundle,
): ChartStructure {
	const slots: ChartSlot[] = [];
	const raceIndexRanges = new Map<string, { start: number; end: number }>();
	let previousRaceId: string | null = null;

	lapPoints.forEach((point, index) => {
		if (previousRaceId && previousRaceId !== point.raceId) {
			slots.push({
				key: `gap-${previousRaceId}-${point.raceId}-${index}`,
				lap: null,
				barValue: null,
				overlays: { bestLap: null, consecutive: null, raceTotal: null },
			});
		}

		const slotIndex = slots.length;
		slots.push({
			key: point.id,
			lap: point,
			barValue: point.lapTime,
			overlays: {
				bestLap: overlaySeries.bestLap[index]?.value ?? null,
				consecutive: overlaySeries.consecutive[index]?.value ?? null,
				raceTotal: overlaySeries.raceTotal[index]?.value ?? null,
			},
		});

		const range = raceIndexRanges.get(point.raceId);
		if (!range) {
			raceIndexRanges.set(point.raceId, { start: slotIndex, end: slotIndex });
		} else {
			range.end = slotIndex;
		}

		previousRaceId = point.raceId;
	});

	return { slots, raceIndexRanges };
}

export function buildChartOption(
	{ structure, raceColorMap, overlays, yDomain, timeline, getStreamLink }: ChartOptionParams,
): EChartsOption {
	const categories = structure.slots.map((slot) => slot.key);
	const { newBestLapIndices, newBestConsecutiveIndices, newBestRaceTotalIndices } = collectBestMarkerIndices(structure);

	const barSeriesData = structure.slots.map((slot, index) => {
		if (!slot.lap || slot.barValue == null) return { value: null };

		const isNewBestLap = newBestLapIndices.has(index);
		const isNewBestConsecutive = newBestConsecutiveIndices.has(index);
		const isNewBestRaceTotal = newBestRaceTotalIndices.has(index);

		let borderColor: string | undefined;
		if (isNewBestLap) {
			borderColor = '#71e0c9';
		} else if (isNewBestConsecutive) {
			borderColor = '#ffb347';
		} else if (isNewBestRaceTotal) {
			borderColor = '#71e0c9';
		}

		return {
			value: slot.barValue,
			itemStyle: {
				color: raceColorMap.get(slot.lap.raceId) ?? '#ffffff',
				borderColor,
				borderWidth: (isNewBestLap || isNewBestConsecutive || isNewBestRaceTotal) ? 2 : 0,
			},
		};
	}) as BarSeriesData;

	const buildLineSeries = (
		key: keyof ChartSlot['overlays'],
		name: string,
		color: string,
	): SeriesOption =>
		({
			type: 'line',
			name,
			data: structure.slots.map((slot) => slot.overlays[key]) as LineSeriesData,
			showSymbol: false,
			smooth: false,
			step: 'end',
			lineStyle: { width: 2, color },
			itemStyle: { color },
			connectNulls: true,
			z: 3,
		}) as SeriesOption;

	const tooltipFormatter = (params: CallbackDataParams | CallbackDataParams[]): string => {
		const items = Array.isArray(params) ? params : [params];
		const primary = items.find((item) => item.dataIndex != null);
		if (!primary || primary.dataIndex == null) return '';
		const slot = structure.slots[primary.dataIndex];
		if (!slot?.lap) return '';
		const datum = slot.lap;

		const originalLap = timeline.find((lap) => lap.id === datum.id);
		const timestamp = originalLap?.startTimestampMs ?? originalLap?.detectionTimestampMs ?? null;
		const dateTime = timestamp ? new Date(timestamp).toLocaleString() : 'Unknown time';
		const streamLink = getStreamLink(timestamp);
		const offsetLabel = streamLink && streamLink.offsetSeconds > 0 ? ` (+${streamLink.offsetSeconds}s)` : '';
		const timeLine = streamLink
			? `<div>${dateTime} — <a href="${streamLink.href}" target="_blank" rel="noreferrer">Watch ${streamLink.label}${offsetLabel}</a></div>`
			: `<div>${dateTime}</div>`;

		const isNewBestLap = newBestLapIndices.has(primary.dataIndex);
		const isNewBestConsecutive = newBestConsecutiveIndices.has(primary.dataIndex);
		const isNewBestRaceTotal = newBestRaceTotalIndices.has(primary.dataIndex);

		const statusMessages = [];
		if (isNewBestLap) {
			statusMessages.push('<div style="color: #71e0c9; font-weight: 600;">🏆 New best lap!</div>');
		}
		if (isNewBestConsecutive) {
			statusMessages.push('<div style="color: #ffb347; font-weight: 600;">🔥 New best consecutive!</div>');
		}
		if (isNewBestRaceTotal) {
			statusMessages.push('<div style="color: #71e0c9; font-weight: 600;">🏁 New best race total!</div>');
		}

		return [
			"<div class='pilot-tooltip'>",
			`<div class='pilot-tooltip-title'>${datum.raceLabel}</div>`,
			`<div>Lap ${datum.lapNumber}</div>`,
			`<div>${formatSeconds(datum.lapTime)}</div>`,
			`<div>Δ best: ${formatDelta(datum.deltaBest)}</div>`,
			timeLine,
			...statusMessages,
			'</div>',
		].join('');
	};

	const series: SeriesOption[] = [];
	const markLineData = buildMarkLineData(
		newBestLapIndices,
		newBestConsecutiveIndices,
		newBestRaceTotalIndices,
	);

	if (overlays.bars) {
		series.push({
			type: 'bar',
			name: 'Lap time',
			barWidth: '60%',
			data: barSeriesData,
			z: 2,
			emphasis: { focus: 'series' },
			markLine: overlays.markLines
				? {
					silent: true,
					label: { show: false },
					symbol: ['none', 'none'],
					data: markLineData,
				}
				: undefined,
		});
	} else if (overlays.markLines && markLineData.length > 0) {
		series.push({
			type: 'line',
			name: 'Best time markers',
			data: structure.slots.map(() => null),
			showSymbol: false,
			lineStyle: { width: 0, opacity: 0 },
			itemStyle: { opacity: 0 },
			silent: true,
			z: 1,
			markLine: {
				silent: true,
				label: { show: false },
				symbol: ['none', 'none'],
				data: markLineData,
			},
		});
	}

	if (overlays.bestLap) {
		series.push(buildLineSeries('bestLap', 'Best lap running', overlayColors.bestLap));
	}
	if (overlays.consecutive) {
		series.push(buildLineSeries('consecutive', 'Fastest consecutive', overlayColors.consecutive));
	}
	if (overlays.raceTotal) {
		series.push(buildLineSeries('raceTotal', 'Best race total', overlayColors.raceTotal));
	}

	return {
		backgroundColor: 'transparent',
		animation: false,
		grid: { left: 48, right: 48, top: 32, bottom: 72 },
		tooltip: {
			trigger: 'axis',
			renderMode: 'html',
			transitionDuration: 0,
			appendToBody: false,
			axisPointer: { type: 'shadow' },
			formatter: tooltipFormatter,
			enterable: true,
			extraCssText: 'box-shadow: none;',
		},
		xAxis: {
			type: 'category',
			data: categories,
			axisLabel: {
				show: true,
				color: '#ccc',
				fontSize: 12,
				formatter: (value: string) => {
					const slot = structure.slots.find((candidate) => candidate.key === value);
					if (!slot?.lap) return '';

					const raceId = slot.lap.raceId;
					const range = structure.raceIndexRanges.get(raceId);
					if (!range) return '';

					const middleIndex = Math.floor((range.start + range.end) / 2);
					const isMiddleLapOfRace = slot.key === structure.slots[middleIndex]?.key;
					return isMiddleLapOfRace ? slot.lap.raceLabel : '';
				},
				interval: 0,
			},
			axisTick: { show: false },
			axisLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.12)' } },
			splitLine: { show: false },
		},
		yAxis: {
			type: 'value',
			min: yDomain.min,
			max: yDomain.max,
			axisLine: { show: false },
			axisTick: { show: false },
			splitLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.08)' } },
			axisLabel: {
				color: '#ccc',
				formatter: (value: number) => formatSeconds(Number(value)),
			},
		},
		dataZoom: [
			{
				type: 'slider',
				id: sliderZoomId,
				filterMode: 'none',
				bottom: 16,
				height: 20,
				handleSize: 16,
				borderColor: 'rgba(255, 255, 255, 0.16)',
				textStyle: { color: '#ccc' },
			},
			{
				type: 'inside',
				id: insideZoomId,
				filterMode: 'none',
			},
			{
				show: true,
				yAxisIndex: 0,
				filterMode: 'none',
				width: 30,
				height: '80%',
				showDataShadow: false,
				right: '0%',
			},
		],
		series,
	} satisfies EChartsOption;
}

function collectBestMarkerIndices(structure: ChartStructure): BestMarkerIndices {
	const newBestLapIndices = new Set<number>();
	let runningBestTime = Number.POSITIVE_INFINITY;

	const newBestConsecutiveIndices = new Set<number>();
	let runningBestConsecutive = Number.POSITIVE_INFINITY;

	const newBestRaceTotalIndices = new Set<number>();
	let runningBestRaceTotal = Number.POSITIVE_INFINITY;

	structure.slots.forEach((slot, index) => {
		if (!slot.lap || slot.barValue == null) return;

		if (slot.lap.lapTime < runningBestTime) {
			runningBestTime = slot.lap.lapTime;
			newBestLapIndices.add(index);
		}

		const consecutiveValue = slot.overlays.consecutive;
		if (consecutiveValue != null && consecutiveValue < runningBestConsecutive) {
			runningBestConsecutive = consecutiveValue;
			newBestConsecutiveIndices.add(index);
		}

		const raceTotalValue = slot.overlays.raceTotal;
		if (raceTotalValue != null && raceTotalValue < runningBestRaceTotal) {
			runningBestRaceTotal = raceTotalValue;
			newBestRaceTotalIndices.add(index);
		}
	});

	return {
		newBestLapIndices,
		newBestConsecutiveIndices,
		newBestRaceTotalIndices,
	};
}

function buildMarkLineData(
	newBestLapIndices: Set<number>,
	newBestConsecutiveIndices: Set<number>,
	newBestRaceTotalIndices: Set<number>,
): MarkLineData {
	const markLineData: MarkLineData = [];
	for (const index of newBestLapIndices) {
		markLineData.push({
			xAxis: index,
			lineStyle: { color: '#71e0c9', width: 2, type: 'dashed' },
		});
	}
	for (const index of newBestConsecutiveIndices) {
		if (!newBestLapIndices.has(index)) {
			markLineData.push({
				xAxis: index,
				lineStyle: { color: '#ffb347', width: 2, type: 'dashed' },
			});
		}
	}
	for (const index of newBestRaceTotalIndices) {
		if (!newBestLapIndices.has(index) && !newBestConsecutiveIndices.has(index)) {
			markLineData.push({
				xAxis: index,
				lineStyle: { color: '#71e0c9', width: 2, type: 'dashed' },
			});
		}
	}
	return markLineData;
}
