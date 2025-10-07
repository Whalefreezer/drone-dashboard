import type { StreamVideoRange } from '../state/pbAtoms.ts';

export interface StreamVideoMatch {
	range: StreamVideoRange;
	timestampMs: number;
	offsetMs: number;
	offsetSeconds: number;
}

const isWithinRange = (range: StreamVideoRange, timestampMs: number): boolean => {
	if (!Number.isFinite(timestampMs)) return false;
	if (timestampMs < range.startMs) return false;
	if (range.endMs != null && timestampMs > range.endMs) return false;
	return true;
};

const computeOffsetSeconds = (range: StreamVideoRange, timestampMs: number): number => {
	const offsetMs = Math.max(0, timestampMs - range.startMs);
	return Math.max(0, Math.floor(offsetMs / 1000));
};

const updateHashTimestamp = (rawHash: string, seconds: number): string => {
	const hash = rawHash.startsWith('#') ? rawHash.slice(1) : rawHash;
	if (!hash) return '';
	if (/^t=\d+s?$/i.test(hash) || /^start=\d+s?$/i.test(hash)) {
		return '';
	}
	const hashParams = new URLSearchParams(hash);
	if (hashParams.has('t')) {
		hashParams.delete('t');
	}
	if (hashParams.has('start')) {
		hashParams.delete('start');
	}
	if (hashParams.size > 0) {
		return `#${hashParams.toString()}`;
	}
	return rawHash;
};

export const buildVideoUrlWithOffset = (rawUrl: string, seconds: number): string | null => {
	try {
		const url = new URL(rawUrl);
		url.searchParams.set('t', `${Math.max(0, seconds)}`);
		if (url.searchParams.has('start')) {
			url.searchParams.delete('start');
		}
		if (url.hash) {
			url.hash = updateHashTimestamp(url.hash, Math.max(0, seconds));
		}
		return url.toString();
	} catch {
		return null;
	}
};

export const findStreamVideoMatch = (
	ranges: StreamVideoRange[],
	timestampMs: number | null,
): StreamVideoMatch | null => {
	if (timestampMs == null || !Number.isFinite(timestampMs)) return null;
	for (const range of ranges) {
		if (!isWithinRange(range, timestampMs)) continue;
		const offsetSeconds = computeOffsetSeconds(range, timestampMs);
		return {
			range,
			timestampMs,
			offsetMs: Math.max(0, timestampMs - range.startMs),
			offsetSeconds,
		};
	}
	return null;
};

export interface StreamLink {
	href: string;
	label: string;
	range: StreamVideoRange;
	offsetSeconds: number;
	timestampMs: number;
}

export const buildStreamLinkForTimestamp = (
	ranges: StreamVideoRange[],
	timestampMs: number | null,
): StreamLink | null => {
	const match = findStreamVideoMatch(ranges, timestampMs);
	if (!match) return null;
	const href = buildVideoUrlWithOffset(match.range.url, match.offsetSeconds);
	if (!href) return null;
	return {
		href,
		label: match.range.label,
		range: match.range,
		offsetSeconds: match.offsetSeconds,
		timestampMs: match.timestampMs,
	};
};
