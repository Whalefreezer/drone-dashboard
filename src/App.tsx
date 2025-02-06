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
  roundsDataAtom,
} from "./state.ts";
import { useSetAtom } from "jotai";
import { PilotChannel } from "./types.ts";

const UPDATE = true;

function App() {
  // const eventData = useAtomValue(eventDataAtom);
  const races = useAtomValue(racesAtom);
  const updateEventData = useSetAtom(eventDataAtom);
  const currentRaceIndex = findIndexOfCurrentRace(races);
  const lastRaceIndex = findIndexOfLastRace(races);
  const raceSubset = races.slice(currentRaceIndex + 1).filter((race) =>
    race.Valid
  );

  // const race = useAtomValue(raceFamilyAtom(eventData[0].Races[0]));
  if (UPDATE) {
    useEffect(() => {
      const interval = setInterval(() => {
        updateEventData();
      }, 10_000);
      return () => clearInterval(interval);
    }, [updateEventData]);
  }

  return (
    <div className="app-container">
      <div className="races-container">
        {lastRaceIndex !== -1 && (
          <div className="race-box last-race">
            <h3>Last Race</h3>
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
          <h3>Next Races</h3>
          {raceSubset.map((race) => (
            <LapsView key={race.ID} raceId={race.ID} />
          ))}
        </div>
      </div>
      <div className="leaderboard-container">
        <Leaderboard />
      </div>
    </div>
  );
}

function Race({ raceId }: { raceId: string }) {
  const roundData = useAtomValue(roundsDataAtom);
  const [race, updateRace] = useAtom(raceFamilyAtom(raceId));
  const round = roundData.find((r) => r.ID === race.Round);

  return (
    <div className="race">
      {round?.RoundNumber}-{race.RaceNumber}|
      {race.PilotChannels.map((pilotChannel) => (
        <PilotChannelView key={pilotChannel.ID} pilotChannel={pilotChannel} />
      ))}
    </div>
  );
}

function LapsView({ raceId }: { raceId: string }) {
  const roundData = useAtomValue(roundsDataAtom);
  const [race, updateRace] = useAtom(raceFamilyAtom(raceId));
  const pilots = useAtomValue(pilotsAtom);
  const channels = useAtomValue(channelsDataAtom);
  const races = useAtomValue(racesAtom);
  const currentRaceIndex = findIndexOfCurrentRace(races);
  const isCurrentRace = races[currentRaceIndex]?.ID === raceId;

  if (UPDATE) {
    useEffect(() => {
      const interval = setInterval(() => {
        updateRace();
      }, isCurrentRace ? 500 : 10_000);
      return () => clearInterval(interval);
    }, [updateRace, isCurrentRace]);
  }

  const round = roundData.find((r) => r.ID === race.Round);

  // Calculate max laps by finding the highest lap count for any pilot
  const maxLaps = race.PilotChannels.reduce((max, pilotChannel) => {
    const pilotLaps = race.Laps.filter(lap => {
      const detection = race.Detections.find(d => lap.Detection === d.ID);
      return detection && detection.Pilot === pilotChannel.Pilot && detection.Valid;
    }).length;
    return Math.max(max, pilotLaps);
  }, 0);

  // Create header row
  const headerRow: React.ReactNode[] = [
    <th key="header-pos">Pos</th>,
    <th key="header-name">Name</th>,
    <th key="header-channel">Channel</th>
  ];

  // Only add lap headers if there are laps
  if (maxLaps > 0) {
    for (let i = 0; i < maxLaps; i++) {
      headerRow.push(
        <th key={`header-lap-${i}`}>
          {i === 0 ? 'HS' : `L${i}`}
        </th>
      );
    }
  }

  // Create pilot rows with positions
  const rows: React.ReactNode[] = [];
  
  // Calculate completed laps for each pilot and sort them
  const pilotsWithLaps = race.PilotChannels.map(pilotChannel => {
    const completedLaps = race.Laps.filter(lap => {
      const detection = race.Detections.find(d => lap.Detection === d.ID);
      return detection && detection.Pilot === pilotChannel.Pilot && detection.Valid;
    }).length;
    return { pilotChannel, completedLaps };
  }).sort((a, b) => b.completedLaps - a.completedLaps); // Sort by completed laps descending

  // Create rows based on sorted pilots
  for (let i = 0; i < pilotsWithLaps.length; i++) {
    const { pilotChannel, completedLaps } = pilotsWithLaps[i];
    const row: React.ReactNode[] = [];
    const pilot = pilots.find((p) => p.ID === pilotChannel.Pilot)!;
    const channel = channels.find((c) => c.ID === pilotChannel.Channel)!;
    
    // Add position
    row.push(
      <td key="pilot-position">
        {maxLaps > 0 ? (
          (() => {
            const position = i + 1; // Use array index + 1 for position
            const suffix = position === 1 ? 'st' : 
                          position === 2 ? 'nd' : 
                          position === 3 ? 'rd' : 'th';
            
            return `${position}${suffix}`;
          })()
        ) : '-'}
      </td>
    );

    // Add name and channel
    row.push(
      <td key="pilot-name">
        {pilot.Name}
      </td>,
      <td key="pilot-channel">
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
          }}
        >
          {channel.ShortBand}
          {channel.Number}
          <ChannelSquare channelID={pilotChannel.Channel} />
        </div>
      </td>,
    );

    // Add lap times with highlighting for fastest lap
    const fastestLap = race.Laps
      .filter(lap => {
        const detection = race.Detections.find(d => lap.Detection === d.ID);
        return detection && detection.Pilot === pilotChannel.Pilot && lap.LapNumber > 0; // Exclude holeshot
      })
      .reduce((min, lap) => Math.min(min, lap.LengthSeconds), Infinity);
    const overallFastestLap = Math.min(...race.Laps.filter(lap => lap.LapNumber > 0).map(lap => lap.LengthSeconds));

    for (const lap of race.Laps) {
      const detection = race.Detections.find((d) => lap.Detection === d.ID)!;
      if (detection.Pilot !== pilotChannel.Pilot) {
        continue;
      }
      row.push(
        <td 
          key={lap.ID}
          className={
            lap.LengthSeconds === overallFastestLap ? 
              'lap-fastest-overall' : 
              lap.LengthSeconds === fastestLap ? 
                'lap-personal-best' : 
                undefined
          }
        >
          {lap.LengthSeconds.toFixed(3)}
        </td>
      );
    }

    rows.push(<tr key={pilotChannel.ID}>{row}</tr>);
  }

  return (
    <div className="laps-view">
      <div className="race-number">
        {round?.RoundNumber}-{race.RaceNumber}
      </div>
      <table className="laps-table">
        <thead>
          <tr>{headerRow}</tr>
        </thead>
        <tbody>
          {rows}
        </tbody>
      </table>
    </div>
  );
}

