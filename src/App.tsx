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
} from "./state.ts";
import { useSetAtom } from "jotai";
import { PilotChannel } from "./types.ts";

const UPDATE = true;

function App() {
  const races = useAtomValue(racesAtom);
  const updateEventData = useSetAtom(eventDataAtom);
  const updateRoundsData = useSetAtom(roundsDataAtom);
  const currentRaceIndex = findIndexOfCurrentRace(races);
  const lastRaceIndex = findIndexOfLastRace(races);
  const raceSubset = races.slice(currentRaceIndex + 1);

  if (UPDATE) {
    useEffect(() => {
      const interval = setInterval(() => {
        updateEventData();
        updateRoundsData();
      }, 10_000);
      return () => clearInterval(interval);
    }, [updateEventData, updateRoundsData]);
  }

  return (
    <div className="app-container">
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
        <Legend />
      </div>
    </div>
  );
}

function getPositionWithSuffix(position: number): string {
  const suffix = position === 1
    ? "st"
    : position === 2
    ? "nd"
    : position === 3
    ? "rd"
    : "th";
  return `${position}${suffix}`;
}

function LapsView({ raceId }: { raceId: string }) {
  const roundData = useAtomValue(roundsDataAtom);
  const [race, updateRace] = useAtom(raceFamilyAtom(raceId));
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

  return (
    <div className="laps-view">
      <div className="race-number">
        {round?.RoundNumber}-{race.RaceNumber}
      </div>
      <LapsTable race={race} />
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

  for (let i = 0; i < maxLaps; i++) {
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

  // Get racing laps (excluding holeshot)
  const racingLaps = race.processedLaps.filter((lap) =>
    lap.pilotId === pilotChannel.Pilot &&
    !lap.isHoleshot
  );

  // Calculate fastest lap for this pilot
  const fastestLap = racingLaps.length > 0
    ? Math.min(...racingLaps.map((lap) => lap.lengthSeconds))
    : Infinity;

  // Calculate overall fastest lap across all pilots
  const overallFastestLap = Math.min(
    ...race.processedLaps
      .filter(lap => !lap.isHoleshot)  // Exclude holeshots
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
      {racingLaps.map((lap) => {
        let className;
        if (lap.lengthSeconds === overallBestTimes.overallFastestLap) {
          className = "lap-overall-fastest";
        } else if (lap.lengthSeconds === overallBestTimes.pilotBestLaps.get(pilotChannel.Pilot)) {
          className = "lap-overall-personal-best";
        } else if (lap.lengthSeconds === overallFastestLap) {
          className = "lap-fastest-overall";
        } else if (lap.lengthSeconds === fastestLap) {
          className = "lap-personal-best";
        }
        
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
  { channelID, change }: { channelID: string; change?: boolean },
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

  races.forEach((race) => {
    race.PilotChannels.forEach((pilotChannel) => {
      if (!pilotChannels.has(pilotChannel.Pilot)) {
        pilotChannels.set(pilotChannel.Pilot, pilotChannel.Channel);
      }

      // Get racing laps (excluding holeshot)
      const racingLaps = race.processedLaps.filter((lap) =>
        lap.pilotId === pilotChannel.Pilot &&
        !lap.isHoleshot
      );

      if (racingLaps.length > 0) {
        const fastestLap = racingLaps.reduce((fastest, lap) =>
          lap.lengthSeconds < fastest.lengthSeconds ? lap : fastest
        );

        const currentFastest = overallFastestLaps.get(pilotChannel.Pilot);
        if (!currentFastest || fastestLap.lengthSeconds < currentFastest.time) {
          overallFastestLaps.set(pilotChannel.Pilot, {
            time: fastestLap.lengthSeconds,
            roundId: race.Round,
            raceNumber: race.RaceNumber,
            lapNumber: fastestLap.lapNumber,
          });
        }
      }

      // Calculate fastest 2 consecutive laps
      if (racingLaps.length >= 2) {
        let fastestConsecutive = { time: Infinity, startLap: 0 };
        for (let i = 0; i < racingLaps.length - 1; i++) {
          const twoLapTime = racingLaps[i].lengthSeconds +
            racingLaps[i + 1].lengthSeconds;
          if (twoLapTime < fastestConsecutive.time) {
            fastestConsecutive = {
              time: twoLapTime,
              startLap: racingLaps[i].lapNumber,
            };
          }
        }

        const currentFastestConsecutive = fastestConsecutiveLaps.get(
          pilotChannel.Pilot,
        );
        if (
          !currentFastestConsecutive ||
          fastestConsecutive.time < currentFastestConsecutive.time
        ) {
          fastestConsecutiveLaps.set(pilotChannel.Pilot, {
            ...fastestConsecutive,
            roundId: race.Round,
            raceNumber: race.RaceNumber,
          });
        }
      }
    });
  });

  const pilotEntries = pilots.map((pilot) => ({
    pilot,
    bestLap: overallFastestLaps.get(pilot.ID) || null,
    consecutiveLaps: fastestConsecutiveLaps.get(pilot.ID) || null,
    channel: pilotChannels.get(pilot.ID)
      ? channels.find((c) => c.ID === pilotChannels.get(pilot.ID))
      : null,
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
              <td>{entry.bestLap ? index + 1 : "-"}</td>
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
              <td>
                {entry.bestLap
                  ? (
                    <>
                      {entry.bestLap.time.toFixed(3)}
                      <span className="source-info">
                        {roundData.find((r) => r.ID === entry.bestLap!.roundId)
                          ?.RoundNumber}-
                        {entry.bestLap.raceNumber}
                      </span>
                    </>
                  )
                  : "-"}
              </td>
              <td>
                {entry.consecutiveLaps
                  ? (
                    <>
                      {entry.consecutiveLaps.time.toFixed(3)}
                      <span className="source-info">
                        {roundData.find((r) =>
                          r.ID === entry.consecutiveLaps!.roundId
                        )?.RoundNumber}-
                        {entry.consecutiveLaps.raceNumber}
                      </span>
                    </>
                  )
                  : "-"}
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
