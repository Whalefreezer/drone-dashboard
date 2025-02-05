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
      }, 1000);
      return () => clearInterval(interval);
    }, [updateEventData]);
  }

  return (
    <div style={{ 
      display: 'flex', 
      justifyContent: 'space-between',
      margin: '0 20px',
      width: '100%',
      maxWidth: '100vw',
      boxSizing: 'border-box'
    }}>
      <div style={{ marginRight: '20px' }}>
        <RaceTime />
        {lastRaceIndex !== -1
          ? (
            <>
              Last:{" "}
              <LapsView
                key={races[lastRaceIndex].ID}
                raceId={races[lastRaceIndex].ID}
              />
            </>
          )
          : null}
        {currentRaceIndex !== -1
          ? (
            <>
              Current:{" "}
              <LapsView
                key={races[currentRaceIndex].ID}
                raceId={races[currentRaceIndex].ID}
              />
            </>
          )
          : null}
        Next:{" "}
        {raceSubset.map((race) => <LapsView key={race.ID} raceId={race.ID} />)}
        {/* <pre>{JSON.stringify(eventData, null, 2)}</pre> */}
        {/* <pre>{JSON.stringify(race, null, 2)}</pre> */}
      </div>
      <div style={{ marginLeft: '20px' }}>
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
    <div style={{ border: "solid 1px orange" }}>
      {/* Valid: {race?.Valid ? 'true':'false'}| */}
      {/* Start: {race?.Start}| */}
      {/* End: {race?.End}| */}
      {round?.RoundNumber}-{race.RaceNumber}|
      {race.PilotChannels.map((pilotChannel) => (
        <PilotChannelView key={pilotChannel.ID} pilotChannel={pilotChannel} />
      ))}
      {/* <pre>{JSON.stringify(race, null, 2)}</pre> */}
    </div>
  );
}

function LapsView({ raceId }: { raceId: string }) {
  const roundData = useAtomValue(roundsDataAtom);
  const [race, updateRace] = useAtom(raceFamilyAtom(raceId));
  const pilots = useAtomValue(pilotsAtom);
  const channels = useAtomValue(channelsDataAtom);

  if (UPDATE) {
    useEffect(() => {
      const interval = setInterval(() => {
        updateRace();
      }, 1000);
      return () => clearInterval(interval);
    }, [updateRace]);
  }

  const round = roundData.find((r) => r.ID === race.Round);

  // Calculate maxLaps by looking at all pilot's laps
  const maxLaps = Math.max(
    ...race.PilotChannels.map(pilotChannel => {
      return race.Laps.filter(lap => {
        const detection = race.Detections.find(d => lap.Detection === d.ID);
        return detection && detection.Pilot === pilotChannel.Pilot;
      }).length;
    })
  );

  // Calculate fastest lap for each pilot in this race
  const fastestLaps = new Map<string, number>();
  race.PilotChannels.forEach(pilotChannel => {
    const pilotLaps = race.Laps.filter(lap => {
      const detection = race.Detections.find(d => lap.Detection === d.ID);
      // Get all valid laps for this pilot
      const allPilotLaps = race.Laps.filter(l => {
        const d = race.Detections.find(det => l.Detection === det.ID);
        return d && d.Pilot === pilotChannel.Pilot && d.Valid;
      });
      // Exclude the first lap (holeshot) and invalid detections
      return detection && 
             detection.Pilot === pilotChannel.Pilot && 
             detection.Valid &&
             lap !== allPilotLaps[0];
    });
    if (pilotLaps.length > 0) {
      const fastestLap = Math.min(...pilotLaps.map(lap => lap.LengthSeconds));
      fastestLaps.set(pilotChannel.Pilot, fastestLap);
    }
  });

  const rows: React.ReactNode[] = [];

  // Create header row
  const headerRow: React.ReactNode[] = [
    <th key="header-name">Name</th>,
    <th key="header-channel">Channel</th>
  ];

  // Add lap headers (HS, L1, L2, etc.)
  for (let i = 0; i < maxLaps; i++) {
    headerRow.push(
      <th key={`header-lap-${i}`}>
        {i === 0 ? 'HS' : `L${i}`}
      </th>
    );
  }

  // Create pilot rows
  for (const pilotChannel of race.PilotChannels) {
    const row: React.ReactNode[] = [];
    const pilot = pilots.find((p) => p.ID === pilotChannel.Pilot)!;
    const channel = channels.find((c) => c.ID === pilotChannel.Channel)!;
    
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
    const pilotFastestLap = fastestLaps.get(pilotChannel.Pilot);
    const overallFastestLap = Math.min(...Array.from(fastestLaps.values()));

    for (const lap of race.Laps) {
      const detection = race.Detections.find((d) => lap.Detection === d.ID)!;
      if (detection.Pilot !== pilotChannel.Pilot) {
        continue;
      }
      row.push(
        <td 
          key={lap.ID}
          style={{ 
            backgroundColor: lap.LengthSeconds === pilotFastestLap && 
                           pilotFastestLap === overallFastestLap 
              ? '#1a472a'
            : undefined 
          }}
        >
          {lap.LengthSeconds.toFixed(3)}
        </td>
      );
    }

    rows.push(<tr key={pilotChannel.ID}>{row}</tr>);
  }

  return (
    <div>
      <div>{round?.RoundNumber}-{race.RaceNumber}</div>
      <table style={{ border: "1px solid black", borderCollapse: "collapse" }}>
        <thead>
          <tr>{headerRow}</tr>
        </thead>
        <tbody>
          <style>
            {`
          td, th {
            border: 1px solid black;
            padding: 4px;
          }
        `}
          </style>
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
    <div style={{ display: "flex", alignItems: "center" }}>
      <div>
        {pilot.Name} {channel.ShortBand}
        {channel.Number}
      </div>
      <div style={{ backgroundColor: color, width: "10px", height: "10px" }}>
      </div>
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
      style={{
        backgroundColor: color,
        width: "10px",
        height: "10px",
        margin: "0 5px",
      }}
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
  const raceLength = secondsFromString(eventData[0].RaceLength); // "00:02:30"
  const currentRaceStart = new Date(currentRace.Start).valueOf()/1000;
  const currentRaceEnd = currentRaceStart + raceLength;

  const [timeRemaining, setTimeRemaining] = useState(currentRaceEnd - new Date().valueOf());

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeRemaining(Math.max(0, currentRaceEnd - (new Date().valueOf()/1000)));
    }, 100);
    return () => clearInterval(interval);
  }, [currentRaceEnd]);

  return <div style={{fontFamily: "monospace"}}>{timeRemaining.toFixed(1)}</div>;
}

