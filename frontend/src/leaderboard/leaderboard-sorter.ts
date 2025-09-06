import { type EagerGetter, NullHandling, SortDirection, type SortGroup } from './sorting-types.ts';

// Pure sorter operating on pilot IDs using a Jotai getter and a declarative config
export function sortPilotIds(ids: string[], get: EagerGetter, config: SortGroup[]): string[] {
	function groupPath(id: string, groups: SortGroup[]): SortGroup[] {
		const path: SortGroup[] = [];
		function dfs(gs: SortGroup[], parent: SortGroup[] | null): boolean {
			for (const g of gs) {
				if (!g.condition || g.condition(get, id)) {
					path.push(g);
					if (g.groups && g.groups.length > 0) {
						if (dfs(g.groups, g.groups)) return true;
					}
					return true;
				}
			}
			path.pop();
			return false;
		}
		dfs(groups, null);
		return path;
	}

	function compare(a: string, b: string): number {
		const pathA = groupPath(a, config);
		const pathB = groupPath(b, config);

		// Compare group order first
		const minDepth = Math.min(pathA.length, pathB.length);
		for (let i = 0; i < minDepth; i++) {
			const parent = i === 0 ? config : (pathA[i - 1]?.groups ?? []);
			const ia = parent.findIndex((g) => g === pathA[i]);
			const ib = parent.findIndex((g) => g === pathB[i]);
			if (ia !== ib) return ia - ib;
		}
		if (pathA.length !== pathB.length) return pathA.length - pathB.length;

		// Same path: compare by most specific group's criteria
		const g = pathA[pathA.length - 1];
		if (!g) return 0;
		for (const c of g.criteria) {
			const va = c.getValue(get, a);
			const vb = c.getValue(get, b);
			if (va == null && vb == null) continue;
			if (va == null) return c.nullHandling === NullHandling.First ? -1 : 1;
			if (vb == null) return c.nullHandling === NullHandling.First ? 1 : -1;
			const diff = va - vb;
			if (diff !== 0) return c.direction === SortDirection.Ascending ? diff : -diff;
		}
		return 0;
	}

	return [...ids].sort(compare);
}
