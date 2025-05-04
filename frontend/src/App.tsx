import './App.css';
import { useAtomValue, useSetAtom } from 'jotai';
import {
    // bracketsDataAtom, // Moved to bracket/
    // findEliminatedPilots, // Moved to bracket/
    // pilotsAtom, // Moved to bracket/
    racesAtom,
    roundsDataAtom,
    usePeriodicUpdate,
    // useQueryAtom, // Moved to bracket/
} from './state/index.ts';
import {
    findIndexOfCurrentRace,
    findIndexOfLastRace,
    // getPositionWithSuffix, // Moved to bracket/
} from './common/index.ts';
import { TimeDisplay } from './common/index.ts';
import { LapsView } from './race/LapsView.tsx';
import RaceTime from './race/RaceTime.tsx';
import SnapshotControl from './devTools/SnapshotControl.tsx';
import { useIdleCursor } from './common/useIdleCursor.ts';
import { Leaderboard } from './leaderboard/Leaderboard.tsx';
import { BracketsView, EliminatedPilotsView } from './bracket/index.ts';

function App() {
    const races = useAtomValue(racesAtom);
    const updateRoundsData = useSetAtom(roundsDataAtom);
    const currentRaceIndex = findIndexOfCurrentRace(races);
    const lastRaceIndex = findIndexOfLastRace(races);
    const raceSubset = races.slice(currentRaceIndex + 1, currentRaceIndex + 1 + 8);

    usePeriodicUpdate(updateRoundsData, 10_000);

    // Use the custom hook to handle cursor visibility
    useIdleCursor();

    return (
        <>
            <SnapshotControl />

            <div
                style={{
                    textAlign: 'center',
                    borderBottom: '1px solid #333',
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    backgroundColor: '#1a1a1a',
                    zIndex: 100,
                }}
            >
                <TimeDisplay />
            </div>
            <div className='app-container' style={{ marginTop: '40px' }}>
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
                    <Leaderboard />
                    <EliminatedPilotsView />

                    {/* <Legend /> */}
                    {
                        /* <div className="qr-code-container">
            <QRCodeSVG
              value="https://nzo.roboenator.com"
              size={230}
              bgColor="#FFF"
              fgColor="#000"
              level="L"
              style={{ backgroundColor: '#FFF', padding: '8px', borderRadius: '4px' }}
            />
          </div> */
                    }
            </div>
        </>
    );
}

export default App;
