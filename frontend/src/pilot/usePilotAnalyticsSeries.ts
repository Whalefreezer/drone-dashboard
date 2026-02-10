import { useMemo } from 'react';
import type { PilotMetricSummary } from './pilot-hooks.ts';
import type { PilotRaceLapGroup, PilotTimelineLap } from './pilot-state.ts';
import { notNull } from './analyticsFormat.ts';
import { barPalette, type LapPoint, type OverlayPoint, type OverlaySeriesBundle, type OverlayToggleState } from './analyticsTypes.ts';
import { buildChartStructure } from './pilotAnalyticsChart.ts';

interface UsePilotAnalyticsSeriesParams {
	timeline: PilotTimelineLap[];
	lapGroups: PilotRaceLapGroup[];
	metrics: PilotMetricSummary;
	overlays: OverlayToggleState;
}

export function usePilotAnalyticsSeries({
	timeline,
	lapGroups,
	metrics,
	overlays,
}: UsePilotAnalyticsSeriesParams) {
	const lapPoints = useMemo<LapPoint[]>(() => {
		if (timeline.length === 0) return [];
		const firstTimestamp = timeline.find((lap) => lap.startTimestampMs != null)?.startTimestampMs ?? null;
		const raceOffsets = new Map<string, number>();
		let cumulativeOffset = 0;
		for (const group of lapGroups) {
			raceOffsets.set(group.race.id, cumulativeOffset);
			cumulativeOffset += 1.0;
		}
		return timeline.map((lap) => {
			const timeSeconds = lap.startTimestampMs != null && firstTimestamp != null ? (lap.startTimestampMs - firstTimestamp) / 1000 : null;
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
			return lapPoints.map((point) => ({ order: point.order, timeSeconds: point.timeSeconds, value: null }));
		}
		const window: number[] = [];
		let runningMin = Number.POSITIVE_INFINITY;
		return lapPoints.map((point) => {
			window.push(point.lapTime);
			if (window.length > consecutiveWindow) window.shift();
			if (window.length === consecutiveWindow) {
				const sum = window.reduce((acc, value) => acc + value, 0);
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

	const overlaySeries = useMemo<OverlaySeriesBundle>(() => ({
		bestLap: bestLapSeries,
		consecutive: consecutiveSeries,
		raceTotal: raceTotalSeries,
	}), [bestLapSeries, consecutiveSeries, raceTotalSeries]);

	const chartStructure = useMemo(
		() => buildChartStructure(lapPoints, overlaySeries),
		[lapPoints, overlaySeries],
	);

	const yDomain = useMemo(() => {
		const values = [...lapPoints.map((point) => point.lapTime)];

		if (overlays.bestLap) {
			values.push(...bestLapSeries.map((point) => point.value).filter(notNull));
		}
		if (overlays.consecutive) {
			values.push(...consecutiveSeries.map((point) => point.value).filter(notNull));
		}
		if (overlays.raceTotal) {
			values.push(...raceTotalSeries.map((point) => point.value).filter(notNull));
		}

		if (values.length === 0) return { min: 0, max: 1 };
		const min = Math.min(...values);
		const max = Math.max(...values);
		const span = max - min;
		const padding = span === 0 ? max * 0.1 || 1 : span * 0.1;
		return {
			min: 0,
			max: max + padding,
		};
	}, [
		lapPoints,
		overlays.bestLap,
		overlays.consecutive,
		overlays.raceTotal,
		bestLapSeries,
		consecutiveSeries,
		raceTotalSeries,
	]);

	return {
		lapPoints,
		consecutiveWindow,
		raceColorMap,
		chartStructure,
		yDomain,
	};
}
