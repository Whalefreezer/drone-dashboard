import './App.css';

import { Legend, TimeDisplay } from './common/index.ts';
import { RacesContainer } from './race/index.ts';
import SnapshotControl from './devTools/SnapshotControl.tsx';
import { useIdleCursor } from './common/useIdleCursor.ts';
import { Leaderboard } from './leaderboard/Leaderboard.tsx';
import { EliminatedPilotsView } from './bracket/index.ts';
import { GenericSuspense } from './common/GenericSuspense.tsx';

function App() {
	// Use the custom hook to handle cursor visibility
	useIdleCursor();

	return (
		<>
			<GenericSuspense id='snapshot-control'>
				<SnapshotControl />
			</GenericSuspense>

			<div className='app-header'>
				<GenericSuspense id='time-display'>
					<TimeDisplay />
				</GenericSuspense>
			</div>
			<div className='app-main-content'>
				<GenericSuspense id='races-container'>
					<RacesContainer />
				</GenericSuspense>
				<GenericSuspense id='leaderboard'>
					<Leaderboard />
				</GenericSuspense>
				<GenericSuspense id='eliminated-pilots-view'>
					<EliminatedPilotsView />
				</GenericSuspense>
			</div>

			<div className='app-legend'>
				<Legend />
			</div>
		</>
	);
}

export default App;
