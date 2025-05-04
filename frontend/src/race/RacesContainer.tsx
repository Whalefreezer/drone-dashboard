import { useAtomValue } from 'jotai';
import { Race } from '../types/types.ts';
import { LapsView } from './LapsView.tsx';
import RaceTime from './RaceTime.tsx';
import { BracketsView } from '../bracket/index.ts';
import { racesAtom } from '../state/index.ts';
import { findIndexOfCurrentRace, findIndexOfLastRace } from '../common/index.ts';

interface RacesContainerProps {
    // No props needed now
}

export function RacesContainer(/* No props needed */) {
    const races = useAtomValue(racesAtom);
    const currentRaceIndex = findIndexOfCurrentRace(races);
    const lastRaceIndex = findIndexOfLastRace(races);
    const raceSubset = races.slice(currentRaceIndex + 1, currentRaceIndex + 1 + 8);

    return (
        <div className='races-container'>
            {lastRaceIndex !== -1 && (
                <div className='race-box last-race'>
                    <div className='race-header'>
                        <h3>Last Race</h3>
                    </div>
                    <LapsView
                        key={races[lastRaceIndex].ID}
                        raceId={races[lastRaceIndex].ID}
                    />
                </div>
            )}
            {currentRaceIndex !== -1 && (
                <div className='race-box current-race'>
                    <div className='race-header'>
                        <h3>Current Race</h3>
                        <div className='race-timer'>
                            <RaceTime />
                        </div>
                    </div>
                    <LapsView
                        key={races[currentRaceIndex].ID}
                        raceId={races[currentRaceIndex].ID}
                    />
                </div>
            )}
            <BracketsView />
            <div className='race-box next-races'>
                <div className='race-header'>
                    <h3>Next Races</h3>
                </div>
                {raceSubset.map((race) => (
                    <LapsView
                        key={race.ID}
                        raceId={race.ID}
                    />
                ))}
            </div>
        </div>
    );
} 