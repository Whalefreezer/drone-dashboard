import { Channel, Pilot, Race, Round } from "./types.ts";
import { ProcessedLap, RaceWithProcessedLaps } from "./state.ts";

export const CONSECUTIVE_LAPS = 3; // Central constant for consecutive laps calculation

export function getPositionWithSuffix(position: number): string {
  const suffix = position === 1
    ? "st"
    : position === 2
    ? "nd"
    : position === 3
    ? "rd"
    : "th";
  return `${position}${suffix}`;
}

export function secondsFromString(time: string): number {
  const [hours, minutes, seconds] = time.split(":");
  return parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseInt(seconds);
}

export function orderRaces(races: Race[], rounds: Round[]): Race[] {
  return races.sort((a, b) => {
    const aRound = rounds.find((r) => r.ID === a.Round);
    const bRound = rounds.find((r) => r.ID === b.Round);
    const orderDiff = (aRound?.Order ?? 0) - (bRound?.Order ?? 0);
    if (orderDiff !== 0) return orderDiff;
    return (a.RaceNumber ?? 0) - (b.RaceNumber ?? 0);
  });
}

export function getLapClassName(
  lap: ProcessedLap,
  overallFastestLap: number,
  pilotBestLap: number | undefined,
  raceFastestLap: number,
  pilotFastestLap: number,
): string | undefined {
  if (lap.isHoleshot) return undefined;

  if (lap.lengthSeconds === overallFastestLap) {
    return "lap-overall-fastest";
  } else if (lap.lengthSeconds === pilotBestLap) {
    return "lap-overall-personal-best";
  } else if (lap.lengthSeconds === raceFastestLap) {
    return "lap-fastest-overall";
  } else if (lap.lengthSeconds === pilotFastestLap) {
    return "lap-personal-best";
  }

  return undefined;
}

export function calculateRacesUntilNext(
  races: RaceWithProcessedLaps[],
  currentRaceIndex: number,
  pilotId: string,
): number {
  // Check if pilot is in current race
  if (
    races[currentRaceIndex].PilotChannels.some((pc: { Pilot: string }) =>
      pc.Pilot === pilotId
    )
  ) {
    return -2; // Use -2 to indicate current race
  }

  let racesCount = 0;

  for (let i = currentRaceIndex + 1; i < races.length; i++) {
    if (
      races[i].PilotChannels.some((pc: { Pilot: string }) =>
        pc.Pilot === pilotId
      )
    ) {
      return racesCount;
    }
    racesCount++;
  }

  return -1; // No upcoming races found
}

export function findIndexOfLastRace(sortedRaces: Race[]) {
  const currentRaceIndex = findIndexOfCurrentRace(sortedRaces);
  if (currentRaceIndex === -1) {
    return -1;
  }

  for (let i = currentRaceIndex - 1; i >= 0; i--) {
    if (sortedRaces[i].Valid) {
      return i;
    }
  }
  return -1;
}

export function findLastIndex<T>(
  array: T[],
  predicate: (value: T) => boolean,
): number {
  for (let i = array.length - 1; i >= 0; i--) {
    if (predicate(array[i])) {
      return i;
    }
  }
  return -1;
}

interface PilotEntry {
  pilot: Pilot;
  bestLap: BestTime | null;
  consecutiveLaps: ConsecutiveTime | null;
  channel: Channel | null;
  racesUntilNext: number;
  totalLaps: number;
  bestHoleshot: BestTime | null;
  eliminatedInfo: {
    bracket: string;
    position: number;
    points: number;
  } | null;
}

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

export function calculateBestTimes(races: RaceWithProcessedLaps[]) {
  const overallFastestLaps = new Map<string, BestTime>();
  const fastestConsecutiveLaps = new Map<string, ConsecutiveTime>();
  const fastestHoleshots = new Map<string, BestTime>();
  const pilotChannels = new Map<string, string>();

  races.forEach((race) => {
    race.PilotChannels.forEach((pilotChannel) => {
      if (!pilotChannels.has(pilotChannel.Pilot)) {
        pilotChannels.set(pilotChannel.Pilot, pilotChannel.Channel);
      }

      const racingLaps = race.processedLaps.filter((lap) =>
        lap.pilotId === pilotChannel.Pilot && !lap.isHoleshot
      );

      const holeshotLaps = race.processedLaps.filter((lap) =>
        lap.pilotId === pilotChannel.Pilot && lap.isHoleshot
      );

      updateFastestLaps(
        racingLaps,
        pilotChannel.Pilot,
        race,
        overallFastestLaps,
      );
      updateConsecutiveLaps(
        racingLaps,
        pilotChannel.Pilot,
        race,
        fastestConsecutiveLaps,
      );
      updateFastestLaps(
        holeshotLaps,
        pilotChannel.Pilot,
        race,
        fastestHoleshots,
      );
    });
  });

  return {
    overallFastestLaps,
    fastestConsecutiveLaps,
    fastestHoleshots,
    pilotChannels,
  };
}

