import "./App.css";
// @deno-types="@types/react"
import { useEffect, useState, useMemo, useCallback } from "react";
import { useAtom, useAtomValue } from "jotai";
import {
  channelsDataAtom,
  eventDataAtom,
  pilotsAtom,
  raceFamilyAtom,
  racesAtom,
  RaceWithProcessedLaps,
  roundsDataAtom,
  overallBestTimesAtom,
  useQueryAtom,
  usePeriodicUpdate,
  calculateLeaderboardData,
  getPositionChanges,
  LeaderboardEntry,
  bracketsDataAtom,
  Bracket,
  BracketPilot,
  findEliminatedPilots,
  EliminatedPilot
} from "./state.ts";
import { useSetAtom } from "jotai";
import { PilotChannel } from "./types.ts";
import { QRCodeSVG } from 'qrcode.react';
import { 
  getPositionWithSuffix, 
  secondsFromString, 
  getLapClassName,
  calculateRacesUntilNext,
  calculateBestTimes,
  sortPilotEntries,
  findIndexOfCurrentRace,
  findIndexOfLastRace,
  CONSECUTIVE_LAPS
} from "./utils.ts";
import DaySchedule from './components/DaySchedule.tsx';

const UPDATE = true;

const scheduleData = {
  friday: {
    date: "Friday 14/02",
    events: [
      {
        startTime: "8:00 AM",
        endTime: "8:30am",
        title: "Pilots Arrive",
        type: "mandatory"
      },
      {
        startTime: "8:15 AM",
        endTime: "8:45am",
        title: "Scrutineering",
        type: "mandatory"
      },
      {
        startTime: "8:45 AM",
        type: "buffer"
      },
      {
        startTime: "9:00 AM",
        endTime: "9:30am",
        title: "Mandatory Briefing",
        type: "mandatory"
      },
      {
        startTime: "9:30 AM",
        type: "buffer"
      },
      {
        startTime: "9:45 AM",
        endTime: "12:30pm",
        title: "Practice",
        type: "practice"
      },
      {
        startTime: "12:30 PM",
        endTime: "1:00pm",
        title: "Lunch & Organiser Break",
        type: "break"
      },
      {
        startTime: "1:00 PM",
        endTime: "4:30pm",
        title: "Practice",
        type: "practice"
      },
      {
        startTime: "4:30 PM",
        title: "Track Closed",
        type: "other"
      }
    ]
  },
  saturday: {
    date: "Saturday",
    events: [
      {
        startTime: "8:00 AM",
        title: "Mandatory",
        details: "Group 1 Arrive",
        type: "mandatory"
      },
      {
        startTime: "8:30 AM",
        title: "Mandatory",
        details: "Group 2 Arrive",
        type: "mandatory"
      },
      {
        startTime: "9:00 AM",
        title: "Mandatory",
        details: "Group 3 Arrive",
        type: "mandatory"
      },
      {
        startTime: "8:30 AM",
        endTime: "12:30pm",
        title: "Qualifying",
        type: "qualifying"
      },
      {
        startTime: "12:30 PM",
        endTime: "1:00pm",
        title: "Pretend Lunch & Organiser Break",
        type: "break"
      },
      {
        startTime: "1:00 PM",
        endTime: "5:00pm",
        title: "Qualifying",
        type: "qualifying"
      },
      {
        startTime: "5:00 PM",
        endTime: "6:00pm",
        title: "Track Closed",
        type: "other"
      },
      {
        startTime: "6:00 PM",
        title: "Katsubi",
        type: "other"
      }
    ]
  },
  sunday: {
    date: "Sunday 16/02",
    events: [
      {
        startTime: "8:00 AM",
        endTime: "8:15am",
        title: "Pilots Arrive",
        type: "mandatory"
      },
      {
        startTime: "8:15 AM",
        endTime: "8:30am",
        title: "Mandatory Briefing",
        type: "mandatory"
      },
      {
        startTime: "8:45 AM",
        endTime: "12:30pm",
        title: "Eliminations + Bottom Qualifiers",
        type: "eliminations"
      },
      {
        startTime: "12:30 PM",
        endTime: "1:00pm",
        title: "Lunch & Organiser Break",
        type: "break"
      },
      {
        startTime: "1:00 PM",
        endTime: "3:00pm",
        title: "Eliminations",
        type: "eliminations"
      },
      {
        startTime: "2:30 PM",
        endTime: "3:00pm",
        title: "Top 4 Finals",
        type: "eliminations"
      },
      {
        startTime: "3:30 PM",
        endTime: "4:30pm",
        title: "Event Packup",
        type: "other"
      },
      {
        startTime: "4:30 PM",
        endTime: "5:00pm",
        title: "Prizegiving",
        type: "other"
      },
      {
        startTime: "5:00 PM",
        title: "Event Finished",
        type: "other"
      }
    ]
  }
};

