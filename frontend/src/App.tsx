import './App.css';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import {
    Bracket,
    BracketPilot,
    bracketsDataAtom,
    calculateLeaderboardData,
    channelsDataAtom,
    eventDataAtom,
    findEliminatedPilots,
    getPositionChanges,
    overallBestTimesAtom,
    pilotsAtom,
    raceFamilyAtom,
    racesAtom,
    RaceWithProcessedLaps,
    roundsDataAtom,
    usePeriodicUpdate,
    useQueryAtom,
} from './state/index.ts';
import { PilotChannel } from './types/index.ts';
import {
    CONSECUTIVE_LAPS,
    findIndexOfCurrentRace,
    findIndexOfLastRace,
    getLapClassName,
    getPositionWithSuffix,
    secondsFromString,
} from './common/index.ts';
import { DaySchedule } from './race/index.ts';
import { TimeDisplay } from './common/index.ts';
import { LapsView } from './race/LapsView.tsx';
import { ChannelSquare } from './common/ChannelSquare.tsx';
import Legend from './common/Legend.tsx';
import RaceTime from './race/RaceTime.tsx';
import { PilotChannelView } from './pilot/index.ts';
import ScenarioSelector from './common/ScenarioSelector.tsx';

function App() {
    const races = useAtomValue(racesAtom);
    const updateRoundsData = useSetAtom(roundsDataAtom);
    const currentRaceIndex = findIndexOfCurrentRace(races);
    const lastRaceIndex = findIndexOfLastRace(races);
    const raceSubset = races.slice(currentRaceIndex + 1, currentRaceIndex + 1 + 8);

    usePeriodicUpdate(updateRoundsData, 10_000);

    // Check for the dev flag - No longer needed here for selector
    // const urlParams = useMemo(() => new URLSearchParams(globalThis.location.search), []);
    // const isDevMode = urlParams.get('dev') === '1';

    return (
        <>
            {/* Scenario Selector is now rendered independently in main.tsx */}
            {/* {isDevMode && <ScenarioSelector />} */}

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
                {
                    /* <div className="schedule-container">
          <div className="schedule-wrapper">
            <DaySchedule {...scheduleData.sunday} />
          </div>
        </div> */
                }
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

function formatTimeDifference(newTime: number, oldTime: number): string {
    const diff = oldTime - newTime;
    return diff > 0 ? `-${diff.toFixed(3)}` : `+${(-diff).toFixed(3)}`;
}

function Leaderboard() {
    const races = useAtomValue(racesAtom);
    const pilots = useAtomValue(pilotsAtom);
    const channels = useAtomValue(channelsDataAtom);
    const roundData = useAtomValue(roundsDataAtom);
    const currentRaceIndex = findIndexOfCurrentRace(races);
    const brackets = useQueryAtom(bracketsDataAtom);
    const eliminatedPilots = findEliminatedPilots(brackets);

    // Add early return if there are no races
    if (races.length === 0) {
        return (
            <div className='leaderboard'>
                <h3>Fastest Laps Overall</h3>
                <div>No races available</div>
            </div>
        );
    }

    // Memoize the leaderboard calculations
    const [currentLeaderboard, previousLeaderboard] = useMemo(() => {
        // Calculate current leaderboard
        const current = calculateLeaderboardData(
            races,
            pilots,
            channels,
            currentRaceIndex,
            brackets,
        );

        // Calculate previous leaderboard by excluding the current race AND the last race
        const previous = calculateLeaderboardData(
            races.slice(0, Math.max(0, currentRaceIndex - 1)),
            pilots,
            channels,
            currentRaceIndex - 2,
            brackets,
        );

        return [current, previous];
    }, [races, pilots, channels, currentRaceIndex, brackets]);

    // Get position changes
    const positionChanges = useMemo(
        () => getPositionChanges(currentLeaderboard, previousLeaderboard),
        [currentLeaderboard, previousLeaderboard],
    );

    // Helper to check if a time is from recent races
    const isRecentTime = useCallback((roundId: string, raceNumber: number) => {
        const raceIndex = races.findIndex((race) =>
            race.Round === roundId && race.RaceNumber === raceNumber
        );
        return raceIndex === currentRaceIndex || raceIndex === currentRaceIndex - 1;
    }, [races, currentRaceIndex]);

    // Add this new state to track which rows should be animated
    const [animatingRows, setAnimatingRows] = useState<Set<string>>(new Set());

    // Add this effect to handle animations when positions change
    useEffect(() => {
        const newAnimatingRows = new Set<string>();

        currentLeaderboard.forEach((entry, index) => {
            const prevPos = positionChanges.get(entry.pilot.ID);
            if (prevPos && prevPos > index + 1) {
                newAnimatingRows.add(entry.pilot.ID);
            }
        });

        setAnimatingRows(newAnimatingRows);

        // Clear animations after they complete
        const timer = setTimeout(() => {
            setAnimatingRows(new Set());
        }, 1000); // Match this to animation duration

        return () => clearTimeout(timer);
    }, [currentLeaderboard, positionChanges]);

    // Helper to render position changes
    const renderPositionChange = useCallback((pilotId: string, currentPos: number) => {
        const prevPos = positionChanges.get(pilotId);
        if (!prevPos || prevPos === currentPos) return null;

        const change = prevPos - currentPos;
        // Only show improvements (positive changes)
        if (change <= 0) return null;

        return (
            <span
                className='position-change'
                style={{ color: '#00ff00', marginLeft: '4px', fontSize: '0.8em' }}
            >
                ↑{change} from {prevPos}
            </span>
        );
    }, [positionChanges]);

    // Helper to render time with difference
    const renderTimeWithDiff = useCallback((
        currentTime: { time: number; roundId: string; raceNumber: number } | null,
        previousTime: { time: number; roundId: string; raceNumber: number } | null,
        isRecent: boolean,
    ) => {
        if (!currentTime) return '-';

        const showDiff = previousTime &&
            previousTime.time !== currentTime.time &&
            isRecent;

        return (
            <div
                className={isRecent ? 'recent-time' : ''}
                style={{ display: 'flex', flexDirection: 'column' }}
            >
                <div>
                    {currentTime.time.toFixed(3)}
                    <span className='source-info'>
                        ({roundData.find((r) => r.ID === currentTime.roundId)?.RoundNumber}-
                        {currentTime.raceNumber})
                    </span>
                </div>
                {showDiff && (
                    <div
                        style={{
                            fontSize: '0.8em',
                            color: previousTime.time > currentTime.time ? '#00ff00' : '#ff0000',
                        }}
                    >
                        {formatTimeDifference(currentTime.time, previousTime.time)}
                    </div>
                )}
            </div>
        );
    }, [roundData]);

    return (
        <div className='leaderboard'>
            {/* <h3>Fastest Laps Overall</h3> */}
            {
                /* <div style={{
        backgroundColor: '#2a2a2a',
        padding: '8px',
        marginBottom: '12px',
        borderRadius: '4px',
        border: '1px solid #444',
        color: '#ff9900',
        fontSize: '0.9em'
      }}>
        ⚠️ Note: Positions shown are estimates only and not final race results
      </div> */
            }
            <table className='leaderboard-table'>
                <thead>
                    <tr>
                        <th>Pos</th>
                        <th>Pilot</th>
                        <th>Chan</th>
                        <th>Laps</th>
                        <th>Holeshot</th>
                        <th>Top Lap</th>
                        <th>Top {CONSECUTIVE_LAPS} Consec</th>
                        <th>Next Race In</th>
                    </tr>
                </thead>
                <tbody>
                    {currentLeaderboard.map((entry, index) => {
                        const previousEntry = previousLeaderboard.find(
                            (prev) => prev.pilot.ID === entry.pilot.ID,
                        );

                        const isEliminated = eliminatedPilots.some(
                            (pilot) =>
                                pilot.name.toLowerCase().replace(/\s+/g, '') ===
                                    entry.pilot.Name.toLowerCase().replace(/\s+/g, ''),
                        );

                        return (
                            <tr
                                key={entry.pilot.ID}
                                className={animatingRows.has(entry.pilot.ID)
                                    ? 'position-improved'
                                    : ''}
                            >
                                <td>
                                    <div className='position-container'>
                                        <div>{index + 1}</div>
                                        {renderPositionChange(entry.pilot.ID, index + 1)}
                                    </div>
                                </td>
                                <td>{entry.pilot.Name}</td>
                                <td>
                                    {entry.channel
                                        ? (
                                            <div className='channel-display'>
                                                {entry.channel.ShortBand}
                                                {entry.channel.Number}
                                                <ChannelSquare channelID={entry.channel.ID} />
                                            </div>
                                        )
                                        : '-'}
                                </td>
                                <td>{entry.totalLaps}</td>
                                <td>
                                    {renderTimeWithDiff(
                                        entry.bestHoleshot || null,
                                        previousEntry?.bestHoleshot || null,
                                        entry.bestHoleshot
                                            ? isRecentTime(
                                                entry.bestHoleshot.roundId,
                                                entry.bestHoleshot.raceNumber,
                                            )
                                            : false,
                                    )}
                                </td>
                                <td>
                                    {renderTimeWithDiff(
                                        entry.bestLap || null,
                                        previousEntry?.bestLap || null,
                                        entry.bestLap
                                            ? isRecentTime(
                                                entry.bestLap.roundId,
                                                entry.bestLap.raceNumber,
                                            )
                                            : false,
                                    )}
                                </td>
                                <td>
                                    {renderTimeWithDiff(
                                        entry.consecutiveLaps || null,
                                        previousEntry?.consecutiveLaps || null,
                                        entry.consecutiveLaps
                                            ? isRecentTime(
                                                entry.consecutiveLaps.roundId,
                                                entry.consecutiveLaps.raceNumber,
                                            )
                                            : false,
                                    )}
                                </td>
                                <td>
                                    {entry.racesUntilNext === -1 && isEliminated
                                        ? <span className='done-text'>Done</span>
                                        : entry.racesUntilNext === -1
                                        ? (
                                            '-'
                                        )
                                        : entry.racesUntilNext === 0
                                        ? <span className='next-text'>To Staging</span>
                                        : entry.racesUntilNext === -2
                                        ? <span className='racing-text'>Racing</span>
                                        : (
                                            `${entry.racesUntilNext}`
                                        )}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
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