function updateFastestLaps(
  racingLaps: ProcessedLap[],
  pilotId: string,
  race: RaceWithProcessedLaps,
  overallFastestLaps: Map<string, BestTime>,
) {
  if (racingLaps.length > 0) {
    const fastestLap = racingLaps.reduce((fastest, lap) =>
      lap.lengthSeconds < fastest.lengthSeconds ? lap : fastest
    );

    const currentFastest = overallFastestLaps.get(pilotId);
    if (!currentFastest || fastestLap.lengthSeconds < currentFastest.time) {
      overallFastestLaps.set(pilotId, {
        time: fastestLap.lengthSeconds,
        roundId: race.Round,
        raceNumber: race.RaceNumber,
        lapNumber: fastestLap.lapNumber,
      });
    }
  }
}

function updateConsecutiveLaps(
  racingLaps: ProcessedLap[],
  pilotId: string,
  race: RaceWithProcessedLaps,
  fastestConsecutiveLaps: Map<string, ConsecutiveTime>,
) {
  if (racingLaps.length >= CONSECUTIVE_LAPS) {
    let fastestConsecutive = { time: Infinity, startLap: 0 };
    for (let i = 0; i < racingLaps.length - (CONSECUTIVE_LAPS - 1); i++) {
      const consecutiveLapsTime = racingLaps
        .slice(i, i + CONSECUTIVE_LAPS)
        .reduce((sum, lap) => sum + lap.lengthSeconds, 0);
      if (consecutiveLapsTime < fastestConsecutive.time) {
        fastestConsecutive = {
          time: consecutiveLapsTime,
          startLap: racingLaps[i].lapNumber,
        };
      }
    }

    const currentFastestConsecutive = fastestConsecutiveLaps.get(pilotId);
    if (
      !currentFastestConsecutive ||
      fastestConsecutive.time < currentFastestConsecutive.time
    ) {
      fastestConsecutiveLaps.set(pilotId, {
        ...fastestConsecutive,
        roundId: race.Round,
        raceNumber: race.RaceNumber,
      });
    }
  }
}

const officalEliminationOrder = [
  [5, "SLOOGUS"],
  [6, "FPVDOG"],
  [7, "RED2ROTOR"], 
  [8, "JUICYFLICK"],
  [9, "EBFPV"],
  [10, "Q-SWITCH"],
  [11, "SQUID"],
  [12, "MIRELLAFPV"],
  [13, "KRYPTO"],
  [14, "CRAZYBRAIN"],
  [15, "KUATO"],
  [16, "MACDADDY"],
  [17, "ZENITH"],
  [18, "REDALIN"],
  [19, "RISLER"],
  [20, "FIZZ"],
  [21, "IBEX"],
  [22, "SPEED DEMON"],
  [23, "Iceberg"],
  [24, "AEROPLANEJELLY"],
  [25, "BOB9"],
  [26, "ROBO"],
  [27, "BRODIE REED"],
  [28, "MAD MITCH"],
  [29, "Tek FPV"],
  [30, "WILLMAN"],
  [31, "PHIX"],
  [32, "NUG NUG"],
  [33, "Hopper FPV"],
  [34, "Fazented"],
  [35, "Heatsink"],
  [36, "Red Dog"],
  [37, "Buglish"],
  [38, "Cookie FPV"],
  [39, "Kiwi"],
  [40, "Nil"],
  [41, "SnapperFPV"],
  [42, "Papa Bear"],
];

function compareChannels(a: PilotEntry, b: PilotEntry): number {
  if (a.channel && b.channel) {
    return a.channel.Number - b.channel.Number;
  }
  if (!a.channel) return 1;
  if (!b.channel) return -1;
  return 0;
}

function compareRacesUntilNext(a: PilotEntry, b: PilotEntry): number {
  if (a.racesUntilNext === -1 && b.racesUntilNext !== -1) return 1;
  if (b.racesUntilNext === -1 && a.racesUntilNext !== -1) return -1;
  if (a.racesUntilNext !== b.racesUntilNext) {
    return a.racesUntilNext - b.racesUntilNext;
  }
  return 0;
}

