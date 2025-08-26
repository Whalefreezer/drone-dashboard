import './App.css';
import { Suspense } from 'react';
import { TimeDisplay } from './common/index.ts';
import { RacesContainer } from './race/index.ts';
import SnapshotControl from './devTools/SnapshotControl.tsx';
import { useIdleCursor } from './common/useIdleCursor.ts';
import { Leaderboard } from './leaderboard/Leaderboard.tsx';
import { EliminatedPilotsView } from './bracket/index.ts';

function App() {
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
