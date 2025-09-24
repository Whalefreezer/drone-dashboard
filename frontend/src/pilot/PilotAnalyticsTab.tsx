import { useContext, useEffect, useMemo, useState } from 'react';
import { ParentSize } from '@visx/responsive';
import { Axis, DataContext, GlyphSeries, Grid, LineSeries, Tooltip, XYChart } from '@visx/xychart';
import { curveLinear, curveStepAfter } from 'd3-shape';
import { scaleLinear } from '@visx/scale';
import { Zoom } from '@visx/zoom';
import type { TransformMatrix } from '@visx/zoom/lib/types';
import type { PilotRaceLapGroup, PilotTimelineLap } from './pilot-state.ts';
import type { PilotMetricSummary } from './pilot-hooks.ts';

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

type AxisMode = 'order' | 'time';

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

type RaceBand = {
	raceId: string;
	label: string;
	color: string;
	startOrder: number;
	endOrder: number;
	startTime: number | null;
	endTime: number | null;
};

type ZoomDomain = { x: [number, number]; y: [number, number] };

const formatSeconds = (time: number): string => `${time.toFixed(3)}s`;

const formatDelta = (delta: number | null): string => {
	if (delta == null || Number.isNaN(delta)) return '—';
	const sign = delta === 0 ? '' : delta > 0 ? '+' : '−';
	return `${sign}${Math.abs(delta).toFixed(3)}s`;
};

const notNull = (value: number | null | undefined): value is number => value != null && !Number.isNaN(value);

const computeZoomDomain = (
	matrix: TransformMatrix,
	width: number,
	height: number,
	initial: ZoomDomain,
): ZoomDomain => {
	const baseX = scaleLinear({ domain: initial.x, range: [0, width] });
	const baseY = scaleLinear({ domain: initial.y, range: [height, 0] });
	const topLeft = { x: matrix.translateX, y: matrix.translateY };
	const bottomRight = {
		x: matrix.translateX + width * matrix.scaleX,
		y: matrix.translateY + height * matrix.scaleY,
	};
	const newX0 = baseX.invert(topLeft.x);
	const newX1 = baseX.invert(bottomRight.x);
	const newY0 = baseY.invert(bottomRight.y);
	const newY1 = baseY.invert(topLeft.y);
	const clampX0 = Math.max(initial.x[0], Math.min(initial.x[1], newX0));
	const clampX1 = Math.max(initial.x[0], Math.min(initial.x[1], newX1));
	const clampY0 = Math.max(initial.y[0], Math.min(initial.y[1], newY0));
	const clampY1 = Math.max(initial.y[0], Math.min(initial.y[1], newY1));
	const xSpan = Math.max(1e-6, Math.abs(clampX1 - clampX0));
	const ySpan = Math.max(1e-6, Math.abs(clampY1 - clampY0));
	return {
		x: [Math.min(clampX0, clampX1), Math.min(clampX0, clampX1) + xSpan],
		y: [Math.min(clampY0, clampY1), Math.min(clampY0, clampY1) + ySpan],
	};
};

interface PilotAnalyticsTabProps {
	pilotId: string;
	timeline: PilotTimelineLap[];
	lapGroups: PilotRaceLapGroup[];
	metrics: PilotMetricSummary;
}