// Add scoring system at the top of the file
const POSITION_POINTS: Record<number, number> = {
  1: 10,
  2: 7,
  3: 4,
  4: 3
};

function App() {
  const races = useAtomValue(racesAtom);
  const updateRoundsData = useSetAtom(roundsDataAtom);
  const currentRaceIndex = findIndexOfCurrentRace(races);
  const lastRaceIndex = findIndexOfLastRace(races);
  const raceSubset = races.slice(currentRaceIndex + 1, currentRaceIndex + 1 + 8);
  const [currentTime, setCurrentTime] = useState('');

  useEffect(() => {
    const updateTime = () => {
      const time = new Date().toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
      setCurrentTime(time);
    };

    updateTime(); // Initial update
    const timer = setInterval(updateTime, 1000); // Update every second

    return () => clearInterval(timer); // Cleanup
  }, []);

  usePeriodicUpdate(updateRoundsData, 10_000);

  return (
    <>
      <div style={{ 
        textAlign: 'center', 
        padding: '0.5rem', 
        borderBottom: '1px solid #333',
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        backgroundColor: '#1a1a1a',
        zIndex: 100
      }}>
        {currentTime}
      </div>
      <div className="app-container" style={{ marginTop: '40px' }}>
        <div className="races-container">
          {lastRaceIndex !== -1 && (
            <div className="race-box last-race">
              <div className="race-header">
                <h3>Last Race</h3>
              </div>
              <LapsView
                key={races[lastRaceIndex].ID}
                raceId={races[lastRaceIndex].ID}
              />
            </div>
          )}
          {currentRaceIndex !== -1 && (
            <div className="race-box current-race">
              <div className="race-header">
                <h3>Current Race</h3>
                <div className="race-timer">
                  <RaceTime />
                </div>
              </div>
              <LapsView
                key={races[currentRaceIndex].ID}
                raceId={races[currentRaceIndex].ID}
              />
            </div>
          )}
          <div className="race-box next-races">
            <div className="race-header">
              <h3>Next Races</h3>
            </div>
            {raceSubset.map((race) => <LapsView
              key={race.ID}
              raceId={race.ID}
            />)}
          </div>
        </div>
        <div className="schedule-container">
          <div className="schedule-wrapper">
            <DaySchedule {...scheduleData.sunday} />
          </div>
        </div>
        <div className="leaderboard-container">
          <Leaderboard />
          {/* <EliminatedPilotsView /> */}

          {/* <Legend /> */}
          {/* <div className="qr-code-container">
            <QRCodeSVG 
              value="https://nzo.roboenator.com" 
              size={230}
              bgColor="#FFF"
              fgColor="#000"
              level="L"
              style={{ backgroundColor: '#FFF', padding: '8px', borderRadius: '4px' }}
            />
          </div> */}
        </div>
      </div>
    </>
  );
}

