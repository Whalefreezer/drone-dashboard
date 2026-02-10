import { useEffect, useMemo, useRef, useState } from 'react';
import { useAtomValue } from 'jotai';
import type { EChartsType } from 'echarts';
import { EChart } from './EChart.tsx';
import type { PilotMetricSummary } from './pilot-hooks.ts';
import type { PilotRaceLapGroup, PilotTimelineLap } from './pilot-state.ts';
import { streamVideoRangesAtom } from '../state/pbAtoms.ts';
import { buildStreamLinkForTimestamp } from '../stream/stream-utils.ts';
import { insideZoomId, overlayColors, type OverlayToggleState, sliderZoomId } from './analyticsTypes.ts';
import { buildChartOption } from './pilotAnalyticsChart.ts';
import { usePilotAnalyticsSeries } from './usePilotAnalyticsSeries.ts';

interface PilotAnalyticsTabProps {
	pilotId: string;
	timeline: PilotTimelineLap[];
	lapGroups: PilotRaceLapGroup[];
	metrics: PilotMetricSummary;
}

export function PilotAnalyticsTab(
	{ timeline, lapGroups, metrics }: PilotAnalyticsTabProps,
) {
	const [overlays, setOverlays] = useState<OverlayToggleState>({
		bestLap: false,
		consecutive: false,
		raceTotal: false,
		bars: true,
		markLines: true,
	});
	const chartInstanceRef = useRef<EChartsType | null>(null);
	const streamRanges = useAtomValue(streamVideoRangesAtom);
	const getStreamLink = useMemo(
		() => (timestamp: number | null) => buildStreamLinkForTimestamp(streamRanges, timestamp),
		[streamRanges],
	);

	useEffect(() => () => {
		chartInstanceRef.current = null;
	}, []);

	const {
		lapPoints,
		consecutiveWindow,
		raceColorMap,
		chartStructure,
		yDomain,
	} = usePilotAnalyticsSeries({
		timeline,
		lapGroups,
		metrics,
		overlays,
	});

	const chartOption = useMemo(
		() =>
			buildChartOption({
				structure: chartStructure,
				raceColorMap,
				overlays,
				yDomain,
				timeline,
				getStreamLink,
			}),
		[
			chartStructure,
			raceColorMap,
			overlays.bars,
			overlays.bestLap,
			overlays.consecutive,
			overlays.raceTotal,
			overlays.markLines,
			yDomain.min,
			yDomain.max,
			timeline,
			getStreamLink,
		],
	);

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
						label='Lap times'
						checked={overlays.bars}
						color='#ffffff'
						onChange={() => onToggleOverlay('bars')}
					/>
					<OverlayToggle
						label='Best time markers'
						checked={overlays.markLines}
						color='#71e0c9'
						onChange={() => onToggleOverlay('markLines')}
					/>
					<OverlayToggle
						label='Best lap'
						checked={overlays.bestLap}
						color={overlayColors.bestLap}
						onChange={() => onToggleOverlay('bestLap')}
					/>
					<OverlayToggle
						label={`Best ${consecutiveWindow} consecutive`}
						checked={overlays.consecutive}
						color={overlayColors.consecutive}
						onChange={() => onToggleOverlay('consecutive')}
					/>
					<OverlayToggle
						label='Best race'
						checked={overlays.raceTotal}
						color={overlayColors.raceTotal}
						onChange={() => onToggleOverlay('raceTotal')}
					/>
				</div>
				<div className='pilot-analytics-toolbar'>
					<button type='button' onClick={handleResetZoom}>Reset view</button>
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
