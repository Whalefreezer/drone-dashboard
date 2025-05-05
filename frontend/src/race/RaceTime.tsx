import { useEffect, useState } from 'react';
import { useAtomValue } from 'jotai';
import { eventDataAtom, racesAtom, useQueryAtom } from '../state/index.ts'; // Adjusted path
import { findIndexOfCurrentRace, secondsFromString } from '../common/index.ts'; // Adjusted path

function RaceTime() {
    const eventData = useQueryAtom(eventDataAtom);
    const races = useAtomValue(racesAtom);
    const currentRaceIndex = findIndexOfCurrentRace(races);
    const currentRace = races[currentRaceIndex];
    const raceLength = secondsFromString(eventData[0].RaceLength);

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