function LapsView({ raceId }: { raceId: string }) {
  const roundData = useAtomValue(roundsDataAtom);
  const [race, updateRace] = useAtom(raceFamilyAtom(raceId));
  const races = useAtomValue(racesAtom);
  const pilots = useAtomValue(pilotsAtom);
  const brackets = useQueryAtom(bracketsDataAtom);
  const currentRaceIndex = findIndexOfCurrentRace(races);
  const isCurrentRace = races[currentRaceIndex]?.ID === raceId;

  usePeriodicUpdate(updateRace, isCurrentRace ? 500 : 10_000);

  const round = roundData.find((r) => r.ID === race.Round);

  // Get bracket data for any race
  const getBracketData = (): Bracket | null => {
    // Normalize names by removing whitespace and converting to lowercase
    const normalizeString = (str: string) => str.toLowerCase().replace(/\s+/g, '');
    
    // Get the set of normalized pilot names from the race
    const racePilotNames = new Set(
      race.PilotChannels
        .map(pc => pilots.find(p => p.ID === pc.Pilot)?.Name ?? '')
        .filter(name => name !== '')
        .map(normalizeString)
    );
    
    // Find the bracket that matches the race pilots
    const matchingBracket = brackets.find(bracket => {
      const bracketPilotNames = new Set(
        bracket.pilots.map(p => normalizeString(p.name))
      );
      
      return bracketPilotNames.size === racePilotNames.size &&
             Array.from(racePilotNames).every(name => bracketPilotNames.has(name));
    });

    return matchingBracket ?? null;
  };

  const matchingBracket = getBracketData();

  return (
    <div className="laps-view">
      <div className="race-info">
        <div className="race-number">
          {round?.RoundNumber}-{race.RaceNumber}
          {matchingBracket && <span style={{ marginLeft: '8px', color: '#888' }}>({matchingBracket.name})</span>}
        </div>
        <LapsTable race={race} matchingBracket={matchingBracket} />
      </div>
    </div>
  );
}

function LapsTable({ race, matchingBracket }: { race: RaceWithProcessedLaps; matchingBracket: Bracket | null }) {
  // Calculate completed laps for each pilot and sort them
  const pilotsWithLaps = race.PilotChannels.map((pilotChannel) => {
    const completedLaps = race.processedLaps.filter((lap) =>
      lap.pilotId === pilotChannel.Pilot
    ).length;
    return { pilotChannel, completedLaps };
  }).sort((a, b) => b.completedLaps - a.completedLaps);

  // Get the actual number of columns needed
  const maxLaps = Math.max(...race.processedLaps.map(lap => lap.lapNumber));

  return (
    <table className="laps-table">
      <LapsTableHeader maxLaps={maxLaps} matchingBracket={matchingBracket} />
      <tbody>
        {pilotsWithLaps.map((pilotData, index) => (
          <LapsTableRow
            key={pilotData.pilotChannel.ID}
            pilotChannel={pilotData.pilotChannel}
            position={index + 1}
            maxLaps={maxLaps}
            race={race}
            matchingBracket={matchingBracket}
          />
        ))}
      </tbody>
    </table>
  );
}

function LapsTableHeader({ maxLaps, matchingBracket }: { maxLaps: number; matchingBracket: Bracket | null }) {
  const headerCells = [
    <th key="header-pos">Pos</th>,
    <th key="header-name">Name</th>,
    <th key="header-channel">Chan</th>,
  ];

  if (matchingBracket) {
    headerCells.push(
      <th key="header-points">Points</th>
    );
    
    // Add bracket round headers
    matchingBracket.pilots[0]?.rounds.forEach((_, index: number) => {
      headerCells.push(
        <th key={`header-bracket-round-${index}`}>R{index + 1}</th>
      );
    });
  }

  // Add lap headers after bracket information
  for (let i = 0; i <= maxLaps; i++) {
    headerCells.push(
      <th key={`header-lap-${i}`}>
        {i === 0 ? "HS" : `L${i}`}
      </th>,
    );
  }

  return (
    <thead>
      <tr>{headerCells}</tr>
    </thead>
  );
}

