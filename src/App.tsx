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
import { QRCodeSVG } from 'qrcode.react';

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

  if (UPDATE) {
    useEffect(() => {
      const interval = setInterval(() => {
        updateRoundsData();
      }, 10_000);
      return () => clearInterval(interval);
    }, [updateRoundsData]);
  }

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
        // Only apply special styling to non-holeshot laps
        let className: string | undefined = lap.isHoleshot ? undefined : undefined;
        if (!lap.isHoleshot) {
          if (lap.lengthSeconds === overallBestTimes.overallFastestLap) {
            className = "lap-overall-fastest";
          } else if (lap.lengthSeconds === overallBestTimes.pilotBestLaps.get(pilotChannel.Pilot)) {
            className = "lap-overall-personal-best";
          } else if (lap.lengthSeconds === overallFastestLap) {
            className = "lap-fastest-overall";
          } else if (lap.lengthSeconds === fastestLap) {
            className = "lap-personal-best";
          }
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
  const {data: eventData} = useAtomValue(eventDataAtom);
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
  const {data: eventData} = useAtomValue(eventDataAtom);
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
  const currentRaceIndex = findIndexOfCurrentRace(races);

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

  // Calculate races until next race for each pilot
  const racesUntilNext = new Map<string, number>();
  if (currentRaceIndex !== -1) {
    pilots.forEach(pilot => {
      // Check if pilot is in current race
      if (races[currentRaceIndex].PilotChannels.some(pc => pc.Pilot === pilot.ID)) {
        racesUntilNext.set(pilot.ID, -2); // Use -2 to indicate current race
        return;
      }

      let racesCount = 0;
      let found = false;
      
      for (let i = currentRaceIndex + 1; i < races.length; i++) {
        if (races[i].PilotChannels.some(pc => pc.Pilot === pilot.ID)) {
          found = true;
          break;
        }
        racesCount++;
      }
      
      racesUntilNext.set(pilot.ID, found ? racesCount : -1);
    });
  }

  const pilotEntries = pilots.map((pilot) => ({
    pilot,
    bestLap: overallFastestLaps.get(pilot.ID) || null,
    consecutiveLaps: fastestConsecutiveLaps.get(pilot.ID) || null,
    channel: pilotChannels.get(pilot.ID)
      ? channels.find((c) => c.ID === pilotChannels.get(pilot.ID))
      : null,
    racesUntilNext: racesUntilNext.get(pilot.ID) ?? -1,
  }));

  const sortedPilots = pilotEntries.sort((a, b) => {
    // If neither pilot has a best lap time, sort by races until next
    if (!a.bestLap && !b.bestLap) {
      // If either pilot has no scheduled race (-1), put them at the end
      if (a.racesUntilNext === -1 && b.racesUntilNext !== -1) return 1;
      if (b.racesUntilNext === -1 && a.racesUntilNext !== -1) return -1;
      
      // First compare racesUntilNext
      if (a.racesUntilNext !== b.racesUntilNext) {
        return a.racesUntilNext - b.racesUntilNext;
      }
      // If racesUntilNext is equal, use channel frequency as tiebreaker
      if (a.channel && b.channel) {
        return a.channel.Number - b.channel.Number;
      }
      // If one pilot has no channel, put them last
      if (!a.channel) return 1;
      if (!b.channel) return -1;
      return 0;
    }
    // If only one pilot has a best lap time, that pilot goes first
    if (!a.bestLap) return 1;
    if (!b.bestLap) return -1;
    // If both pilots have best lap times, sort by time
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
            <th>Next Race In</th>
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
              <td>
                {entry.racesUntilNext === -1 ? (
                  "-"
                ) : entry.racesUntilNext === 0 ? (
                  "Next"
                ) : entry.racesUntilNext === -2 ? (
                  <span style={{ color: 'red' }}>Now</span>
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

