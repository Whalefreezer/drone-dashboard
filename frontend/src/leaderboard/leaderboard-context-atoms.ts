import { Atom, atom } from 'jotai';
import { atomFamily } from 'jotai/utils';
import { allRacesAtom, currentRaceAtom, lastRaceAtom, racePilotChannelsAtom } from '../race/race-atoms.ts';
import { bracketsDataAtom, channelsDataAtom, leaderboardNextRaceOverridesAtom, noRacesOverrideAtom, pilotsAtom } from '../state/pbAtoms.ts';
import type { BracketPilot } from '../bracket/bracket-types.ts';
import type { PBChannelRecord, PBRaceRecord } from '../api/pbTypes.ts';
import { withCompare } from '../state/jotai-utils.ts';
import { bracketEnabledAtom, raceBracketSlotsAtom } from '../bracket/eliminationState.ts';

// Race ID sets shared across leaderboard and metric selectors
export const currentRaceIdsAtom = withCompare(atom((get): string[] => {
	const races = get(allRacesAtom);
	return races.map((r) => r.id);
}));

export const previousRaceIdsAtom = withCompare(atom((get): string[] => {
	const ids = get(currentRaceIdsAtom);
	const current = get(currentRaceAtom)?.id;
	const lastRace = get(lastRaceAtom)?.id;
	return ids.filter((id) => id !== current && id !== lastRace);
}));

// Scheduling/context atoms
export interface PilotNextRaceInfo {
	racesAway: number;
	raceId: string | null;
	raceSourceId: string | null;
	raceIndex: number;
	isPredicted: boolean;
}

export const pilotNextRaceInfoAtom = atomFamily((pilotId: string) =>
	atom((get): PilotNextRaceInfo => {
		const races = get(allRacesAtom);
		const current = get(currentRaceAtom);
		const currentIndex = current ? races.findIndex((r) => r.id === current.id) : -1;
		const isBracketEnabled = get(bracketEnabledAtom);

		if (currentIndex === -1) {
			return { racesAway: -1, raceId: null, raceSourceId: null, raceIndex: -1, isPredicted: false };
		}

		const currentRace = races[currentIndex];
		const currentAssignments = get(racePilotChannelsAtom(currentRace.id));
		if (currentAssignments.some((pc) => pc.pilotId === pilotId)) {
			return {
				racesAway: -2,
				raceId: currentRace.id,
				raceSourceId: (currentRace.sourceId ?? '').trim() || null,
				raceIndex: currentIndex,
				isPredicted: false,
			};
		}

		let count = 0;
		let firstActual: PilotNextRaceInfo | null = null;
		let firstPredicted: PilotNextRaceInfo | null = null;

		for (let idx = currentIndex + 1; idx < races.length; idx++) {
			const race = races[idx];
			const pilots = get(racePilotChannelsAtom(race.id));

			// Check actual assignments
			if (!firstActual && pilots.some((pc) => pc.pilotId === pilotId)) {
				firstActual = {
					racesAway: count,
					raceId: race.id,
					raceSourceId: (race.sourceId ?? '').trim() || null,
					raceIndex: idx,
					isPredicted: false,
				};
			}

			// Check bracket predictions if enabled and we haven't found a predicted match yet
			if (isBracketEnabled && !firstPredicted) {
				const bracketSlots = get(raceBracketSlotsAtom(race.id));
				const predictedSlot = bracketSlots.find((slot) => slot.isPredicted && slot.pilotId === pilotId);
				if (predictedSlot) {
					firstPredicted = {
						racesAway: count,
						raceId: race.id,
						raceSourceId: (race.sourceId ?? '').trim() || null,
						raceIndex: idx,
						isPredicted: true,
					};
				}
			}

			// If we have both actual and predicted, return the sooner one
			if (firstActual && firstPredicted) {
				return firstActual.racesAway <= firstPredicted.racesAway ? firstActual : firstPredicted;
			}

			count++;
		}

		// Return whichever we found, with actual taking priority if at same distance
		if (firstActual && firstPredicted) {
			return firstActual.racesAway <= firstPredicted.racesAway ? firstActual : firstPredicted;
		}
		if (firstActual) return firstActual;
		if (firstPredicted) return firstPredicted;
		return { racesAway: -1, raceId: null, raceSourceId: null, raceIndex: -1, isPredicted: false };
	})
);

export const pilotRacesUntilNextAtom = atomFamily((pilotId: string) =>
	atom((get): number => get(pilotNextRaceInfoAtom(pilotId)).racesAway)
);

export const pilotNextRaceOverrideLabelAtom = atomFamily((pilotId: string) =>
	atom((get): string | null => {
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
	atom((get): PBChannelRecord | null => {
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

/**
 * Legacy atom for bracket-based elimination info
 * Note: With locked positions, this is primarily for backward compatibility
 * The locked position system is the new source of truth for final rankings
 */
export const pilotEliminatedInfoAtom = atomFamily((pilotId: string) =>
	atom((get) => {
		const bracketsResult = get(bracketsDataAtom);
		if (bracketsResult instanceof Promise) throw bracketsResult;
		const brackets = bracketsResult.data ?? [];
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