function secondsFromString(time: string) {
  const [hours, minutes, seconds] = time.split(":");
  return parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseInt(seconds);
}

function Leaderboard() {
  const races = useAtomValue(racesAtom);
  const pilots = useAtomValue(pilotsAtom);
  const channels = useAtomValue(channelsDataAtom);

  // Calculate fastest lap for each pilot across all races
  const overallFastestLaps = new Map<string, number>();
  // Track which channel each pilot is using (from their most recent race)
  const pilotChannels = new Map<string, string>();
  
  races.forEach(race => {
    race.PilotChannels.forEach(pilotChannel => {
      // Store channel assignment if we haven't seen this pilot yet
      if (!pilotChannels.has(pilotChannel.Pilot)) {
        pilotChannels.set(pilotChannel.Pilot, pilotChannel.Channel);
      }

      const pilotLaps = race.Laps.filter(lap => {
        const detection = race.Detections.find(d => lap.Detection === d.ID);
        // Get all valid laps for this pilot in this race
        const allPilotLaps = race.Laps.filter(l => {
          const d = race.Detections.find(det => l.Detection === det.ID);
          return d && d.Pilot === pilotChannel.Pilot && d.Valid;
        });
        // Exclude the first lap (holeshot) and invalid detections
        return detection && 
               detection.Pilot === pilotChannel.Pilot && 
               detection.Valid &&
               lap !== allPilotLaps[0];
      });
      if (pilotLaps.length > 0) {
        const fastestLap = Math.min(...pilotLaps.map(lap => lap.LengthSeconds));
        const currentFastest = overallFastestLaps.get(pilotChannel.Pilot);
        if (!currentFastest || fastestLap < currentFastest) {
          overallFastestLaps.set(pilotChannel.Pilot, fastestLap);
        }
      }
    });
  });

  // Create entries for all pilots, including those without times
  const pilotEntries = pilots.map(pilot => ({
    pilot,
    time: overallFastestLaps.get(pilot.ID) || null,
    channel: pilotChannels.get(pilot.ID) ? 
      channels.find(c => c.ID === pilotChannels.get(pilot.ID)) : 
      null
  }));

  // Sort pilots: those with times first (by time), then those without times (by channel)
  const sortedPilots = pilotEntries.sort((a, b) => {
    if (a.time === null && b.time === null) {
      // If either pilot doesn't have a channel, sort them last
      if (!a.channel) return 1;
      if (!b.channel) return -1;
      
      // Sort by band first
      if (a.channel.ShortBand !== b.channel.ShortBand) {
        return a.channel.ShortBand.localeCompare(b.channel.ShortBand);
      }
      // Then by channel number
      return a.channel.Number - b.channel.Number;
    }
    if (a.time === null) return 1;
    if (b.time === null) return -1;
    return a.time - b.time;
  });

  return (
    <div>
      <h3>Fastest Laps Overall</h3>
      <table style={{ border: "1px solid black", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th>Position</th>
            <th>Pilot</th>
            <th>Channel</th>
            <th>Best Lap</th>
          </tr>
        </thead>
        <tbody>
          <style>{`
            td, th {
              border: 1px solid black;
              padding: 4px;
            }
          `}</style>
          {sortedPilots.map((entry, index) => (
            <tr key={entry.pilot.ID}>
              <td>{entry.time !== null ? index + 1 : '-'}</td>
              <td>{entry.pilot.Name}</td>
              <td>
                {entry.channel ? (
                  <div style={{
                    display: "flex",
                    flexDirection: "row",
                    alignItems: "center",
                  }}>
                    {entry.channel.ShortBand}
                    {entry.channel.Number}
                    <ChannelSquare channelID={entry.channel.ID} />
                  </div>
                ) : '-'}
              </td>
              <td>{entry.time !== null ? entry.time.toFixed(3) : '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default App;