function LapsTableRow({ pilotChannel, position, maxLaps, race, matchingBracket }: {
  pilotChannel: PilotChannel;
  position: number;
  maxLaps: number;
  race: RaceWithProcessedLaps;
  matchingBracket: Bracket | null;
}) {
  const pilots = useAtomValue(pilotsAtom);
  const channels = useAtomValue(channelsDataAtom);
  const overallBestTimes = useAtomValue(overallBestTimesAtom);

  const pilot = pilots.find((p) => p.ID === pilotChannel.Pilot)!;
  const channel = channels.find((c) => c.ID === pilotChannel.Channel)!;

  // Get all laps for this pilot
  const pilotLaps = race.processedLaps.filter((lap) =>
    lap.pilotId === pilotChannel.Pilot
  );

  // Get racing laps (excluding holeshot) for calculations only
  const racingLaps = pilotLaps.filter(lap => !lap.isHoleshot);

  // Calculate fastest lap for this pilot (excluding holeshot)
  const fastestLap = racingLaps.length > 0
    ? Math.min(...racingLaps.map((lap) => lap.lengthSeconds))
    : Infinity;

  // Calculate overall fastest lap across all pilots (excluding holeshot)
  const overallFastestLap = Math.min(
    ...race.processedLaps
      .filter(lap => !lap.isHoleshot)
      .map(lap => lap.lengthSeconds)
  );

  // Find matching bracket pilot
  const bracketPilot = matchingBracket?.pilots.find(
    (p: BracketPilot) => p.name.toLowerCase().replace(/\s+/g, '') === pilot.Name.toLowerCase().replace(/\s+/g, '')
  );

  const cells = [
    <td key="pos">
      {maxLaps > 0 ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {getPositionWithSuffix(position)}
          {POSITION_POINTS[position] && (
            <span style={{ fontSize: '0.8em', color: '#888' }}>
              +{POSITION_POINTS[position]}
            </span>
          )}
        </div>
      ) : "-"}
    </td>,
    <td key="name">{pilot.Name}</td>,
    <td key="channel">
      <div className="flex-row">
        {channel.ShortBand}
        {channel.Number}
        <ChannelSquare channelID={pilotChannel.Channel} />
      </div>
    </td>
  ];

  if (matchingBracket && bracketPilot) {
    cells.push(
      <td key="points" style={{ color: '#00ff00' }}>{bracketPilot.points}</td>
    );
    
    // Add bracket round cells
    bracketPilot.rounds.forEach((round: number | null, index: number) => {
      cells.push(
        <td key={`bracket-round-${index}`}>
          {round ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              {round}
              {POSITION_POINTS[round] && (
                <span style={{ fontSize: '0.8em', color: '#888' }}>
                  +{POSITION_POINTS[round]}
                </span>
              )}
            </div>
          ) : '-'}
        </td>
      );
    });
  }

  // Add lap cells
  pilotLaps.forEach((lap) => {
    const className = getLapClassName(
      lap,
      overallBestTimes.overallFastestLap,
      overallBestTimes.pilotBestLaps.get(pilotChannel.Pilot),
      overallFastestLap,
      fastestLap
    );
    
    cells.push(
      <td key={lap.id} className={className}>
        {lap.lengthSeconds.toFixed(3)}
      </td>
    );
  });

  return <tr>{cells}</tr>;
}

function PilotChannelView({ pilotChannel }: { pilotChannel: PilotChannel }) {
  const pilots = useAtomValue(pilotsAtom);
  const channels = useAtomValue(channelsDataAtom);
  const {data: eventData} = useAtomValue(eventDataAtom);

  const pilot = pilots.find((p) => p.ID === pilotChannel.Pilot)!;
  const channel = channels.find((c) => c.ID === pilotChannel.Channel)!;

  const color = eventData[0]
    .ChannelColors[eventData[0].Channels.indexOf(pilotChannel.Channel)];

  return (
    <div className="pilot-channel">
      <div className="pilot-info">
        {pilot.Name} {channel.ShortBand}
        {channel.Number}
      </div>
      <div
        className="color-indicator"
        style={{ backgroundColor: color }}
      />
    </div>
  );
}

