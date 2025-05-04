import './App.css';
import { useAtomValue, useSetAtom } from 'jotai';
import {
    racesAtom,
    roundsDataAtom,
    usePeriodicUpdate,
} from './state/index.ts';
import {
    TimeDisplay,
} from './common/index.ts';
import { RacesContainer } from './race/index.ts';
import SnapshotControl from './devTools/SnapshotControl.tsx';
import { useIdleCursor } from './common/useIdleCursor.ts';
import { Leaderboard } from './leaderboard/Leaderboard.tsx';
import { EliminatedPilotsView } from './bracket/index.ts';

function App() {
    const races = useAtomValue(racesAtom);
    const updateRoundsData = useSetAtom(roundsDataAtom);

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
                <RacesContainer />
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
