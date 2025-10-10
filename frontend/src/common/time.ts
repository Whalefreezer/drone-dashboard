/**
 * Parses a timestamp value from the backend into epoch milliseconds.
 * Handles both numeric values and ISO date strings.
 * @param value - The value to parse (can be number, string, or null/undefined)
 * @returns Parsed timestamp in milliseconds, or null if invalid
 */
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
	if (!Number.isNaN(parsed)) return parsed;
	// Try replacing first space with 'T' to handle "2023-10-01 12:34:56" format
	// which Date.parse may not handle consistently across environments
	const withAddedT = trimmed.replace(' ', 'T');
	const parsedWithT = Date.parse(withAddedT);
	return Number.isNaN(parsedWithT) ? null : parsedWithT;
};

/**
 * Parses a timestamp value with a fallback default.
 * Useful when you need a non-null result for sorting/comparison.
 * @param value - The value to parse (can be number, string, or null/undefined)
 * @param defaultValue - Value to return if parsing fails (default: Number.POSITIVE_INFINITY)
 * @returns Parsed timestamp in milliseconds, or defaultValue if invalid
 */
export const parseTimestampMsWithDefault = (
	value: unknown,
	defaultValue: number = Number.POSITIVE_INFINITY,
): number => {
	return parseTimestampMs(value) ?? defaultValue;
};

export const toLocalDateTimeInputValue = (ms: number | null): string => {
	if (ms == null || !Number.isFinite(ms)) return '';
	const date = new Date(ms);
	const year = date.getFullYear();
	const month = `${date.getMonth() + 1}`.padStart(2, '0');
	const day = `${date.getDate()}`.padStart(2, '0');
	const hours = `${date.getHours()}`.padStart(2, '0');
	const minutes = `${date.getMinutes()}`.padStart(2, '0');
	const seconds = `${date.getSeconds()}`.padStart(2, '0');
	return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
};

export const fromLocalDateTimeInputValue = (value: string): number | null => {
	const trimmed = value.trim();
	if (!trimmed) return null;
	const parsed = Date.parse(trimmed);
	return Number.isNaN(parsed) ? null : parsed;
};
