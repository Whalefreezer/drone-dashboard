import { useEffect, useMemo, useRef, useState } from 'react';
import type { EChartsOption, EChartsType, SeriesOption } from 'echarts';
import type { CallbackDataParams } from 'echarts/types/dist/shared';
import { EChart } from './EChart.tsx';
import type { PilotMetricSummary } from './pilot-hooks.ts';
import type { PilotRaceLapGroup, PilotTimelineLap } from './pilot-state.ts';

const overlayColors = {
	bestLap: '#9ba3ff',
	consecutive: '#ffb347',
	raceTotal: '#71e0c9',
} as const;

const bandPalette = [
	'rgba(155, 163, 255, 0.16)',
	'rgba(155, 210, 255, 0.14)',
	'rgba(255, 173, 226, 0.14)',
	'rgba(190, 255, 201, 0.14)',
	'rgba(255, 214, 165, 0.12)',
];

const barPalette = [
	'#9ba3ff',
	'#9bd2ff',
	'#ffade2',
	'#beffc9',
	'#ffd6a5',
	'#a5d6ff',
	'#ffb3ba',
	'#baffc9',
];

type LapPoint = {
	id: string;
	order: number;
	timeSeconds: number | null;
	lapTime: number;
	raceId: string;
	raceLabel: string;
	lapNumber: number;
	deltaBest: number | null;
};

type OverlayPoint = {
	order: number;
	timeSeconds: number | null;
	value: number | null;
};

type ChartSlot = {
	key: string;
	lap: LapPoint | null;
	barValue: number | null;
	overlays: {
		bestLap: number | null;
		consecutive: number | null;
		raceTotal: number | null;
	};
};

const sliderZoomId = 'pilot-analytics-slider-zoom';
const insideZoomId = 'pilot-analytics-inside-zoom';

const formatSeconds = (time: number): string => `${time.toFixed(3)}s`;

const formatDelta = (delta: number | null): string => {
	if (delta == null || Number.isNaN(delta)) return '—';
	const sign = delta === 0 ? '' : delta > 0 ? '+' : '−';
	return `${sign}${Math.abs(delta).toFixed(3)}s`;
};

const notNull = (value: number | null | undefined): value is number => value != null && !Number.isNaN(value);

interface PilotAnalyticsTabProps {
	pilotId: string;
	timeline: PilotTimelineLap[];
	lapGroups: PilotRaceLapGroup[];
	metrics: PilotMetricSummary;
}

