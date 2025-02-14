import { Race, Round } from "./types.ts";
import { ProcessedLap, RaceWithProcessedLaps } from "./state.ts";

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
  pilotFastestLap: number
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
  pilotId: string
): number {
  // Check if pilot is in current race
  if (races[currentRaceIndex].PilotChannels.some((pc: { Pilot: string }) => pc.Pilot === pilotId)) {
    return -2; // Use -2 to indicate current race
  }

  let racesCount = 0;
  
  for (let i = currentRaceIndex + 1; i < races.length; i++) {
    if (races[i].PilotChannels.some((pc: { Pilot: string }) => pc.Pilot === pilotId)) {
      return racesCount;
    }
    racesCount++;
  }
  
  return -1; // No upcoming races found
}

export function findLastIndex<T>(array: T[], predicate: (value: T) => boolean): number {
  for (let i = array.length - 1; i >= 0; i--) {
    if (predicate(array[i])) {
      return i;
    }
  }
  return -1;
} 