export function PilotAnalyticsTab(
	{ timeline, lapGroups, metrics }: PilotAnalyticsTabProps,
) {
	const [axisMode, setAxisMode] = useState<AxisMode>('order');
	const [overlays, setOverlays] = useState({ bestLap: true, consecutive: false, raceTotal: false });

	const lapPoints = useMemo<LapPoint[]>(() => {
		if (timeline.length === 0) return [];
		const firstTimestamp = timeline.find((lap) => lap.detectionTimestampMs != null)?.detectionTimestampMs ?? null;
		return timeline.map((lap) => {
			const timeSeconds = lap.detectionTimestampMs != null && firstTimestamp != null
				? (lap.detectionTimestampMs - firstTimestamp) / 1000
				: null;
			return {
				id: lap.id,
				order: lap.overallIndex + 1,
				timeSeconds,
				lapTime: lap.lengthSeconds,
				raceId: lap.raceId,
				raceLabel: lap.raceLabel,
				lapNumber: lap.lapNumber,
				deltaBest: metrics.bestLapTimeSeconds != null ? lap.lengthSeconds - metrics.bestLapTimeSeconds : null,
			};
		});
	}, [timeline, metrics.bestLapTimeSeconds]);

	const supportsTimeAxis = useMemo(() => lapPoints.filter((p) => p.timeSeconds != null).length >= 2, [lapPoints]);

	useEffect(() => {
		if (!supportsTimeAxis) setAxisMode('order');
	}, [supportsTimeAxis]);

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

	const bands = useMemo<RaceBand[]>(() => {
		if (lapPoints.length === 0) return [];
		const map = new Map<string, LapPoint[]>();
		lapPoints.forEach((point) => {
			const current = map.get(point.raceId);
			if (current) current.push(point);
			else map.set(point.raceId, [point]);
		});
		let colorIndex = 0;
		const results: RaceBand[] = [];
		for (const group of lapGroups) {
			const groupPoints = map.get(group.race.id);
			if (!groupPoints || groupPoints.length === 0) continue;
			const orders = groupPoints.map((p) => p.order);
			const times = groupPoints.map((p) => p.timeSeconds).filter(notNull);
			const color = bandPalette[colorIndex % bandPalette.length];
			colorIndex++;
			results.push({
				raceId: group.race.id,
				label: group.race.label,
				color,
				startOrder: Math.min(...orders) - 0.5,
				endOrder: Math.max(...orders) + 0.5,
				startTime: times.length ? Math.min(...times) - 1 : null,
				endTime: times.length ? Math.max(...times) + 1 : null,
			});
		}
		return results;
	}, [lapGroups, lapPoints]);

	const dataForAxis = useMemo(() => (axisMode === 'time' ? lapPoints.filter((p) => p.timeSeconds != null) : lapPoints), [
		lapPoints,
		axisMode,
	]);

	const overlaySeries = useMemo(() => ({
		bestLap: bestLapSeries,
		consecutive: consecutiveSeries,
		raceTotal: raceTotalSeries,
	}), [bestLapSeries, consecutiveSeries, raceTotalSeries]);

	const initialDomain = useMemo<ZoomDomain>(() => {
		if (dataForAxis.length === 0) return { x: [0, 1], y: [0, 1] };
		const xValues = axisMode === 'order' ? dataForAxis.map((p) => p.order) : dataForAxis.map((p) => p.timeSeconds ?? 0);
		const overlayValues = Object.values(overlaySeries)
			.flatMap((series) => series.map((p) => p.value).filter(notNull));
		const yValues = [...dataForAxis.map((p) => p.lapTime), ...overlayValues];
		const xMin = Math.min(...xValues);
		const xMax = Math.max(...xValues);
		const yMin = Math.min(...yValues);
		const yMax = Math.max(...yValues);
		const xSpan = xMax - xMin;
		const ySpan = yMax - yMin || 1;
		return {
			x: [xMin, xMax + (xSpan === 0 ? 1 : 0)],
			y: [Math.max(0, yMin - ySpan * 0.1), yMax + ySpan * 0.1],
		};
	}, [dataForAxis, overlaySeries, axisMode]);

	if (lapPoints.length === 0) {
		return <div className='pilot-empty-state'>No laps recorded yet.</div>;
	}

	const axisAccessor = axisMode === 'order'
		? (point: { order: number }) => point.order
		: (point: { timeSeconds: number | null }) => point.timeSeconds ?? 0;

	const overlayFilter = (series: OverlayPoint[]) =>
		series.filter((item) => {
			if (!notNull(item.value)) return false;
			if (axisMode === 'time') return item.timeSeconds != null;
			return true;
		});

	const filteredSeries = {
		bestLap: overlayFilter(overlaySeries.bestLap),
		consecutive: overlayFilter(overlaySeries.consecutive),
		raceTotal: overlayFilter(overlaySeries.raceTotal),
	};

	const onToggleOverlay = (key: keyof typeof overlays) => {
		setOverlays((prev) => ({ ...prev, [key]: !prev[key] }));
	};

	return (
		<div className='pilot-analytics-tab'>
			<div className='pilot-analytics-controls'>
				<div className='pilot-axis-toggle' role='group' aria-label='X axis mode'>
					<button
						type='button'
						className={axisMode === 'order' ? 'active' : ''}
						onClick={() => setAxisMode('order')}
					>
						Lap order
					</button>
					<button
						type='button'
						className={axisMode === 'time' ? 'active' : ''}
						disabled={!supportsTimeAxis}
						onClick={() => supportsTimeAxis && setAxisMode('time')}
					>
						Detection time
					</button>
				</div>
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
				<ParentSize>
					{({ width, height }) => {
						if (width === 0 || height === 0) return null;
						const zoomKey = `${initialDomain.x.join(':')}|${initialDomain.y.join(':')}`;
						return (
							<Zoom<HTMLDivElement>
								key={zoomKey}
								width={width}
								height={height}
								scaleXMin={1}
								scaleXMax={50}
								scaleYMin={1}
								scaleYMax={50}
							>
								{(zoom) => {
									const handleReset = () => {
										zoom.reset();
									};
									const domain = computeZoomDomain(zoom.transformMatrix, width, height, initialDomain);
									return (
										<div className='pilot-analytics-chart-wrapper'>
											<XYChart
												height={height}
												width={width}
												xScale={{ type: 'linear', domain: domain.x }}
												yScale={{ type: 'linear', domain: domain.y }}
											>
												<RaceBands bands={bands} axisMode={axisMode} />
												<Grid columns numTicks={6} stroke='rgba(255,255,255,0.08)' />
												<Axis
													hideAxisLine
													orientation='bottom'
													tickValues={bands.map((band) => (band.startOrder + band.endOrder) / 2)}
													tickFormat={(value, index) => bands[index]?.label || ''}
												/>
												<Axis
													orientation='left'
													hideAxisLine
													tickFormat={(value) => formatSeconds(Number(value))}
												/>
												<LineSeries
													dataKey='Lap time'
													data={dataForAxis}
													xAccessor={axisAccessor}
													yAccessor={(d) => d.lapTime}
													stroke='#ffffff'
													curve={curveLinear}
												/>
												<GlyphSeries
													dataKey='Lap markers'
													data={dataForAxis}
													xAccessor={axisAccessor}
													yAccessor={(d) => d.lapTime}
													renderGlyph={({ x, y, key }) => (
														<circle
															key={key}
															cx={x ?? 0}
															cy={y ?? 0}
															r={3.5}
															fill='#1f2330'
															stroke='#9ba3ff'
															strokeWidth={1.5}
														/>
													)}
												/>
												{overlays.bestLap && filteredSeries.bestLap.length > 0 && (
													<LineSeries
														dataKey='Best lap running'
														data={filteredSeries.bestLap}
														xAccessor={axisAccessor}
														yAccessor={(d) => d.value ?? 0}
														stroke={overlayColors.bestLap}
														curve={curveLinear}
													/>
												)}
												{overlays.consecutive && filteredSeries.consecutive.length > 0 && (
													<LineSeries
														dataKey='Fastest consecutive'
														data={filteredSeries.consecutive}
														xAccessor={axisAccessor}
														yAccessor={(d) => d.value ?? 0}
														stroke={overlayColors.consecutive}
														curve={curveLinear}
													/>
												)}
												{overlays.raceTotal && filteredSeries.raceTotal.length > 0 && (
													<LineSeries
														dataKey='Best race total'
														data={filteredSeries.raceTotal}
														xAccessor={axisAccessor}
														yAccessor={(d) => d.value ?? 0}
														stroke={overlayColors.raceTotal}
														curve={curveStepAfter}
													/>
												)}
												<Tooltip<LapPoint>
													snapTooltipToDatumX
													snapTooltipToDatumY
													showVerticalCrosshair
													renderTooltip={({ tooltipData }) => {
														const datum = tooltipData?.nearestDatum?.datum as LapPoint | undefined;
														if (!datum) return null;
														return (
															<div className='pilot-tooltip'>
																<div className='pilot-tooltip-title'>{datum.raceLabel}</div>
																<div>Lap {datum.lapNumber}</div>
																<div>{formatSeconds(datum.lapTime)}</div>
																<div>Δ best: {formatDelta(datum.deltaBest)}</div>
															</div>
														);
													}}
												/>
											</XYChart>

											<div
												ref={zoom.containerRef}
												className={`pilot-zoom-overlay${zoom.isDragging ? ' dragging' : ''}`}
												style={{ touchAction: 'none', cursor: zoom.isDragging ? 'grabbing' : 'grab' }}
												onMouseDown={zoom.dragStart}
												onMouseMove={zoom.dragMove}
												onMouseUp={zoom.dragEnd}
												onMouseLeave={zoom.dragEnd}
												onTouchStart={zoom.dragStart}
												onTouchMove={zoom.dragMove}
												onTouchEnd={zoom.dragEnd}
												onWheel={zoom.handleWheel}
											/>

											<div className='pilot-analytics-toolbar'>
												<button type='button' onClick={handleReset}>Reset view</button>
											</div>
										</div>
									);
								}}
							</Zoom>
						);
					}}
				</ParentSize>
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

function RaceBands({ bands, axisMode }: { bands: RaceBand[]; axisMode: AxisMode }) {
	const context = useContext(DataContext);
	const xScale = context?.xScale;
	const innerHeight = context?.innerHeight;
	const marginTop = context?.margin?.top ?? 0;
	if (!xScale || innerHeight == null) return null;
	return (
		<g className='pilot-race-bands'>
			{bands.map((band) => {
				const startValue = axisMode === 'order' ? band.startOrder : band.startTime;
				const endValue = axisMode === 'order' ? band.endOrder : band.endTime;
				if (startValue == null || endValue == null) return null;
				const rawStart = xScale(startValue as number);
				const rawEnd = xScale(endValue as number);
				if (rawStart == null || rawEnd == null) return null;
				const startPosition = Number(rawStart);
				const endPosition = Number(rawEnd);
				if (!Number.isFinite(startPosition) || !Number.isFinite(endPosition)) return null;
				const width = Math.abs(endPosition - startPosition);
				if (width <= 0) return null;
				return (
					<rect
						key={band.raceId}
						x={Math.min(startPosition, endPosition)}
						width={width}
						y={marginTop}
						height={innerHeight}
						fill={band.color}
						rx={4}
						ry={4}
					/>
				);
			})}
		</g>
	);
}
