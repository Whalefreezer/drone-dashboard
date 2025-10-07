import '../tests/test_setup.ts';
import { assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';
import { findEndIndex, findStartIndex } from './GenericTable.tsx';

describe('GenericTable virtualization helpers', () => {
	it('computes start index based on row bottoms', () => {
		const offsets = [0, 40, 90, 150];
		const heights = [40, 50, 60, 70];

		assertEquals(findStartIndex(offsets, heights, -20), 0);
		assertEquals(findStartIndex(offsets, heights, 0), 0);
		assertEquals(findStartIndex(offsets, heights, 45), 1);
		assertEquals(findStartIndex(offsets, heights, 95), 2);
		assertEquals(findStartIndex(offsets, heights, 250), 3);
	});

	it('computes end index as exclusive upper bound', () => {
		const offsets = [0, 30, 70, 120];

		assertEquals(findEndIndex(offsets, -10), 0);
		assertEquals(findEndIndex(offsets, 0), 1);
		assertEquals(findEndIndex(offsets, 30), 2);
		assertEquals(findEndIndex(offsets, 119), 3);
		assertEquals(findEndIndex(offsets, 500), 4);
	});

	it('handles sparse data gracefully', () => {
		const offsets = [0];
		const heights = [80];

		assertEquals(findStartIndex(offsets, heights, 400), 0);
		assertEquals(findEndIndex(offsets, 400), 1);
	});
});
