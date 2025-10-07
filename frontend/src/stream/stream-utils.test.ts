import { assertEquals } from '@std/assert';
import { assert } from '@std/assert/assert';
import { describe, it } from '@std/testing/bdd';
import type { StreamVideoRange } from '../state/pbAtoms.ts';
import { buildStreamLinkForTimestamp, buildVideoUrlWithOffset, findStreamVideoMatch } from './stream-utils.ts';

const sampleRanges: StreamVideoRange[] = [
	{
		id: 'one',
		label: 'Opening Ceremony',
		url: 'https://www.youtube.com/watch?v=video1',
		startMs: 1_700_000_000_000,
		endMs: 1_700_000_600_000,
	},
	{
		id: 'two',
		label: 'Qualifiers',
		url: 'https://youtu.be/video2?si=share',
		startMs: 1_700_000_900_000,
		endMs: null,
	},
];

describe('stream-utils', () => {
	describe('buildVideoUrlWithOffset', () => {
		it('adds t parameter and preserves other params', () => {
			const result = buildVideoUrlWithOffset('https://www.youtube.com/watch?v=abc123&si=test', 75);
			assert(result);
			assertEquals(result, 'https://www.youtube.com/watch?v=abc123&si=test&t=75');
		});

		it('removes start hash and query params when setting t', () => {
			const result = buildVideoUrlWithOffset('https://youtu.be/xyz789?start=20#t=10', 42);
			assert(result);
			assertEquals(result, 'https://youtu.be/xyz789?t=42');
		});
	});

	describe('findStreamVideoMatch', () => {
		it('returns matching range and offset when timestamp within bounds', () => {
			const timestampMs = sampleRanges[0].startMs + 32_000;
			const match = findStreamVideoMatch(sampleRanges, timestampMs);
			assert(match);
			assertEquals(match.range.id, 'one');
			assertEquals(match.offsetSeconds, 32);
		});

		it('prefers first matching range and supports open end', () => {
			const timestampMs = sampleRanges[1].startMs + 125_000;
			const match = findStreamVideoMatch(sampleRanges, timestampMs);
			assert(match);
			assertEquals(match.range.id, 'two');
			assertEquals(match.offsetSeconds, 125);
		});

		it('returns null when timestamp outside any range', () => {
			const match = findStreamVideoMatch(sampleRanges, sampleRanges[0].startMs - 1_000);
			assertEquals(match, null);
		});
	});

	describe('buildStreamLinkForTimestamp', () => {
		it('builds link with label and href', () => {
			const ts = sampleRanges[0].startMs + 5_000;
			const link = buildStreamLinkForTimestamp(sampleRanges, ts);
			assert(link);
			assertEquals(link.label, 'Opening Ceremony');
			assertEquals(link.href, 'https://www.youtube.com/watch?v=video1&t=5');
		});

		it('returns null when no range matches', () => {
			const link = buildStreamLinkForTimestamp(sampleRanges, null);
			assertEquals(link, null);
		});
	});
});