function getEliminationGroup(bracketNum: number): number {
  if (bracketNum <= 8) return 1; // H1-H8
  if (bracketNum <= 12) return 2; // H9-H12
  if (bracketNum <= 14) return 3; // H13-H14
  return 4; // H15 (finals)
}

function getSeedNumber(seedPosition: string): number {
  return parseInt(seedPosition.replace(/(?:st|nd|rd|th)$/, ""));
}

function compareEliminatedPilots(a: PilotEntry, b: PilotEntry): number {
  if (!a.eliminatedInfo || !b.eliminatedInfo) return 0;

  const aBracketNum = parseInt(a.eliminatedInfo.bracket.replace(/\D/g, ""));
  const bBracketNum = parseInt(b.eliminatedInfo.bracket.replace(/\D/g, ""));

  const aGroup = getEliminationGroup(aBracketNum);
  const bGroup = getEliminationGroup(bBracketNum);

  // Sort by group first (later groups come first)
  if (aGroup !== bGroup) {
    return bGroup - aGroup;
  }

  // Within the same group, sort by points
  const pointsDiff = b.eliminatedInfo.points - a.eliminatedInfo.points;
  if (pointsDiff !== 0) {
    return pointsDiff;
  }

  // If points are equal, use seed position as tiebreaker
  // Lower seed number (better position) should come first
  if (a.pilot.Seed && b.pilot.Seed) {
    return getSeedNumber(a.pilot.Seed) - getSeedNumber(b.pilot.Seed);
  }

  return 0;
}

function getNormalizedPilotName(name: string): string {
  return name.toLowerCase().replace(/\W+/g, '');
}

function getEliminationOrderIndex(pilotName: string): number {
  const normalizedName = getNormalizedPilotName(pilotName);
  const entry = officalEliminationOrder.find(([_, name]) => 
    getNormalizedPilotName(String(name)) === normalizedName
  );
  return entry ? entry[0] : -1;
}

export function sortPilotEntries(pilotEntries: PilotEntry[]): PilotEntry[] {
  return pilotEntries.sort((a, b) => {
    const aElimIndex = getEliminationOrderIndex(a.pilot.Name);
    const bElimIndex = getEliminationOrderIndex(b.pilot.Name);
    
    // If both pilots are in elimination order, sort by their index
    if (aElimIndex !== -1 && bElimIndex !== -1) {
      return aElimIndex - bElimIndex;
    }
    
    // If only one pilot is in elimination order, they come after
    if (aElimIndex !== -1) return 1;
    if (bElimIndex !== -1) return -1;

    // For pilots not in elimination order, use the original sorting logic
    const aHasLaps = a.totalLaps > 0;
    const bHasLaps = b.totalLaps > 0;

    if (aHasLaps !== bHasLaps) {
      return aHasLaps ? -1 : 1;
    }

    // If both have no laps, sort by races until next and channel
    if (!aHasLaps) {
      const racesComparison = compareRacesUntilNext(a, b);
      return racesComparison !== 0 ? racesComparison : compareChannels(a, b);
    }

    if (a.eliminatedInfo && b.eliminatedInfo) {
      return compareEliminatedPilots(a, b);
    }

    if (a.eliminatedInfo) return 1;
    if (b.eliminatedInfo) return -1;

    if (!a.consecutiveLaps && !b.consecutiveLaps) {
      const racesComparison = compareRacesUntilNext(a, b);
      return racesComparison !== 0 ? racesComparison : compareChannels(a, b);
    }

    if (!a.consecutiveLaps) return 1;
    if (!b.consecutiveLaps) return -1;

    return a.consecutiveLaps.time - b.consecutiveLaps.time;
  });
}

export function findIndexOfCurrentRace(sortedRaces: Race[]) {
  if (!sortedRaces || sortedRaces.length === 0) {
    return -1;
  }

  const activeRace = sortedRaces.findIndex((race) => {
    if (!race.Valid) {
      return false;
    }
    if (!race.Start || race.Start.startsWith("0")) {
      return false;
    }
    if (!race.End || race.End.startsWith("0")) {
      return true;
    }
    return false;
  });

  if (activeRace !== -1) {
    return activeRace;
  }

  const lastRace = findLastIndex(sortedRaces, (race) => {
    if (!race.Valid) {
      return false;
    }

    if (
      race.Start && !race.Start.startsWith("0") && race.End &&
      !race.End.startsWith("0")
    ) {
      return true;
    }
    return false;
  });

  if (lastRace !== -1) {
    return Math.min(lastRace + 1, sortedRaces.length - 1);
  }

  return sortedRaces.length > 0 ? 0 : -1;
}
