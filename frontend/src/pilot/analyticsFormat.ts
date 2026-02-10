export const formatSeconds = (time: number): string => `${time.toFixed(3)}s`;

export const formatDelta = (delta: number | null): string => {
	if (delta == null || Number.isNaN(delta)) return '—';
	const sign = delta === 0 ? '' : delta > 0 ? '+' : '−';
	return `${sign}${Math.abs(delta).toFixed(3)}s`;
};

export const notNull = (value: number | null | undefined): value is number => {
	return value != null && !Number.isNaN(value);
};
