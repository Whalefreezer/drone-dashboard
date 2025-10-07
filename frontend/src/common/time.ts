export const parseTimestampMs = (value: unknown): number | null => {
	if (value == null) return null;
	if (typeof value === 'number') {
		return Number.isFinite(value) ? value : null;
	}
	const trimmed = String(value).trim();
	if (!trimmed) return null;
	const numeric = Number(trimmed);
	if (Number.isFinite(numeric)) return numeric;
	const parsed = Date.parse(trimmed);
	return Number.isNaN(parsed) ? null : parsed;
};

export const toLocalDateTimeInputValue = (ms: number | null): string => {
	if (ms == null || !Number.isFinite(ms)) return '';
	const date = new Date(ms);
	const year = date.getFullYear();
	const month = `${date.getMonth() + 1}`.padStart(2, '0');
	const day = `${date.getDate()}`.padStart(2, '0');
	const hours = `${date.getHours()}`.padStart(2, '0');
	const minutes = `${date.getMinutes()}`.padStart(2, '0');
	return `${year}-${month}-${day}T${hours}:${minutes}`;
};

export const fromLocalDateTimeInputValue = (value: string): number | null => {
	const trimmed = value.trim();
	if (!trimmed) return null;
	const parsed = Date.parse(trimmed);
	return Number.isNaN(parsed) ? null : parsed;
};
