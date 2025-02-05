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
    <>
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
    </>
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

    // Add lap times
    for (const lap of race.Laps) {
      const detection = race.Detections.find((d) => lap.Detection === d.ID)!;
      if (detection.Pilot !== pilotChannel.Pilot) {
        continue;
      }
      row.push(<td key={lap.ID}>{lap.LengthSeconds.toFixed(3)}</td>);
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

export default App;
