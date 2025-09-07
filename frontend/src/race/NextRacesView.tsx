import { useAtomValue } from 'jotai';
import { NextRaceCompact } from './NextRaceCompact.tsx';
import { nextRacesAtom } from './race-atoms.ts';

export function NextRacesView() {
	const nextRaces = useAtomValue(nextRacesAtom);
	return (
		<div className='race-box next-races'>
			<div className='race-header'>
				<h3>Next Races</h3>
			</div>
			{nextRaces.map((race) => <NextRaceCompact key={race.id} raceId={race.id} />)}
		</div>
	);
}