function PilotChannelView({ pilotChannel }: { pilotChannel: PilotChannel }) {
  const pilots = useAtomValue(pilotsAtom);
  const channels = useAtomValue(channelsDataAtom);
  const eventData = useAtomValue(eventDataAtom);

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
  { channelID, change }: { channelID: string; change?: boolean }
) {
  const eventData = useAtomValue(eventDataAtom);
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
  const eventData = useAtomValue(eventDataAtom);
  const races = useAtomValue(racesAtom);
  const currentRaceIndex = findIndexOfCurrentRace(races);
  const currentRace = races[currentRaceIndex];
  const raceLength = secondsFromString(eventData[0].RaceLength);
  
  const [timeRemaining, setTimeRemaining] = useState(raceLength);

  useEffect(() => {
    // Only start countdown if race has started
    if (currentRace.Start) {
      const currentRaceStart = new Date(currentRace.Start).valueOf()/1000;
      const currentRaceEnd = currentRaceStart + raceLength;

      const interval = setInterval(() => {
        setTimeRemaining(Math.max(0, currentRaceEnd - (new Date().valueOf()/1000)));
      }, 100);
      return () => clearInterval(interval);
    } else {
      setTimeRemaining(raceLength);
    }
  }, [currentRace.Start, raceLength]);

  return <div className="race-time">{timeRemaining.toFixed(1)}</div>;
}

function secondsFromString(time: string) {
  const [hours, minutes, seconds] = time.split(":");
  return parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseInt(seconds);
}

