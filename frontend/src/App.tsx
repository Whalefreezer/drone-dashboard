import './App.css';
import { useEffect, useRef } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import {
    Bracket,
    BracketPilot,
    bracketsDataAtom,
    eventDataAtom,
    findEliminatedPilots,
    overallBestTimesAtom,
    pilotsAtom,
    raceFamilyAtom,
    racesAtom,
    RaceWithProcessedLaps,
    roundsDataAtom,
    usePeriodicUpdate,
    useQueryAtom,
} from './state/index.ts';
import { PilotChannel, Pilot, Round } from './types/index.ts';
import {
    findIndexOfCurrentRace,
    findIndexOfLastRace,
    getLapClassName,
    getPositionWithSuffix,
    secondsFromString,
} from './common/index.ts';
import { DaySchedule } from './race/index.ts';
import { TimeDisplay } from './common/index.ts';
import { LapsView } from './race/LapsView.tsx';
import Legend from './common/Legend.tsx';
import RaceTime from './race/RaceTime.tsx';
import { PilotChannelView } from './pilot/index.ts';
import ScenarioSelector from './common/ScenarioSelector.tsx';
import SnapshotControl from './common/SnapshotControl.tsx';
import { useIdleCursor } from './common/useIdleCursor.ts';
import { Leaderboard } from './leaderboard/Leaderboard.tsx';

function App() {
    const races = useAtomValue(racesAtom);
    const updateRoundsData = useSetAtom(roundsDataAtom);
    const currentRaceIndex = findIndexOfCurrentRace(races);
    const lastRaceIndex = findIndexOfLastRace(races);
    const raceSubset = races.slice(currentRaceIndex + 1, currentRaceIndex + 1 + 8);

    usePeriodicUpdate(updateRoundsData, 10_000);

    // Use the custom hook to handle cursor visibility
    useIdleCursor();

    return (
        <>
            <SnapshotControl />

            <div
                style={{
                    textAlign: 'center',
                    borderBottom: '1px solid #333',
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    backgroundColor: '#1a1a1a',
                    zIndex: 100,
                }}
            >
                <TimeDisplay />
            </div>
            <div className='app-container' style={{ marginTop: '40px' }}>
                <div className='races-container'>
                    {lastRaceIndex !== -1 && (
                        <div className='race-box last-race'>
                            <div className='race-header'>
                                <h3>Last Race</h3>
                            </div>
                            <LapsView
                                key={races[lastRaceIndex].ID}
                                raceId={races[lastRaceIndex].ID}
                            />
                        </div>
                    )}
                    {currentRaceIndex !== -1 && (
                        <div className='race-box current-race'>
                            <div className='race-header'>
                                <h3>Current Race</h3>
                                <div className='race-timer'>
                                    <RaceTime />
                                </div>
                            </div>
                            <LapsView
                                key={races[currentRaceIndex].ID}
                                raceId={races[currentRaceIndex].ID}
                            />
                        </div>
                    )}
                    <BracketsView />
                    <div className='race-box next-races'>
                        <div className='race-header'>
                            <h3>Next Races</h3>
                        </div>
                        {raceSubset.map((race) => (
                            <LapsView
                                key={race.ID}
                                raceId={race.ID}
                            />
                        ))}
                    </div>
                </div>
                <div className='leaderboard-container'>
                    <Leaderboard />
                    {/* <EliminatedPilotsView /> */}

                    {/* <Legend /> */}
                    {
                        /* <div className="qr-code-container">
            <QRCodeSVG
              value="https://nzo.roboenator.com"
              size={230}
              bgColor="#FFF"
              fgColor="#000"
              level="L"
              style={{ backgroundColor: '#FFF', padding: '8px', borderRadius: '4px' }}
            />
          </div> */
                    }
                </div>
            </div>
        </>
    );
}

function BracketsView() {
    const brackets = useQueryAtom(bracketsDataAtom);
    const races = useAtomValue(racesAtom);
    const pilots = useAtomValue(pilotsAtom);
    const currentRaceIndex = findIndexOfCurrentRace(races);

    if (currentRaceIndex === -1) {
        return null;
    }

    const currentRace = races[currentRaceIndex];

    // Normalize names by removing whitespace and converting to lowercase
    const normalizeString = (str: string) => str.toLowerCase().replace(/\s+/g, '');

    // Get the set of normalized pilot names from the current race
    const currentRacePilotNames = new Set(
        currentRace.PilotChannels
            .map((pc) => pilots.find((p) => p.ID === pc.Pilot)?.Name ?? '')
            .filter((name) => name !== '')
            .map(normalizeString),
    );

    // Find the bracket that matches the current race pilots
    const matchingBracket = brackets.find((bracket) => {
        const bracketPilotNames = new Set(
            bracket.pilots.map((p: BracketPilot) => normalizeString(p.name)),
        );

        return bracketPilotNames.size === currentRacePilotNames.size &&
            Array.from(currentRacePilotNames).every((name) => bracketPilotNames.has(name));
    });

    if (!matchingBracket) return null;

    return (
        <div className='brackets-container'>
            <div className='bracket'>
                <h3>Bracket: {matchingBracket.name}</h3>
                <table className='bracket-table'>
                    <thead>
                        <tr>
                            <th>Seed</th>
                            <th>Pilot</th>
                            <th>Points</th>
                            {matchingBracket.pilots[0]?.rounds.map((
                                _: number | null,
                                roundIndex: number,
                            ) => <th key={roundIndex}>R{roundIndex + 1}</th>)}
                        </tr>
                    </thead>
                    <tbody>
                        {matchingBracket.pilots.map((pilot: BracketPilot, pilotIndex: number) => (
                            <tr key={pilotIndex}>
                                <td>{pilot.seed}</td>
                                <td>{pilot.name}</td>
                                <td>{pilot.points}</td>
                                {pilot.rounds.map((round: number | null, roundIndex: number) => (
                                    <td key={roundIndex}>{round ?? '-'}</td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function EliminatedPilotsView() {
    const brackets = useQueryAtom(bracketsDataAtom);
    const eliminatedPilots = findEliminatedPilots(brackets);

    if (eliminatedPilots.length === 0) {
        return null;
    }

    return (
        <div className='race-box eliminated-pilots'>
            <div className='race-header'>
                <h3>Eliminated Pilots maybe...?</h3>
            </div>
            <table className='bracket-table'>
                <thead>
                    <tr>
                        <th>Pilot</th>
                        <th>Bracket</th>
                        <th>Position</th>
                        <th>Points</th>
                    </tr>
                </thead>
                <tbody>
                    {eliminatedPilots.map((pilot, index) => (
                        <tr key={index}>
                            <td>{pilot.name}</td>
                            <td>{pilot.bracket}</td>
                            <td>{getPositionWithSuffix(pilot.position)}</td>
                            <td>{pilot.points}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

export default App;
