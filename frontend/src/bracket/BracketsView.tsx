import React from 'react';
import { useAtomValue } from 'jotai';
import { bracketsDataAtom, pilotsAtom, racesAtom, useQueryAtom } from '../state/index.ts';
import { BracketPilot } from './bracket-types.ts';
import { findIndexOfCurrentRace } from '../common/index.ts';

export function BracketsView() {
    const brackets = useQueryAtom(bracketsDataAtom);
    const races = useAtomValue(racesAtom);
    const pilots = useQueryAtom(pilotsAtom);
    const currentRaceIndex = findIndexOfCurrentRace(races);

    if (currentRaceIndex === -1) {
        return null;
    }

    const currentRace = races[currentRaceIndex];

    // Normalize names by removing whitespace and converting to lowercase
    const normalizeString = (str: string) => str.toLowerCase().replace(/\s+/g, '');

    // Get the set of normalized pilot names from the current race
    const currentRacePilotNames = new Set(
        currentRace.PilotChannels
            .map((pc) => pilots.find((p) => p.ID === pc.Pilot)?.Name ?? '')
            .filter((name) => name !== '')
            .map(normalizeString),
    );

    // Find the bracket that matches the current race pilots
    const matchingBracket = brackets.find((bracket) => {
        const bracketPilotNames = new Set(
            bracket.pilots.map((p: BracketPilot) => normalizeString(p.name)),
        );

        return bracketPilotNames.size === currentRacePilotNames.size &&
            Array.from(currentRacePilotNames).every((name) => bracketPilotNames.has(name));
    });

    if (!matchingBracket) return null;

    return (
        <div className='brackets-container'>
            <div className='bracket'>
                <h3>Bracket: {matchingBracket.name}</h3>
                <table className='bracket-table'>
                    <thead>
                        <tr>
                            <th>Seed</th>
                            <th>Pilot</th>
                            <th>Points</th>
                            {matchingBracket.pilots[0]?.rounds.map((
                                _: number | null,
                                roundIndex: number,
                            ) => <th key={roundIndex}>R{roundIndex + 1}</th>)}
                        </tr>
                    </thead>
                    <tbody>
                        {matchingBracket.pilots.map((pilot: BracketPilot, pilotIndex: number) => (
                            <tr key={pilotIndex}>
                                <td>{pilot.seed}</td>
                                <td>{pilot.name}</td>
                                <td>{pilot.points}</td>
                                {pilot.rounds.map((round: number | null, roundIndex: number) => (
                                    <td key={roundIndex}>{round ?? '-'}</td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