function Leaderboard() {
  const races = useAtomValue(racesAtom);
  const pilots = useAtomValue(pilotsAtom);
  const channels = useAtomValue(channelsDataAtom);
  const roundData = useAtomValue(roundsDataAtom);

  // Track best times and their sources
  interface BestTime {
    time: number;
    roundId: string;
    raceNumber: number;
    lapNumber: number;
  }
  interface ConsecutiveTime {
    time: number;
    roundId: string;
    raceNumber: number;
    startLap: number;
  }
  
  const overallFastestLaps = new Map<string, BestTime>();
  const fastestConsecutiveLaps = new Map<string, ConsecutiveTime>();
  const pilotChannels = new Map<string, string>();
  
  races.forEach(race => {
    const round = roundData.find(r => r.ID === race.Round);
    
    race.PilotChannels.forEach(pilotChannel => {
      if (!pilotChannels.has(pilotChannel.Pilot)) {
        pilotChannels.set(pilotChannel.Pilot, pilotChannel.Channel);
      }

      // Get all valid laps for this pilot in this race
      const pilotLaps = race.Laps.filter(lap => {
        const detection = race.Detections.find(d => lap.Detection === d.ID);
        return detection && 
               detection.Pilot === pilotChannel.Pilot && 
               detection.Valid;
      }).sort((a, b) => a.LapNumber - b.LapNumber);

      // Skip holeshot for single lap times
      const racingLaps = pilotLaps.slice(1);
      if (racingLaps.length > 0) {
        const fastestLap = racingLaps.reduce((fastest, lap) => 
          lap.LengthSeconds < fastest.LengthSeconds ? lap : fastest
        );
        
        const currentFastest = overallFastestLaps.get(pilotChannel.Pilot);
        if (!currentFastest || fastestLap.LengthSeconds < currentFastest.time) {
          overallFastestLaps.set(pilotChannel.Pilot, {
            time: fastestLap.LengthSeconds,
            roundId: race.Round,
            raceNumber: race.RaceNumber,
            lapNumber: fastestLap.LapNumber
          });
        }
      }

      // Calculate fastest 2 consecutive laps (excluding holeshot)
      if (racingLaps.length >= 2) {
        let fastestConsecutive = { time: Infinity, startLap: 0 };
        for (let i = 0; i < racingLaps.length - 1; i++) {
          const twoLapTime = racingLaps[i].LengthSeconds + racingLaps[i + 1].LengthSeconds;
          if (twoLapTime < fastestConsecutive.time) {
            fastestConsecutive = {
              time: twoLapTime,
              startLap: racingLaps[i].LapNumber
            };
          }
        }
        
        const currentFastestConsecutive = fastestConsecutiveLaps.get(pilotChannel.Pilot);
        if (!currentFastestConsecutive || fastestConsecutive.time < currentFastestConsecutive.time) {
          fastestConsecutiveLaps.set(pilotChannel.Pilot, {
            ...fastestConsecutive,
            roundId: race.Round,
            raceNumber: race.RaceNumber
          });
        }
      }
    });
  });

  const pilotEntries = pilots.map(pilot => ({
    pilot,
    bestLap: overallFastestLaps.get(pilot.ID) || null,
    consecutiveLaps: fastestConsecutiveLaps.get(pilot.ID) || null,
    channel: pilotChannels.get(pilot.ID) ? 
      channels.find(c => c.ID === pilotChannels.get(pilot.ID)) : 
      null
  }));

  const sortedPilots = pilotEntries.sort((a, b) => {
    if (!a.bestLap && !b.bestLap) {
      if (!a.channel) return 1;
      if (!b.channel) return -1;
      if (a.channel.ShortBand !== b.channel.ShortBand) {
        return a.channel.ShortBand.localeCompare(b.channel.ShortBand);
      }
      return a.channel.Number - b.channel.Number;
    }
    if (!a.bestLap) return 1;
    if (!b.bestLap) return -1;
    return a.bestLap.time - b.bestLap.time;
  });

  return (
    <div className="leaderboard">
      <h3>Fastest Laps Overall</h3>
      <table className="leaderboard-table">
        <thead>
          <tr>
            <th>Position</th>
            <th>Pilot</th>
            <th>Channel</th>
            <th>Best Lap</th>
            <th>Best 2 Consecutive</th>
          </tr>
        </thead>
        <tbody>
          {sortedPilots.map((entry, index) => (
            <tr key={entry.pilot.ID}>
              <td>{entry.bestLap ? index + 1 : '-'}</td>
              <td>{entry.pilot.Name}</td>
              <td>
                {entry.channel ? (
                  <div className="channel-display">
                    {entry.channel.ShortBand}
                    {entry.channel.Number}
                    <ChannelSquare channelID={entry.channel.ID} />
                  </div>
                ) : '-'}
              </td>
              <td>
                {entry.bestLap ? (
                  <>
                    {entry.bestLap.time.toFixed(3)}
                    <span className="source-info">
                      {roundData.find(r => r.ID === entry.bestLap!.roundId)?.RoundNumber}-
                      {entry.bestLap.raceNumber}
                    </span>
                  </>
                ) : '-'}
              </td>
              <td>
                {entry.consecutiveLaps ? (
                  <>
                    {entry.consecutiveLaps.time.toFixed(3)}
                    <span className="source-info">
                      {roundData.find(r => r.ID === entry.consecutiveLaps!.roundId)?.RoundNumber}-
                      {entry.consecutiveLaps.raceNumber}
                    </span>
                  </>
                ) : '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default App;
