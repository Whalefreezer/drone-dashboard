import { useEffect, useState } from 'react';
import { useAtomValue } from 'jotai';
import { currentEventAtom, racesAtom } from '../state/index.ts'; // PB current event
import { findIndexOfCurrentRace, secondsFromString } from '../common/index.ts'; // Adjusted path

function RaceTime() {
    const currentEvent = useAtomValue(currentEventAtom);
    const races = useAtomValue(racesAtom);
    const currentRaceIndex = findIndexOfCurrentRace(races);
    const currentRace = races[currentRaceIndex];
    const raceLength = secondsFromString(String(currentEvent?.raceLength ?? '0:00'));

    const [timeRemaining, setTimeRemaining] = useState(raceLength);

    useEffect(() => {
        // Only start countdown if race has started
        if (currentRace.Start) {
            const currentRaceStart = new Date(currentRace.Start).valueOf() / 1000;
            const currentRaceEnd = currentRaceStart + raceLength;

            const interval = setInterval(() => {
                setTimeRemaining(
                    Math.max(0, currentRaceEnd - (new Date().valueOf() / 1000)),
                );
            }, 100);
            return () => clearInterval(interval);
        } else {
            setTimeRemaining(raceLength);
        }
    }, [currentRace.Start, raceLength]);

    return <div className='race-time'>{timeRemaining.toFixed(1)}</div>;
}

export default RaceTime;
