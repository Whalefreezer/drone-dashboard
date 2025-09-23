import { atom } from 'jotai';
import type { PrimitiveAtom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

type ColumnPrefsState = {
	hidden: string[];
};

type ColumnPrefsConfig = {
	allKeys: string[];
	defaultVisible: string[];
};

const storageCache = new Map<string, PrimitiveAtom<ColumnPrefsState>>();
const atomCache = new Map<string, PrimitiveAtom<string[]>>();
const configCache = new Map<string, ColumnPrefsConfig>();

const normalize = (keys: string[]): string[] => Array.from(new Set(keys));

const createInitialState = (config: ColumnPrefsConfig): ColumnPrefsState => {
	const { allKeys, defaultVisible } = config;
	const defaultSet = new Set(defaultVisible);
	const hidden = allKeys.filter((key) => !defaultSet.has(key));
	return { hidden };
};

export function getColumnPrefsAtom(tableId: string, allKeys: string[], defaultVisible?: string[]) {
	const config: ColumnPrefsConfig = {
		allKeys: normalize(allKeys),
		defaultVisible: normalize(defaultVisible ?? allKeys),
	};
	configCache.set(tableId, config);

	const storageKey = `columns:v2:${tableId}`;

	let storageAtom = storageCache.get(storageKey);
	if (!storageAtom) {
		storageAtom = atomWithStorage<ColumnPrefsState>(storageKey, createInitialState(config));
		storageCache.set(storageKey, storageAtom);
	}

	let visibleAtom = atomCache.get(storageKey);
	if (!visibleAtom) {
		visibleAtom = atom(
			(get) => {
				const cfg = configCache.get(tableId) ?? config;
				const state = get(storageAtom!);
				const hiddenSet = new Set(state.hidden.filter((key) => cfg.allKeys.includes(key)));
				return cfg.allKeys.filter((key) => !hiddenSet.has(key));
			},
			(get, set, updater: string[] | ((prev: string[]) => string[])) => {
				const cfg = configCache.get(tableId) ?? config;
				const state = get(storageAtom!);
				const currentVisible = cfg.allKeys.filter((key) => !new Set(state.hidden).has(key));
				const nextVisible = (typeof updater === 'function' ? updater(currentVisible) : updater).filter((key) => cfg.allKeys.includes(key));
				const uniqueVisible = Array.from(new Set(nextVisible));
				const hidden = cfg.allKeys.filter((key) => !uniqueVisible.includes(key));
				set(storageAtom!, { hidden });
			},
		);
		atomCache.set(storageKey, visibleAtom);
	}

	return visibleAtom;
}
