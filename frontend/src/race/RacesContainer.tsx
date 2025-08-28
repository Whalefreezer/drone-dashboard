import { useAtomValue } from 'jotai';
import { LapsView } from './LapsView.tsx';
import RaceTime from './RaceTime.tsx';
import { BracketsView } from '../bracket/index.ts';
import { allRacesAtom, currentRaceAtom, currentRaceIndexAtom, lastCompletedRaceAtom } from './race-atoms.ts';

export function RacesContainer() {
    const races = useAtomValue(allRacesAtom);
    const currentRace = useAtomValue(currentRaceAtom);
    const currentRaceIndex = useAtomValue(currentRaceIndexAtom);
    const lastCompletedRace = useAtomValue(lastCompletedRaceAtom);
    
    const raceSubset = races.slice(currentRaceIndex + 1, currentRaceIndex + 1 + 8);

    return (
        <div className='races-container'>
            {lastCompletedRace && (
                <div className='race-box last-race'>
                    <div className='race-header'>
                        <h3>Last Race</h3>
                    </div>
                    <LapsView
                        key={lastCompletedRace.id}
                        raceId={lastCompletedRace.id}
                    />
                </div>
            )}
            {currentRace && (
                <div className='race-box current-race'>
                    <div className='race-header'>
                        <h3>Current Race</h3>
                        <div className='race-timer'>
                            <RaceTime />
                        </div>
                    </div>
                    <LapsView
                        key={currentRace.id}
                        raceId={currentRace.id}
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
                        key={race.id}
                        raceId={race.id}
                    />
                ))}
            </div>
        </div>
    );
}
