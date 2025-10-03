import { Atom } from 'jotai';
import { eagerAtom } from 'jotai-eager';
import { atomFamily } from 'jotai/utils';
import { allRacesAtom, currentRaceAtom, lastRaceAtom, racePilotChannelsAtom } from '../race/race-atoms.ts';
import { bracketsDataAtom, channelsDataAtom, leaderboardNextRaceOverridesAtom, noRacesOverrideAtom, pilotsAtom } from '../state/pbAtoms.ts';
import type { BracketPilot } from '../bracket/bracket-types.ts';
import type { PBChannelRecord, PBRaceRecord } from '../api/pbTypes.ts';

// Race ID sets shared across leaderboard and metric selectors
export const currentRaceIdsAtom = eagerAtom((get): string[] => {
	const races = get(allRacesAtom);
	return races.map((r) => r.id);
});

export const previousRaceIdsAtom = eagerAtom((get): string[] => {
	const ids = get(currentRaceIdsAtom);
	const current = get(currentRaceAtom)?.id;
	const lastRace = get(lastRaceAtom)?.id;
	return ids.filter((id) => id !== current && id !== lastRace);
});

// Scheduling/context atoms
export interface PilotNextRaceInfo {
	racesAway: number;
	raceId: string | null;
	raceSourceId: string | null;
	raceIndex: number;
}

export const pilotNextRaceInfoAtom = atomFamily((pilotId: string) =>
	eagerAtom((get): PilotNextRaceInfo => {
		const races = get(allRacesAtom);
		const current = get(currentRaceAtom);
		const currentIndex = current ? races.findIndex((r) => r.id === current.id) : -1;
		if (currentIndex === -1) {
			return { racesAway: -1, raceId: null, raceSourceId: null, raceIndex: -1 };
		}
		const currentRace = races[currentIndex];
		const currentAssignments = get(racePilotChannelsAtom(currentRace.id));
		if (currentAssignments.some((pc) => pc.pilotId === pilotId)) {
			return {
				racesAway: -2,
				raceId: currentRace.id,
				raceSourceId: (currentRace.sourceId ?? '').trim() || null,
				raceIndex: currentIndex,
			};
		}
		let count = 0;
		for (let idx = currentIndex + 1; idx < races.length; idx++) {
			const race = races[idx];
			const pilots = get(racePilotChannelsAtom(race.id));
			if (pilots.some((pc) => pc.pilotId === pilotId)) {
				return {
					racesAway: count,
					raceId: race.id,
					raceSourceId: (race.sourceId ?? '').trim() || null,
					raceIndex: idx,
				};
			}
			count++;
		}
		return { racesAway: -1, raceId: null, raceSourceId: null, raceIndex: -1 };
	})
);

export const pilotRacesUntilNextAtom = atomFamily((pilotId: string) =>
	eagerAtom((get): number => get(pilotNextRaceInfoAtom(pilotId)).racesAway)
);

export const pilotNextRaceOverrideLabelAtom = atomFamily((pilotId: string) =>
	eagerAtom((get): string | null => {
		const info = get(pilotNextRaceInfoAtom(pilotId));
		const overrides = get(leaderboardNextRaceOverridesAtom);

		// For Racing (-2) or Staging (0), don't apply overrides (they have higher priority)
		if (info.racesAway === -2 || info.racesAway === 0) return null;

		// For pilots with a next race (racesAway > 0), check if their next race falls in an override range
		if (info.racesAway > 0 && info.raceIndex >= 0) {
			for (const override of overrides) {
				if (info.raceIndex < override.startIndex) continue;
				if (info.raceIndex <= override.endIndex) return override.label;
			}
			return null;
		}

		// For pilots without a next race (racesAway === -1), check the special "no races" override
		if (info.racesAway === -1) {
			const noRacesOverride = get(noRacesOverrideAtom);
			if (noRacesOverride) {
				return noRacesOverride.label;
			}
		}

		return null;
	})
);

export const pilotPreferredChannelAtom = atomFamily((pilotId: string) =>
	eagerAtom((get): PBChannelRecord | null => {
		const races = get(allRacesAtom);
		const channels = get(channelsDataAtom);
		const current = get(currentRaceAtom);
		const currentIndex = current ? races.findIndex((r) => r.id === current.id) : 0;
		const order: PBRaceRecord[] = [
			...races.slice(currentIndex),
			...races.slice(0, currentIndex).reverse(),
		];
		for (const race of order) {
			const pcs = get(racePilotChannelsAtom(race.id));
			const pc = pcs.find((p) => p.pilotId === pilotId);
			if (pc) {
				return channels.find((c) => c.id === pc.channelId) ?? null;
			}
		}
		return null;
	})
);

export const pilotEliminatedInfoAtom = atomFamily((pilotId: string) =>
	eagerAtom((get) => {
		const brackets = get(bracketsDataAtom)?.data ?? [];
		const pilots = get(pilotsAtom);
		const pilot = pilots.find((p) => p.id === pilotId);
		if (!pilot) return null;
		const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '');
		for (const bracket of brackets) {
			const match = bracket.pilots.find((bp: BracketPilot) => norm(bp.name) === norm(pilot.name));
			if (match) return { bracket: bracket.name, position: 0, points: match.points };
		}
		return null;
	})
);

export type EagerGetter = <Value>(atom: Atom<Value>) => Awaited<Value>;