export function PilotAnalyticsTab(
	{ timeline, lapGroups, metrics }: PilotAnalyticsTabProps,
) {
	const [overlays, setOverlays] = useState({ bestLap: true, consecutive: false, raceTotal: false });
	const chartInstanceRef = useRef<EChartsType | null>(null);

	useEffect(() => () => {
		chartInstanceRef.current = null;
	}, []);

	const lapPoints = useMemo<LapPoint[]>(() => {
		if (timeline.length === 0) return [];
		const firstTimestamp = timeline.find((lap) => lap.detectionTimestampMs != null)?.detectionTimestampMs ?? null;
		const raceOffsets = new Map<string, number>();
		let cumulativeOffset = 0;
		for (const group of lapGroups) {
			raceOffsets.set(group.race.id, cumulativeOffset);
			cumulativeOffset += 1.0;
		}
		return timeline.map((lap) => {
			const timeSeconds = lap.detectionTimestampMs != null && firstTimestamp != null
				? (lap.detectionTimestampMs - firstTimestamp) / 1000
				: null;
			const raceOffset = raceOffsets.get(lap.raceId) ?? 0;
			return {
				id: lap.id,
				order: lap.overallIndex + 1 + raceOffset,
				timeSeconds,
				lapTime: lap.lengthSeconds,
				raceId: lap.raceId,
				raceLabel: lap.raceLabel,
				lapNumber: lap.lapNumber,
				deltaBest: metrics.bestLapTimeSeconds != null ? lap.lengthSeconds - metrics.bestLapTimeSeconds : null,
			};
		});
	}, [timeline, lapGroups, metrics.bestLapTimeSeconds]);

	const bestLapSeries = useMemo<OverlayPoint[]>(() => {
		let runningMin = Number.POSITIVE_INFINITY;
		return lapPoints.map((point) => {
			runningMin = Math.min(runningMin, point.lapTime);
			return {
				order: point.order,
				timeSeconds: point.timeSeconds,
				value: Number.isFinite(runningMin) ? runningMin : null,
			};
		});
	}, [lapPoints]);

	const consecutiveWindow = metrics.fastestConsecutive?.lapWindow ?? 0;
	const consecutiveSeries = useMemo<OverlayPoint[]>(() => {
		if (!consecutiveWindow || consecutiveWindow <= 1) {
			return lapPoints.map((pt) => ({ order: pt.order, timeSeconds: pt.timeSeconds, value: null }));
		}
		const window: number[] = [];
		let runningMin = Number.POSITIVE_INFINITY;
		return lapPoints.map((point) => {
			window.push(point.lapTime);
			if (window.length > consecutiveWindow) window.shift();
			if (window.length === consecutiveWindow) {
				const sum = window.reduce((acc, val) => acc + val, 0);
				runningMin = Math.min(runningMin, sum);
				return { order: point.order, timeSeconds: point.timeSeconds, value: runningMin };
			}
			return { order: point.order, timeSeconds: point.timeSeconds, value: null };
		});
	}, [consecutiveWindow, lapPoints]);

	const completionMap = useMemo(() => {
		const map = new Map<string, number>();
		for (const group of lapGroups) {
			const target = group.race.targetLaps ?? 0;
			const holeshot = group.holeshot;
			if (!target || !holeshot) continue;
			if (group.laps.length < target) continue;
			const totalTime = holeshot.lengthSeconds + group.laps.slice(0, target).reduce((acc, lap) => acc + lap.lengthSeconds, 0);
			const completionLap = group.laps[target - 1];
			map.set(completionLap.id, totalTime);
		}
		return map;
	}, [lapGroups]);

	const raceTotalSeries = useMemo<OverlayPoint[]>(() => {
		let runningMin = Number.POSITIVE_INFINITY;
		return lapPoints.map((point) => {
			const completion = completionMap.get(point.id);
			if (completion != null) runningMin = Math.min(runningMin, completion);
			return {
				order: point.order,
				timeSeconds: point.timeSeconds,
				value: Number.isFinite(runningMin) ? runningMin : null,
			};
		});
	}, [lapPoints, completionMap]);

	const raceColorMap = useMemo(() => {
		const map = new Map<string, string>();
		let colorIndex = 0;
		for (const group of lapGroups) {
			const color = barPalette[colorIndex % barPalette.length];
			map.set(group.race.id, color);
			colorIndex++;
		}
		return map;
	}, [lapGroups]);

	const raceBandColorMap = useMemo(() => {
		const map = new Map<string, string>();
		let colorIndex = 0;
		for (const group of lapGroups) {
			const color = bandPalette[colorIndex % bandPalette.length];
			map.set(group.race.id, color);
			colorIndex++;
		}
		return map;
	}, [lapGroups]);

	const chartStructure = useMemo(() => {
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
					bestLap: bestLapSeries[index]?.value ?? null,
					consecutive: consecutiveSeries[index]?.value ?? null,
					raceTotal: raceTotalSeries[index]?.value ?? null,
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
	}, [bestLapSeries, consecutiveSeries, lapPoints, raceTotalSeries]);

	const yDomain = useMemo(() => {
		const values = [
			...lapPoints.map((p) => p.lapTime),
			...bestLapSeries.map((p) => p.value).filter(notNull),
			...consecutiveSeries.map((p) => p.value).filter(notNull),
			...raceTotalSeries.map((p) => p.value).filter(notNull),
		];
		if (values.length === 0) return { min: 0, max: 1 };
		const min = Math.min(...values);
		const max = Math.max(...values);
		const span = max - min;
		const padding = span === 0 ? min * 0.1 || 1 : span * 0.1;
		return {
			min: Math.max(0, min - padding),
			max: max + padding,
		};
	}, [lapPoints, bestLapSeries, consecutiveSeries, raceTotalSeries]);

	const markAreaData = useMemo(() => {
		const data: [Record<string, unknown>, Record<string, unknown>][] = [];
		for (const [raceId, range] of chartStructure.raceIndexRanges.entries()) {
			const startSlot = chartStructure.slots[range.start];
			const endSlot = chartStructure.slots[range.end];
			if (!startSlot || !endSlot) continue;
			const raceLabel = lapGroups.find((group) => group.race.id === raceId)?.race.label ?? '';
			data.push([
				{ xAxis: startSlot.key },
				{
					xAxis: endSlot.key,
					itemStyle: { color: raceBandColorMap.get(raceId) ?? 'rgba(255, 255, 255, 0.05)' },
					label: {
						show: true,
						formatter: raceLabel,
						color: '#d7dcff',
						fontSize: 12,
					},
				},
			]);
		}
		return data;
	}, [chartStructure, lapGroups, raceBandColorMap]) as NonNullable<SeriesOption['markArea']>['data'];

	const chartOption = useMemo<EChartsOption>(() => {
		const categories = chartStructure.slots.map((slot) => slot.key);
		const barSeriesData = chartStructure.slots.map((slot) => {
			if (!slot.lap || slot.barValue == null) return { value: null };
			return {
				value: slot.barValue,
				itemStyle: {
					color: raceColorMap.get(slot.lap.raceId) ?? '#ffffff',
				},
			};
		});

		const buildLineSeries = (key: keyof ChartSlot['overlays'], name: string, color: string): SeriesOption =>
			({
				type: 'line',
				name,
				data: chartStructure.slots.map((slot) => slot.overlays[key]),
				showSymbol: false,
				smooth: false,
				lineStyle: {
					width: 2,
					color,
				},
				itemStyle: { color },
				connectNulls: false,
				z: 3,
			}) as SeriesOption;

		const tooltipFormatter = (params: CallbackDataParams | CallbackDataParams[]): string => {
			const items = Array.isArray(params) ? params : [params];
			const primary = items.find((item) => item.seriesType === 'bar' && item.dataIndex != null);
			if (!primary || primary.dataIndex == null) return '';
			const slot = chartStructure.slots[primary.dataIndex];
			if (!slot?.lap) return '';
			const datum = slot.lap;
			return [
				"<div class='pilot-tooltip'>",
				`<div class='pilot-tooltip-title'>${datum.raceLabel}</div>`,
				`<div>Lap ${datum.lapNumber}</div>`,
				`<div>${formatSeconds(datum.lapTime)}</div>`,
				`<div>Δ best: ${formatDelta(datum.deltaBest)}</div>`,
				'</div>',
			].join('');
		};

		const baseBarSeries: SeriesOption = {
			type: 'bar',
			name: 'Lap time',
			barWidth: '60%',
			data: barSeriesData,
			z: 2,
			markArea: {
				silent: true,
				data: markAreaData,
			},
			emphasis: {
				focus: 'series',
			},
		};
		const series: SeriesOption[] = [baseBarSeries];

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
			grid: { left: 48, right: 16, top: 32, bottom: 72 },
			tooltip: {
				trigger: 'axis',
				renderMode: 'html',
				appendToBody: false,
				axisPointer: { type: 'shadow' },
				formatter: tooltipFormatter,
				extraCssText: 'box-shadow: none;',
			},
			xAxis: {
				type: 'category',
				data: categories,
				axisLabel: { show: false },
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
					bottom: 16,
					height: 20,
					handleSize: 16,
					borderColor: 'rgba(255, 255, 255, 0.16)',
					textStyle: { color: '#ccc' },
				},
				{
					type: 'inside',
					id: insideZoomId,
				},
			],
			animation: false,
			series,
		} satisfies EChartsOption;
	}, [chartStructure, markAreaData, overlays.bestLap, overlays.consecutive, overlays.raceTotal, raceColorMap, yDomain.min, yDomain.max]);

	const onToggleOverlay = (key: keyof typeof overlays) => {
		setOverlays((prev) => ({ ...prev, [key]: !prev[key] }));
	};

	const handleResetZoom = () => {
		const chart = chartInstanceRef.current;
		if (!chart) return;
		chart.dispatchAction({ type: 'dataZoom', dataZoomId: sliderZoomId, start: 0, end: 100 });
		chart.dispatchAction({ type: 'dataZoom', dataZoomId: insideZoomId, start: 0, end: 100 });
	};

	if (lapPoints.length === 0) {
		return <div className='pilot-empty-state'>No laps recorded yet.</div>;
	}

	return (
		<div className='pilot-analytics-tab'>
			<div className='pilot-analytics-controls'>
				<div className='pilot-overlay-toggles'>
					<OverlayToggle
						label='Best lap (running)'
						checked={overlays.bestLap}
						color={overlayColors.bestLap}
						onChange={() => onToggleOverlay('bestLap')}
					/>
					<OverlayToggle
						label='Fastest consecutive'
						checked={overlays.consecutive}
						color={overlayColors.consecutive}
						onChange={() => onToggleOverlay('consecutive')}
					/>
					<OverlayToggle
						label='Best race total'
						checked={overlays.raceTotal}
						color={overlayColors.raceTotal}
						onChange={() => onToggleOverlay('raceTotal')}
					/>
				</div>
			</div>

			<div className='pilot-analytics-chart-area'>
				<div className='pilot-analytics-chart-wrapper'>
					<EChart
						option={chartOption}
						onReady={(chart) => {
							chartInstanceRef.current = chart;
						}}
						className='pilot-analytics-chart'
					/>
					<div className='pilot-analytics-toolbar'>
						<button type='button' onClick={handleResetZoom}>Reset view</button>
					</div>
				</div>
			</div>
		</div>
	);
}

function OverlayToggle(
	{ label, checked, onChange, color }: { label: string; checked: boolean; onChange: () => void; color: string },
) {
	return (
		<label className='pilot-overlay-toggle'>
			<input type='checkbox' checked={checked} onChange={onChange} />
			<span className='pilot-overlay-color' style={{ backgroundColor: color }} />
			{label}
		</label>
	);
}
