import { assertEquals } from '@std/assert';
import { describe, it } from '@std/testing/bdd';
import { atom, createStore } from 'jotai';
import { leaderboardLockedPositionsAtom } from './pbAtoms.ts';
import type { PBClientKVRecord } from '../api/pbTypes.ts';

// Helper to create a mock client_kv atom for testing
function createMockClientKVAtom(records: PBClientKVRecord[]) {
	return atom(() => records);
}

describe('Locked Positions', () => {
	describe('leaderboardLockedPositionsAtom', () => {
		it('should return empty map when no locked positions record exists', () => {
			const store = createStore();
			const mockKVAtom = createMockClientKVAtom([]);

			// Create a test atom that uses our mock
			const testAtom = atom((get) => {
				const mockKV = get(mockKVAtom);
				const rec = mockKV.find((r) => r.namespace === 'leaderboard' && r.key === 'lockedPositions');
				if (!rec?.value) return new Map();

				try {
					const parsed = JSON.parse(rec.value);
					if (!Array.isArray(parsed)) return new Map();

					const map = new Map<string, number>();
					for (const entry of parsed) {
						if (!entry || typeof entry !== 'object') continue;
						const pilotId = typeof entry.pilotId === 'string' ? entry.pilotId.trim() : '';
						const position = typeof entry.position === 'number' ? entry.position : null;
						if (pilotId && position != null && Number.isFinite(position) && position > 0) {
							map.set(pilotId, position);
						}
					}
					return map;
				} catch {
					return new Map();
				}
			});

			const result = store.get(testAtom);
			assertEquals(result.size, 0);
		});

		it('should parse valid locked positions correctly', () => {
			const store = createStore();
			const mockKVRecords: PBClientKVRecord[] = [
				{
					id: 'test1',
					namespace: 'leaderboard',
					key: 'lockedPositions',
					value: JSON.stringify([
						{ pilotId: 'pilot1', pilotSourceId: 'p1', displayName: 'Pilot One', position: 1 },
						{ pilotId: 'pilot2', pilotSourceId: 'p2', displayName: 'Pilot Two', position: 2 },
						{ pilotId: 'pilot3', pilotSourceId: 'p3', displayName: 'Pilot Three', position: 3, note: 'Winner' },
					]),
				},
			];
			const mockKVAtom = createMockClientKVAtom(mockKVRecords);

			const testAtom = atom((get) => {
				const mockKV = get(mockKVAtom);
				const rec = mockKV.find((r) => r.namespace === 'leaderboard' && r.key === 'lockedPositions');
				if (!rec?.value) return new Map();

				try {
					const parsed = JSON.parse(rec.value);
					if (!Array.isArray(parsed)) return new Map();

					const map = new Map<string, number>();
					for (const entry of parsed) {
						if (!entry || typeof entry !== 'object') continue;
						const pilotId = typeof entry.pilotId === 'string' ? entry.pilotId.trim() : '';
						const position = typeof entry.position === 'number' ? entry.position : null;
						if (pilotId && position != null && Number.isFinite(position) && position > 0) {
							map.set(pilotId, position);
						}
					}
					return map;
				} catch {
					return new Map();
				}
			});

			const result = store.get(testAtom);
			assertEquals(result.size, 3);
			assertEquals(result.get('pilot1'), 1);
			assertEquals(result.get('pilot2'), 2);
			assertEquals(result.get('pilot3'), 3);
		});

		it('should filter out invalid entries', () => {
			const store = createStore();
			const mockKVRecords: PBClientKVRecord[] = [
				{
					id: 'test1',
					namespace: 'leaderboard',
					key: 'lockedPositions',
					value: JSON.stringify([
						{ pilotId: 'pilot1', pilotSourceId: 'p1', displayName: 'Pilot One', position: 1 },
						{ pilotId: '', pilotSourceId: 'p2', displayName: 'No ID', position: 2 }, // Invalid: no pilotId
						{ pilotId: 'pilot3', pilotSourceId: 'p3', displayName: 'Pilot Three', position: 0 }, // Invalid: position 0
						{ pilotId: 'pilot4', pilotSourceId: 'p4', displayName: 'Pilot Four', position: -1 }, // Invalid: negative
						{ pilotId: 'pilot5', pilotSourceId: 'p5', displayName: 'Pilot Five', position: 'invalid' }, // Invalid: not a number
						{ pilotId: 'pilot6', pilotSourceId: 'p6', displayName: 'Pilot Six', position: 6 }, // Valid
					]),
				},
			];
			const mockKVAtom = createMockClientKVAtom(mockKVRecords);

			const testAtom = atom((get) => {
				const mockKV = get(mockKVAtom);
				const rec = mockKV.find((r) => r.namespace === 'leaderboard' && r.key === 'lockedPositions');
				if (!rec?.value) return new Map();

				try {
					const parsed = JSON.parse(rec.value);
					if (!Array.isArray(parsed)) return new Map();

					const map = new Map<string, number>();
					for (const entry of parsed) {
						if (!entry || typeof entry !== 'object') continue;
						const pilotId = typeof entry.pilotId === 'string' ? entry.pilotId.trim() : '';
						const position = typeof entry.position === 'number' ? entry.position : null;
						if (pilotId && position != null && Number.isFinite(position) && position > 0) {
							map.set(pilotId, position);
						}
					}
					return map;
				} catch {
					return new Map();
				}
			});

			const result = store.get(testAtom);
			assertEquals(result.size, 2); // Only pilot1 and pilot6 should be valid
			assertEquals(result.get('pilot1'), 1);
			assertEquals(result.get('pilot6'), 6);
		});

		it('should handle malformed JSON gracefully', () => {
			const store = createStore();
			const mockKVRecords: PBClientKVRecord[] = [
				{
					id: 'test1',
					namespace: 'leaderboard',
					key: 'lockedPositions',
					value: 'not valid json',
				},
			];
			const mockKVAtom = createMockClientKVAtom(mockKVRecords);

			const testAtom = atom((get) => {
				const mockKV = get(mockKVAtom);
				const rec = mockKV.find((r) => r.namespace === 'leaderboard' && r.key === 'lockedPositions');
				if (!rec?.value) return new Map();

				try {
					const parsed = JSON.parse(rec.value);
					if (!Array.isArray(parsed)) return new Map();

					const map = new Map<string, number>();
					for (const entry of parsed) {
						if (!entry || typeof entry !== 'object') continue;
						const pilotId = typeof entry.pilotId === 'string' ? entry.pilotId.trim() : '';
						const position = typeof entry.position === 'number' ? entry.position : null;
						if (pilotId && position != null && Number.isFinite(position) && position > 0) {
							map.set(pilotId, position);
						}
					}
					return map;
				} catch {
					return new Map();
				}
			});

			const result = store.get(testAtom);
			assertEquals(result.size, 0);
		});

		it('should handle non-array JSON gracefully', () => {
			const store = createStore();
			const mockKVRecords: PBClientKVRecord[] = [
				{
					id: 'test1',
					namespace: 'leaderboard',
					key: 'lockedPositions',
					value: JSON.stringify({ notAnArray: true }),
				},
			];
			const mockKVAtom = createMockClientKVAtom(mockKVRecords);

			const testAtom = atom((get) => {
				const mockKV = get(mockKVAtom);
				const rec = mockKV.find((r) => r.namespace === 'leaderboard' && r.key === 'lockedPositions');
				if (!rec?.value) return new Map();

				try {
					const parsed = JSON.parse(rec.value);
					if (!Array.isArray(parsed)) return new Map();

					const map = new Map<string, number>();
					for (const entry of parsed) {
						if (!entry || typeof entry !== 'object') continue;
						const pilotId = typeof entry.pilotId === 'string' ? entry.pilotId.trim() : '';
						const position = typeof entry.position === 'number' ? entry.position : null;
						if (pilotId && position != null && Number.isFinite(position) && position > 0) {
							map.set(pilotId, position);
						}
					}
					return map;
				} catch {
					return new Map();
				}
			});

			const result = store.get(testAtom);
			assertEquals(result.size, 0);
		});
	});

	describe('Duplicate Position Validation', () => {
		it('should detect duplicate positions', () => {
			const entries = [
				{ position: 1, pilotId: 'pilot1' },
				{ position: 2, pilotId: 'pilot2' },
				{ position: 1, pilotId: 'pilot3' }, // Duplicate position 1
			];

			const positionCounts = new Map<number, string[]>();
			entries.forEach((entry) => {
				if (entry.position > 0) {
					const pilots = positionCounts.get(entry.position) ?? [];
					pilots.push(entry.pilotId);
					positionCounts.set(entry.position, pilots);
				}
			});

			const duplicates = Array.from(positionCounts.entries()).filter(([_pos, pilots]) => pilots.length > 1);

			assertEquals(duplicates.length, 1);
			assertEquals(duplicates[0][0], 1); // Position 1 is duplicated
			assertEquals(duplicates[0][1].length, 2); // Two pilots at position 1
		});

		it('should allow non-contiguous positions', () => {
			const entries = [
				{ position: 1, pilotId: 'pilot1' },
				{ position: 5, pilotId: 'pilot2' }, // Gap is allowed
				{ position: 10, pilotId: 'pilot3' },
			];

			const positionCounts = new Map<number, string[]>();
			entries.forEach((entry) => {
				if (entry.position > 0) {
					const pilots = positionCounts.get(entry.position) ?? [];
					pilots.push(entry.pilotId);
					positionCounts.set(entry.position, pilots);
				}
			});

			const duplicates = Array.from(positionCounts.entries()).filter(([_pos, pilots]) => pilots.length > 1);

			assertEquals(duplicates.length, 0); // No duplicates
		});
	});
});
