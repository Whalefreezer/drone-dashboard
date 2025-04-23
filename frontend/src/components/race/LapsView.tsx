import { useAtom, useAtomValue } from 'jotai';
import { Bracket } from '@/types';
import {
    bracketsDataAtom,
    pilotsAtom,
    raceFamilyAtom,
    racesAtom,
    roundsDataAtom,
    usePeriodicUpdate,
    useQueryAtom,
} from '@/state';
import { findIndexOfCurrentRace } from '@/common';
import { LapsTable } from './LapsTable';

interface LapsViewProps {
    raceId: string;
}

export function LapsView({ raceId }: LapsViewProps) {
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
        // Normalize names by removing whitespace and converting to lowercase
        const normalizeString = (str: string) => str.toLowerCase().replace(/\s+/g, '');

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

    return (
        <div className='laps-view'>
            <div className='race-info'>
                <div className='race-number'>
                    {round?.RoundNumber}-{race.RaceNumber}
                    {matchingBracket && (
                        <span style={{ marginLeft: '8px', color: '#888' }}>
                            ({matchingBracket.name})
                        </span>
                    )}
                </div>
                <LapsTable race={race} matchingBracket={matchingBracket} />
            </div>
        </div>
    );
} 