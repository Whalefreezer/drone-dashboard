import { useAtom, useAtomValue } from 'jotai';
import { Bracket } from '../types';
import { raceFamilyAtom, racesAtom, roundsDataAtom, pilotsAtom, bracketsDataAtom, useQueryAtom } from '../state';
import { findIndexOfCurrentRace } from '../common';
import { usePeriodicUpdate } from '../hooks';
import { normalizeString } from './race-utils';

export function useRaceData(raceId: string) {
    const roundData = useAtomValue(roundsDataAtom);
    const [race, updateRace] = useAtom(raceFamilyAtom(raceId));
    const races = useAtomValue(racesAtom);
    const pilots = useAtomValue(pilotsAtom);
    const brackets = useQueryAtom(bracketsDataAtom);
    const currentRaceIndex = findIndexOfCurrentRace(races);
    const isCurrentRace = races[currentRaceIndex]?.ID === raceId;

    usePeriodicUpdate(updateRace, isCurrentRace ? 500 : 10_000);

    const round = roundData.find((r) => r.ID === race.Round);

    // Get bracket data for any race
    const getBracketData = (): Bracket | null => {
        // Get the set of normalized pilot names from the race
        const racePilotNames = new Set(
            race.PilotChannels
                .map((pc) => pilots.find((p) => p.ID === pc.Pilot)?.Name ?? '')
                .filter((name) => name !== '')
                .map(normalizeString),
        );

        // Find the bracket that matches the race pilots
        const matchingBracket = null; /* brackets.find(bracket => {
      const bracketPilotNames = new Set(
        bracket.pilots.map(p => normalizeString(p.name))
      );

      return bracketPilotNames.size === racePilotNames.size &&
             Array.from(racePilotNames).every(name => bracketPilotNames.has(name));
    });*/

        return matchingBracket ?? null;
    };

    const matchingBracket = getBracketData();

    return {
        race,
        round,
        matchingBracket,
        isCurrentRace,
    };
} 