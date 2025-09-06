import { useAtomValue } from 'jotai';
import { LapsView } from './LapsView.tsx';
import RaceTime from './RaceTime.tsx';
import { BracketsView } from '../bracket/index.ts';
import { allRacesAtom, currentRaceAtom, lastCompletedRaceAtom, nextRacesAtom } from './race-atoms.ts';
import { NextRaceCompact } from './NextRaceCompact.tsx';

export function RacesContainer() {
	const races = useAtomValue(allRacesAtom);
	const currentRace = useAtomValue(currentRaceAtom);
	const lastCompletedRace = useAtomValue(lastCompletedRaceAtom);
	const nextRaces = useAtomValue(nextRacesAtom);

	// Hide current race when there's only one race and it matches the last completed race
	const showCurrentRace = !!currentRace && !(lastCompletedRace && currentRace.id === lastCompletedRace.id);

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
			{showCurrentRace && (
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
				{nextRaces.map((race) => <NextRaceCompact key={race.id} raceId={race.id} />)}
			</div>
		</div>
	);
}
