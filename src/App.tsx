import "./App.css";
// @deno-types="@types/react"
import { useEffect, useState } from "react";
import { useAtom, useAtomValue } from "jotai";
import {
  channelsDataAtom,
  eventDataAtom,
  findIndexOfCurrentRace,
  findIndexOfLastRace,
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
  LeaderboardEntry
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
  sortPilotEntries
} from "./utils.ts";

const UPDATE = true;

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
        <div className="leaderboard-container">
          <Leaderboard />
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
  const currentRaceIndex = findIndexOfCurrentRace(races);
  const isCurrentRace = races[currentRaceIndex]?.ID === raceId;

  usePeriodicUpdate(updateRace, isCurrentRace ? 500 : 10_000);

  const round = roundData.find((r) => r.ID === race.Round);

  return (
    <div className="laps-view">
      <div className="race-info">
        <div className="race-number">
          {round?.RoundNumber}-{race.RaceNumber}
        </div>
        <LapsTable race={race} />
      </div>
    </div>
  );
}

function LapsTable({ race }: { race: RaceWithProcessedLaps }) {
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
      <LapsTableHeader maxLaps={maxLaps} />
      <tbody>
        {pilotsWithLaps.map((pilotData, index) => (
          <LapsTableRow
            key={pilotData.pilotChannel.ID}
            pilotChannel={pilotData.pilotChannel}
            position={index + 1}
            maxLaps={maxLaps}
            race={race}
          />
        ))}
      </tbody>
    </table>
  );
}

function LapsTableHeader({ maxLaps }: { maxLaps: number }) {
  const headerCells = [
    <th key="header-pos">Pos</th>,
    <th key="header-name">Name</th>,
    <th key="header-channel">Channel</th>,
  ];

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

function LapsTableRow({ pilotChannel, position, maxLaps, race }: {
  pilotChannel: PilotChannel;
  position: number;
  maxLaps: number;
  race: RaceWithProcessedLaps;
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

  return (
    <tr>
      <td>{maxLaps > 0 ? getPositionWithSuffix(position) : "-"}</td>
      <td>{pilot.Name}</td>
      <td>
        <div className="flex-row">
          {channel.ShortBand}
          {channel.Number}
          <ChannelSquare channelID={pilotChannel.Channel} />
        </div>
      </td>
      {pilotLaps.map((lap) => {
        const className = getLapClassName(
          lap,
          overallBestTimes.overallFastestLap,
          overallBestTimes.pilotBestLaps.get(pilotChannel.Pilot),
          overallFastestLap,
          fastestLap
        );
        
        return (
          <td key={lap.id} className={className}>
            {lap.lengthSeconds.toFixed(3)}
          </td>
        );
      })}
    </tr>
  );
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

function Leaderboard() {
  const races = useAtomValue(racesAtom);
  const pilots = useAtomValue(pilotsAtom);
  const channels = useAtomValue(channelsDataAtom);
  const roundData = useAtomValue(roundsDataAtom);
  const currentRaceIndex = findIndexOfCurrentRace(races);

  // Calculate current leaderboard
  const currentLeaderboard = calculateLeaderboardData(
    races,
    pilots,
    channels,
    currentRaceIndex
  );

  // Calculate previous leaderboard by excluding the current race AND the last race
  const previousLeaderboard = calculateLeaderboardData(
    races.slice(0, Math.max(0, currentRaceIndex - 1)),
    pilots,
    channels,
    currentRaceIndex - 2
  );

  // Get position changes
  const positionChanges = getPositionChanges(currentLeaderboard, previousLeaderboard);

  // Helper to check if a time is from recent races
  const isRecentTime = (roundId: string, raceNumber: number) => {
    const raceIndex = races.findIndex(race => 
      race.Round === roundId && race.RaceNumber === raceNumber
    );
    return raceIndex === currentRaceIndex || raceIndex === currentRaceIndex - 1;
  };

  // Helper to render position changes
  const renderPositionChange = (pilotId: string, currentPos: number, entry: LeaderboardEntry) => {
    const hasRecentImprovement = entry.bestLap && isRecentTime(entry.bestLap.roundId, entry.bestLap.raceNumber) ||
      (entry.consecutiveLaps && isRecentTime(entry.consecutiveLaps.roundId, entry.consecutiveLaps.raceNumber));

    if (!hasRecentImprovement) return null;

    const prevPos = positionChanges.get(pilotId);
    if (!prevPos || prevPos === currentPos) return null;

    const change = prevPos - currentPos;
    const color = change > 0 ? '#00ff00' : '#ff0000';
    const symbol = change > 0 ? '↑' : '↓';

    return (
      <span className="position-change" style={{ color, marginLeft: '4px', fontSize: '0.8em' }}>
        {symbol}{Math.abs(change)} (was {prevPos})
      </span>
    );
  };

  return (
    <div className="leaderboard">
      <h3>Fastest Laps Overall</h3>
      <table className="leaderboard-table">
        <thead>
          <tr>
            <th>Pos</th>
            <th>Pilot</th>
            <th>Chan</th>
            <th>Top Lap</th>
            <th>Top 2 Consec</th>
            <th>Next Race In</th>
          </tr>
        </thead>
        <tbody>
          {currentLeaderboard.map((entry, index) => (
            <tr key={entry.pilot.ID}>
              <td>
                {entry.bestLap ? (
                  <>
                    {index + 1}
                    {renderPositionChange(entry.pilot.ID, index + 1, entry)}
                  </>
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
              <td className={entry.bestLap && isRecentTime(entry.bestLap.roundId, entry.bestLap.raceNumber) ? 'recent-time' : ''}>
                {entry.bestLap
                  ? (
                    <>
                      {entry.bestLap.time.toFixed(3)}
                      <span className="source-info">
                        ({roundData.find((r) => r.ID === entry.bestLap!.roundId)?.RoundNumber}-
                        {entry.bestLap.raceNumber})
                      </span>
                    </>
                  )
                  : "-"}
              </td>
              <td className={entry.consecutiveLaps && isRecentTime(entry.consecutiveLaps.roundId, entry.consecutiveLaps.raceNumber) ? 'recent-time' : ''}>
                {entry.consecutiveLaps
                  ? (
                    <>
                      {entry.consecutiveLaps.time.toFixed(3)}
                      <span className="source-info">
                        ({roundData.find((r) => r.ID === entry.consecutiveLaps!.roundId)?.RoundNumber}-
                        {entry.consecutiveLaps.raceNumber})
                      </span>
                    </>
                  )
                  : "-"}
              </td>
              <td>
                {entry.racesUntilNext === -1 ? (
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
          ))}
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

export default App;

