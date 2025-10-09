import { useEffect, useState } from 'react';
import { useAtomValue } from 'jotai';
import { currentEventAtom } from '../state/index.ts'; // PB current event
import { currentRaceAtom } from './race-atoms.ts';
import { secondsFromString } from '../common/index.ts'; // Adjusted path

function RaceTime() {
	const currentEvent = useAtomValue(currentEventAtom);
	const currentRace = useAtomValue(currentRaceAtom);
	const raceLength = secondsFromString(String(currentEvent?.raceLength ?? '0:00'));

	const [timeRemaining, setTimeRemaining] = useState(raceLength);

	useEffect(() => {
		// Only start countdown if race has started
		if (currentRace?.start && !currentRace.start.startsWith('0')) {
			const currentRaceStart = new Date(currentRace.start).valueOf() / 1000;
			const currentRaceEnd = currentRaceStart + raceLength;

			const interval = setInterval(() => {
				setTimeRemaining(Math.max(0, currentRaceEnd - (Date.now() / 1000)));
			}, 100);
			return () => {
				clearInterval(interval);
			};
		} else {
			setTimeRemaining(raceLength);
		}
	}, [currentRace?.start, raceLength]);

	return <div className='race-time'>{timeRemaining.toFixed(1)}</div>;
}

export default RaceTime;
