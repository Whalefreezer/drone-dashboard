import { Channel, Pilot, Race, Round } from "./types.ts";
import { ProcessedLap, RaceWithProcessedLaps, LeaderboardEntry } from "./state.ts";

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

// --- Consolidated Elimination Logic --- 

const officalEliminationOrder: [number, string][] = [
];

export function getNormalizedPilotName(name: string): string {
  return name.toLowerCase().replace(/\W+/g, '');
}

export function getEliminationOrderIndex(pilotName: string): number {
  const normalizedName = getNormalizedPilotName(pilotName);
  const entry = officalEliminationOrder.find(([_, name]) => 
    getNormalizedPilotName(String(name)) === normalizedName
  );
  return entry ? Number(entry[0]) : -1;
}

// --- New Helper Functions for Sorting --- 

export function isPilotInEliminationOrder(entry: LeaderboardEntry): boolean {
  return getEliminationOrderIndex(entry.pilot.Name) !== -1;
}

export function pilotHasLaps(entry: LeaderboardEntry): boolean {
  return entry.totalLaps > 0;
}

export function pilotHasConsecutiveLaps(entry: LeaderboardEntry): boolean {
  return entry.consecutiveLaps !== null;
}

export function isPilotEliminated(entry: LeaderboardEntry): boolean {
  return entry.eliminatedInfo !== null;
}

/**
 * Determines the elimination stage based on the bracket number.
 * Returns a number representing the stage (lower is earlier):
 * 1: Heats (<= 8)
 * 2: Quarters (<= 12)
 * 3: Semis (<= 14)
 * 4: Finals (> 14)
 * Returns null if the pilot is not eliminated or info is missing.
 */
export function getEliminationStage(entry: LeaderboardEntry): number | null {
  if (!entry.eliminatedInfo) return null;
  try {
    const bracketNum = parseInt(entry.eliminatedInfo.bracket.replace(/\D/g, ""));
    if (isNaN(bracketNum)) return null;
    if (bracketNum <= 8) return 1; 
    if (bracketNum <= 12) return 2;
    if (bracketNum <= 14) return 3;
    return 4;
  } catch (e) {
    console.error("Error parsing bracket number:", entry.eliminatedInfo.bracket, e);
    return null;
  }
}

// --- Original Sorting Logic (to be potentially removed later) --- 

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