function ChannelSquare(
  { channelID, change }: { channelID: string; change?: boolean },
) {
  const eventData = useQueryAtom(eventDataAtom);
  const color =
    eventData[0].ChannelColors[eventData[0].Channels.indexOf(channelID)];

  return (
    <div
      className="channel-square"
      style={{ backgroundColor: color }}
    >
      {change ? "!" : ""}
    </div>
  );
}

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

  return <div className="race-time">{timeRemaining.toFixed(1)}</div>;
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
      <div className="leaderboard">
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
      currentRaceIndex
    );

    // Calculate previous leaderboard by excluding the current race AND the last race
    const previous = calculateLeaderboardData(
      races.slice(0, Math.max(0, currentRaceIndex - 1)),
      pilots,
      channels,
      currentRaceIndex - 2
    );

    return [current, previous];
  }, [races, pilots, channels, currentRaceIndex]);

  // Get position changes
  const positionChanges = useMemo(() => 
    getPositionChanges(currentLeaderboard, previousLeaderboard),
    [currentLeaderboard, previousLeaderboard]
  );

  // Helper to check if a time is from recent races
  const isRecentTime = useCallback((roundId: string, raceNumber: number) => {
    const raceIndex = races.findIndex(race => 
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
      <span className="position-change" style={{ color: '#00ff00', marginLeft: '4px', fontSize: '0.8em' }}>
        ↑{change} from {prevPos}
      </span>
    );
  }, [positionChanges]);

  // Helper to render time with difference
  const renderTimeWithDiff = useCallback((
    currentTime: { time: number; roundId: string; raceNumber: number } | null,
    previousTime: { time: number; roundId: string; raceNumber: number } | null,
    isRecent: boolean
  ) => {
    if (!currentTime) return "-";

    const showDiff = previousTime && 
                    previousTime.time !== currentTime.time && 
                    isRecent;

    return (
      <div className={isRecent ? 'recent-time' : ''} style={{ display: 'flex', flexDirection: 'column' }}>
        <div>
          {currentTime.time.toFixed(3)}
          <span className="source-info">
            ({roundData.find((r) => r.ID === currentTime.roundId)?.RoundNumber}-
            {currentTime.raceNumber})
          </span>
        </div>
        {showDiff && (
          <div style={{ 
            fontSize: '0.8em', 
            color: previousTime.time > currentTime.time ? '#00ff00' : '#ff0000' 
          }}>
            {formatTimeDifference(currentTime.time, previousTime.time)}
          </div>
        )}
      </div>
    );
  }, [roundData]);

  return (
    <div className="leaderboard">
      <h3>Fastest Laps Overall</h3>
      <table className="leaderboard-table">
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
              prev => prev.pilot.ID === entry.pilot.ID
            );

            const isEliminated = eliminatedPilots.some(
              pilot => pilot.name.toLowerCase().replace(/\s+/g, '') === entry.pilot.Name.toLowerCase().replace(/\s+/g, '')
            );
            
            return (
              <tr 
                key={entry.pilot.ID}
                className={animatingRows.has(entry.pilot.ID) ? 'position-improved' : ''}
              >
                <td>
                  {entry.consecutiveLaps ? (
                    <div className="position-container">
                      <div>{index + 1}</div>
                      {renderPositionChange(entry.pilot.ID, index + 1)}
                    </div>
                  ) : "-"}
                </td>
                <td>{entry.pilot.Name}</td>
                <td>
                  {entry.channel
                    ? (
                      <div className="channel-display">
                        {entry.channel.ShortBand}
                        {entry.channel.Number}
                        <ChannelSquare channelID={entry.channel.ID} />
                      </div>
                    )
                    : "-"}
                </td>
                <td>{entry.totalLaps}</td>
                <td>
                  {renderTimeWithDiff(
                    entry.bestHoleshot || null,
                    previousEntry?.bestHoleshot || null,
                    entry.bestHoleshot ? isRecentTime(entry.bestHoleshot.roundId, entry.bestHoleshot.raceNumber) : false
                  )}
                </td>
                <td>
                  {renderTimeWithDiff(
                    entry.bestLap || null,
                    previousEntry?.bestLap || null,
                    entry.bestLap ? isRecentTime(entry.bestLap.roundId, entry.bestLap.raceNumber) : false
                  )}
                </td>
                <td>
                  {renderTimeWithDiff(
                    entry.consecutiveLaps || null,
                    previousEntry?.consecutiveLaps || null,
                    entry.consecutiveLaps ? isRecentTime(entry.consecutiveLaps.roundId, entry.consecutiveLaps.raceNumber) : false
                  )}
                </td>
                <td>
                  {entry.racesUntilNext === -1 && isEliminated ? (
                    <span className="done-text">Done</span>
                  ) : entry.racesUntilNext === -1 ? (
                    "-"
                  ) : entry.racesUntilNext === 0 ? (
                    <span className="next-text">To Staging</span>
                  ) : entry.racesUntilNext === -2 ? (
                    <span className="racing-text">Racing</span>
                  ) : (
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

function LegendItem({ color, label }: { color: string; label: string }) {
  const getClassName = () => {
    switch(color) {
      case 'var(--overall-fastest-color)': return 'legend-square-overall-fastest';
      case 'var(--overall-personal-best-color)': return 'legend-square-overall-personal-best';
      case 'var(--fastest-lap-color)': return 'legend-square-fastest-overall';
      case 'var(--personal-best-color)': return 'legend-square-personal-best';
      default: return 'legend-square';
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginRight: '16px' }}>
      <div className={getClassName()} />
      <span>{label}</span>
    </div>
  );
}

function Legend() {
  return (
    <div style={{ 
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      padding: '8px', 
      backgroundColor: '#222',
      borderRadius: '4px',
      marginBottom: '16px',
      width: 'fit-content'
    }}>
      <LegendItem color="var(--overall-fastest-color)" label="Overall Fastest" />
      <LegendItem color="var(--overall-personal-best-color)" label="Overall Personal Best" />
      <LegendItem color="var(--fastest-lap-color)" label="Race Fastest" />
      <LegendItem color="var(--personal-best-color)" label="Race Personal Best" />
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
      .map(pc => pilots.find(p => p.ID === pc.Pilot)?.Name ?? '')
      .filter(name => name !== '')
      .map(normalizeString)
  );
  
  // Find the bracket that matches the current race pilots
  const matchingBracket = brackets.find(bracket => {
    const bracketPilotNames = new Set(
      bracket.pilots.map(p => normalizeString(p.name))
    );
    
    return bracketPilotNames.size === currentRacePilotNames.size &&
           Array.from(currentRacePilotNames).every(name => bracketPilotNames.has(name));
  });

  if (!matchingBracket) return null;

  return (
    <div className="brackets-container">
      <div className="bracket">
        <h3>Bracket: {matchingBracket.name}</h3>
        <table className="bracket-table">
          <thead>
            <tr>
              <th>Seed</th>
              <th>Pilot</th>
              <th>Points</th>
              {matchingBracket.pilots[0]?.rounds.map((_, roundIndex) => (
                <th key={roundIndex}>R{roundIndex + 1}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matchingBracket.pilots.map((pilot, pilotIndex) => (
              <tr key={pilotIndex}>
                <td>{pilot.seed}</td>
                <td>{pilot.name}</td>
                <td>{pilot.points}</td>
                {pilot.rounds.map((round, roundIndex) => (
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
    <div className="race-box eliminated-pilots">
      <div className="race-header">
        <h3>Eliminated Pilots maybe...?</h3>
      </div>
      <table className="bracket-table">
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

