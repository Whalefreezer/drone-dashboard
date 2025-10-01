import '../tests/test_setup.ts';

import { assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';
import { FakeTime } from '@std/testing/time';
import { act, renderHook } from '@testing-library/react';
import { useInactivityPause } from './useInactivityPause.ts';

describe('useInactivityPause', () => {
	it('resumes after the configured delay', () => {
		const time = new FakeTime(0);
		try {
			let resumeCount = 0;
			const { result } = renderHook(() =>
				useInactivityPause({
					delayMs: 4500,
					onResume: () => {
						resumeCount += 1;
					},
				})
			);

			act(() => {
				result.current.triggerPause();
			});

			assertEquals(result.current.isPaused, true);

			time.tick(4499);
			assertEquals(result.current.isPaused, true);

			time.tick(1);
			assertEquals(resumeCount, 1);
			assertEquals(result.current.isPaused, false);
		} finally {
			time.restore();
		}
	});

	it('ignores interactions while disabled and resumes once re-enabled', () => {
		const time = new FakeTime(0);
		try {
			let resumeCount = 0;
			const { result, rerender } = renderHook(({ disabled }) =>
				useInactivityPause({
					delayMs: 2000,
					disabled,
					onResume: () => {
						resumeCount += 1;
					},
				}), { initialProps: { disabled: true } });

			act(() => {
				result.current.triggerPause();
			});

			assertEquals(result.current.isPaused, false);
			time.tick(4000);
			assertEquals(resumeCount, 0);

			rerender({ disabled: false });

			act(() => {
				result.current.triggerPause();
			});

			assertEquals(result.current.isPaused, true);
			time.tick(2000);
			assertEquals(resumeCount, 1);
			assertEquals(result.current.isPaused, false);
		} finally {
			time.restore();
		}
	});
});
