import './App.css';

import { Legend, TimeDisplay, ViewSelector } from './common/index.ts';
import { RacesContainer } from './race/index.ts';
import SnapshotControl from './devTools/SnapshotControl.tsx';
import { useIdleCursor } from './common/useIdleCursor.ts';
import { Leaderboard } from './leaderboard/Leaderboard.tsx';
import { BracketsView, EliminatedPilotsView } from './bracket/index.ts';
import { GenericSuspense } from './common/GenericSuspense.tsx';
import { useAtomValue } from 'jotai';
import useBreakpoint from './responsive/useBreakpoint.ts';
import { activePaneAtom } from './state/viewAtoms.ts';

function App() {
	// Use the custom hook to handle cursor visibility
	useIdleCursor();
	const { isMobile } = useBreakpoint();
	const activePane = useAtomValue(activePaneAtom);

	return (
		<div className='app-shell'>
			<GenericSuspense id='snapshot-control'>
				<SnapshotControl />
			</GenericSuspense>

			{!isMobile && (
				<div className='app-header'>
					<GenericSuspense id='time-display'>
						<TimeDisplay />
					</GenericSuspense>
				</div>
			)}
			{isMobile && <ViewSelector />}
			<div className={'app-main-content' + (isMobile ? ' mobile' : '')}>
				{isMobile
					? (
						<>
							{activePane === 'leaderboard' && (
								<GenericSuspense id='leaderboard'>
									<Leaderboard />
								</GenericSuspense>
							)}
							{activePane === 'races' && (
								<GenericSuspense id='races-container'>
									<RacesContainer />
								</GenericSuspense>
							)}
							{activePane === 'brackets' && (
								<GenericSuspense id='brackets'>
									<BracketsView />
								</GenericSuspense>
							)}
							{activePane === 'eliminated' && (
								<GenericSuspense id='eliminated-pilots-view'>
									<EliminatedPilotsView />
								</GenericSuspense>
							)}
						</>
					)
					: (
						<>
							<GenericSuspense id='races-container'>
								<RacesContainer />
							</GenericSuspense>
							<GenericSuspense id='leaderboard'>
								<Leaderboard />
							</GenericSuspense>
							<GenericSuspense id='eliminated-pilots-view'>
								<EliminatedPilotsView />
							</GenericSuspense>
						</>
					)}
			</div>
			<div className='app-legend'>
				<Legend />
			</div>
		</div>
	);
}

export default App;
