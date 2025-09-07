import { useAtomValue } from 'jotai';
import { LapsView } from './LapsView.tsx';
import RaceTime from './RaceTime.tsx';
import { currentRaceAtom, lastCompletedRaceAtom } from './race-atoms.ts';

export function CurrentRaceView() {
	const currentRace = useAtomValue(currentRaceAtom);
	const lastCompletedRace = useAtomValue(lastCompletedRaceAtom);
	if (!currentRace || (lastCompletedRace && currentRace.id === lastCompletedRace.id)) {
		return null;
	}
	return (
		<div className='race-box current-race'>
			<div className='race-header'>
				<h3>Current Race</h3>
				<div className='race-timer'>
					<RaceTime />
				</div>
			</div>
			<LapsView key={currentRace.id} raceId={currentRace.id} />
		</div>
	);
}
