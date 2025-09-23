import { assertEquals } from '@std/assert';
import { createStore } from 'jotai';
import { getColumnPrefsAtom } from './columnPrefs.ts';

Deno.test('applies default visible columns when no preferences exist', () => {
	const store = createStore();
	const atom = getColumnPrefsAtom('prefs-defaults', ['pos', 'pilot', 'channel'], ['pos', 'pilot']);
	assertEquals(store.get(atom), ['pos', 'pilot']);
});

Deno.test('keeps user-hidden columns while showing new keys by default', () => {
	const store = createStore();
	const tableId = 'prefs-laps-flow';
	const initialAtom = getColumnPrefsAtom(tableId, ['pos', 'name'], ['pos', 'name']);
	assertEquals(store.get(initialAtom), ['pos', 'name']);

	store.set(initialAtom, ['pos']);

	const updatedAtom = getColumnPrefsAtom(tableId, ['pos', 'name', 'l1'], ['pos', 'name', 'l1']);
	assertEquals(store.get(updatedAtom), ['pos', 'l1']);
});

Deno.test('persists newly enabled optional columns', () => {
	const store = createStore();
	const tableId = 'prefs-optional';
	const atom = getColumnPrefsAtom(tableId, ['pos', 'pilot', 'channel'], ['pos', 'pilot']);
	store.set(atom, (prev) => [...prev, 'channel']);

	const sameAtom = getColumnPrefsAtom(tableId, ['pos', 'pilot', 'channel'], ['pos', 'pilot']);
	assertEquals(store.get(sameAtom), ['pos', 'pilot', 'channel']);
});
