import { useEffect, useMemo, useRef } from 'react';
import { getInstanceByDom, init } from 'echarts';
import type { EChartsInitOpts, EChartsOption, EChartsType, SetOptionOpts } from 'echarts';

export interface EChartProps {
	option: EChartsOption;
	chartSettings?: EChartsInitOpts;
	optionSettings?: SetOptionOpts;
	style?: React.CSSProperties;
	className?: string;
	loading?: boolean;
	onReady?: (chart: EChartsType) => void;
	events?: Record<string, (params: unknown) => void>;
}

export function EChart(
	{
		option,
		chartSettings,
		optionSettings = { notMerge: true },
		style,
		className,
		loading = false,
		onReady,
		events = {},
	}: EChartProps,
) {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const chartRef = useRef<EChartsType | null>(null);

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		let chart = getInstanceByDom(container);
		if (!chart) {
			chart = init(container, undefined, chartSettings);
		}
		chartRef.current = chart;

		return () => {
			if (chart && !chart.isDisposed()) {
				chart.dispose();
			}
			chartRef.current = null;
		};
	}, [chartSettings]);

	useEffect(() => {
		const chart = chartRef.current;
		if (chart && onReady) {
			onReady(chart);
		}
	}, [onReady]);

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;
		const chart = chartRef.current ?? getInstanceByDom(container);
		if (!chart) return;

		chart.setOption(option, optionSettings);
		if (loading) chart.showLoading();
		else chart.hideLoading();
	}, [loading, option, optionSettings]);

	useEffect(() => {
		const entries = Object.entries(events);
		const chart = chartRef.current;
		if (!chart) return;
		entries.forEach(([eventName, handler]) => {
			chart.on(eventName, handler as (params: unknown) => void);
		});
		return () => {
			entries.forEach(([eventName, handler]) => {
				chart.off(eventName, handler as (params: unknown) => void);
			});
		};
	}, [events]);

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;
		const resizeObserver = new ResizeObserver(() => {
			const chart = chartRef.current ?? getInstanceByDom(container);
			chart?.resize();
		});
		resizeObserver.observe(container);
		return () => {
			resizeObserver.disconnect();
		};
	}, []);

	const mergedStyle = useMemo(() => ({
		width: '100%',
		height: '100%',
		...style,
	}), [style]);

	return <div ref={containerRef} style={mergedStyle} className={className} />;
}
