import './App.css';
import { useSetAtom } from 'jotai';
import { roundsDataAtom, usePeriodicUpdate } from './state/index.ts';
import { TimeDisplay } from './common/index.ts';
import { RacesContainer } from './race/index.ts';
import SnapshotControl from './devTools/SnapshotControl.tsx';
import { useIdleCursor } from './common/useIdleCursor.ts';
import { Leaderboard } from './leaderboard/Leaderboard.tsx';
import { EliminatedPilotsView } from './bracket/index.ts';

function App() {
    const updateRoundsData = useSetAtom(roundsDataAtom);

    usePeriodicUpdate(updateRoundsData, 10_000);

    // Use the custom hook to handle cursor visibility
    useIdleCursor();

    return (
        <>
            <SnapshotControl />

            <div className='app-header'>
                <TimeDisplay />
            </div>
            <div className='app-main-content'>
                <RacesContainer />
                <Leaderboard />
                <EliminatedPilotsView />

                {/* <Legend /> */}
            </div>
        </>
    );
}

export default App;
