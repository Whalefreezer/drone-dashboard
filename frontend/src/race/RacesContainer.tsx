import { useAtomValue } from 'jotai';
import { LapsView } from './LapsView.tsx';
import RaceTime from './RaceTime.tsx';
import { currentRaceAtom, lastRaceAtom, nextRacesAtom } from './race-atoms.ts';
import { NextRaceCompact } from './NextRaceCompact.tsx';

export function RacesContainer() {
	const currentRace = useAtomValue(currentRaceAtom);
	const lastRace = useAtomValue(lastRaceAtom);
	const nextRaces = useAtomValue(nextRacesAtom);

	// Hide current race when there's only one race and it matches the last race
	const showCurrentRace = !!currentRace && !(lastRace && currentRace.id === lastRace.id);

	return (
		<div className='races-container'>
			{lastRace && (
				<div className='race-box last-race'>
					<div className='race-header'>
						<h3>Last Race</h3>
					</div>
					<LapsView
						key={lastRace.id}
						raceId={lastRace.id}
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
			<div className='race-box next-races'>
				<div className='race-header'>
					<h3>Next Races</h3>
				</div>
				{nextRaces.map((race) => <NextRaceCompact key={race.id} raceId={race.id} />)}
			</div>
		</div>
	);
}
