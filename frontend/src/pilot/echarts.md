### Example from Webpage

```ts
import * as echarts from 'echarts';

const ROOT_PATH = 'https://echarts.apache.org/examples';
const chartDom = document.getElementById('main');
const chart = chartDom ? echarts.init(chartDom) : null;
let option: echarts.EChartsOption | undefined;

if (chart) {
	chart.showLoading();
	$.get(
		`${ROOT_PATH}/data/asset/data/obama_budget_proposal_2012.list.json`,
		(obama_budget_2012) => {
			chart.hideLoading();
			option = {
				tooltip: {
					trigger: 'axis',
					axisPointer: {
						type: 'shadow',
						label: { show: true },
					},
				},
				toolbox: {
					show: true,
					feature: {
						mark: { show: true },
						dataView: { show: true, readOnly: false },
						magicType: { show: true, type: ['line', 'bar'] },
						restore: { show: true },
						saveAsImage: { show: true },
					},
				},
				dataZoom: [
					{ show: true, filterMode: 'none', start: 94, end: 100 },
					{ type: 'inside', filterMode: 'none', start: 94, end: 100 },
					{
						show: true,
						yAxisIndex: 0,
						filterMode: 'none',
						width: 30,
						height: '80%',
						showDataShadow: false,
						left: '93%',
					},
				],
				series: [
					{ name: 'Budget 2011', type: 'bar', data: obama_budget_2012.budget2011List },
					{ name: 'Budget 2012', type: 'bar', data: obama_budget_2012.budget2012List },
				],
			};
			chart.setOption(option);
		},
	);

	if (option) chart.setOption(option);
}
```

### React Usage

```tsx
import { useEffect, useMemo, useRef } from 'react';
import { getInstanceByDom, init } from 'echarts';
import { debounce } from 'lodash';

export const EChart = ({ option, chartSettings, optionSettings, style, loading, events, ...props }) => {
	const chartRef = useRef<HTMLDivElement | null>(null);

	const resizeChart = useMemo(
		() =>
			debounce(() => {
				if (!chartRef.current) return;
				const chart = getInstanceByDom(chartRef.current);
				chart?.resize();
			}, 100),
		[],
	);

	useEffect(() => {
		const chartDom = chartRef.current;
		if (!chartDom) return;
		const chart = init(chartDom, undefined, chartSettings);

		for (const [key, handler] of Object.entries(events ?? {})) {
			chart.on(key, handler);
		}

		const resizeObserver = new ResizeObserver(() => {
			chart.resize();
		});
		resizeObserver.observe(chartDom);

		return () => {
			resizeObserver.disconnect();
			chart.dispose();
		};
	}, [chartSettings, events, resizeChart]);

	useEffect(() => {
		const chartDom = chartRef.current;
		if (!chartDom) return;
		const chart = getInstanceByDom(chartDom);
		chart?.setOption(option, optionSettings);
		if (loading) chart?.showLoading();
		else chart?.hideLoading();
	}, [loading, option, optionSettings]);

	return <div ref={chartRef} style={style} {...props} />;
};
```
