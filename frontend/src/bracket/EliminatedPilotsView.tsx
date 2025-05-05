import React from 'react';
import { bracketsDataAtom, findEliminatedPilots, useQueryAtom } from '../state/index.ts';
import { EliminatedPilot } from './bracket-types.ts';
import { getPositionWithSuffix } from '../common/index.ts';

export function EliminatedPilotsView() {
    const brackets = useQueryAtom(bracketsDataAtom);
    const eliminatedPilots = findEliminatedPilots(brackets);

    if (eliminatedPilots.length === 0) {
        return null;
    }

    return (
        <div className='race-box eliminated-pilots'>
            <div className='race-header'>
                <h3>Eliminated Pilots</h3>
            </div>
            <table className='bracket-table'>
                <thead>
                    <tr>
                        <th>Pilot</th>
                        <th>Bracket</th>
                        <th>Position</th>
                        <th>Points</th>
                    </tr>
                </thead>
                <tbody>
                    {eliminatedPilots.map((pilot: EliminatedPilot, index: number) => (
                        <tr key={index}>
                            <td>{pilot.name}</td>
                            <td>{pilot.bracket}</td>
                            <td>{getPositionWithSuffix(pilot.position)}</td>
                            <td>{pilot.points}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
