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
// @ts-ignore - TanStack Router type issue, see https://github.com/denoland/deno/issues/30444
import { Link } from '@tanstack/react-router';

function App() {
	// Use the custom hook to handle cursor visibility
	useIdleCursor();
	const { isMobile } = useBreakpoint();
	const activePane = useAtomValue(activePaneAtom);

	return (
		<div className='app-shell'>
			{/* @ts-ignore - TanStack Router type issue, see https://github.com/denoland/deno/issues/30444 */}
			<Link to='/settings' className='app-settings-button' aria-label='Open settings'>
				<svg width='20' height='20' viewBox='0 0 24 24' role='presentation' aria-hidden='true'>
					<path
						fill='currentColor'
						d='M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.39.12-.6l-1.92-3.32c-.11-.21-.36-.3-.58-.22l-2.39.96a7.03 7.03 0 0 0-1.63-.94l-.36-2.54A.487.487 0 0 0 14.9 2h-3.8c-.24 0-.44.17-.48.41l-.36 2.54c-.6.24-1.14.55-1.63.94l-2.39-.96a.487.487 0 0 0-.58.22L3.84 8.07a.485.485 0 0 0 .12.6l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.485.485 0 0 0-.12.6l1.92 3.32c.11.21.36.3.58.22l2.39-.96c.49.39 1.03.71 1.63.94l.36 2.54c.04.24.24.41.48.41h3.8c.24 0 .44-.17.48-.41l.36-2.54c.6-.24 1.14-.55 1.63-.94l2.39.96c.22.09.47-.01.58-.22l1.92-3.32a.485.485 0 0 0-.12-.6l-2.03-1.58Zm-7.14 2.56c-1.55 0-2.81-1.26-2.81-2.81s1.26-2.81 2.81-2.81 2.81 1.26 2.81 2.81-1.26 2.81-2.81 2.81Z'
					/>
				</svg>
			</Link>

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
							<div className='app-main-left'>
								<GenericSuspense id='races-container'>
									<RacesContainer />
								</GenericSuspense>
								<div className='app-legend-inline'>
									<Legend />
								</div>
							</div>
							<div className='app-main-right'>
								<GenericSuspense id='leaderboard'>
									<Leaderboard />
								</GenericSuspense>
							</div>
						</>
					)}
			</div>
			{isMobile && (
				<div className='app-legend'>
					<Legend />
				</div>
			)}
		</div>
	);
}

export default App;
