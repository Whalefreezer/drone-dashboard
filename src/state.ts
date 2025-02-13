import { Atom, atom, useAtomValue, useSetAtom } from "jotai";
import { atomFamily, loadable } from "jotai/utils";
import { Channel, Pilot, Race, RaceEvent, Round } from "./types.ts";
import { useEffect, useState } from "react";
import { atomWithQuery } from "jotai-tanstack-query";
import type { Getter } from "jotai";
import { DefaultError, QueryKey } from "@tanstack/react-query";

const eventIdAtom = atomWithQuery<string | null, DefaultError, string | null, QueryKey>(() => ({
  queryKey: ["eventId"],
  queryFn: async () => {
    const page = await robustFetch("/api");
    const text = await page.text();
    const match = text.match(
      /var eventManager = new EventManager\("events\/([a-f0-9-]+)"/,
    );
    return match ? match[1] : null;
  },
}));

export const eventDataAtom = atomWithQuery((get: Getter) => ({
  queryKey: ["eventData", get(eventIdAtom)],
  queryFn: async () => {
    const eventId = get(eventIdAtom);
    if (!eventId) return null;
    const page = await robustFetch(`/api/events/${eventId}/Event.json`);
    const json = await page.json();
    return json as RaceEvent[];
  },
  enabled: !!get(eventIdAtom),
}));

export const pilotsAtom = atomWithQuery((get: Getter) => ({
  queryKey: ["pilots", get(eventIdAtom)],
  queryFn: async () => {
    const eventId = get(eventIdAtom);
    if (!eventId) return null;
    const page = await robustFetch(`/api/events/${eventId}/Pilots.json`);
    const json = await page.json();
    return json as Pilot[];
  },
  enabled: !!get(eventIdAtom),
}));

export function useCachedAtom<T>(anAtom: Atom<T>) {
  const [cache, setCache] = useState<T | null>(null);

  const value = useAtomValue(loadable(anAtom));

  if (value.state === "loading") {
    if (cache === null) {
      throw new Promise(() => {});
    } else {
      return cache;
    }
  }

  if (value.state === "hasError") {
    throw value.error;
  }

  if (value.state === "hasData") {
    setCache(value.data);
    return value.data;
  }
}

export const channelsDataAtom = atomWithQuery((get: Getter) => ({
  queryKey: ["channels"],
  queryFn: async () => {
    const page = await robustFetch(`/api/httpfiles/Channels.json`);
    const json = await page.json();
    return json as Channel[];
  },
}));

async function robustFetch(url: string): Promise<Response> {
  const timeout = 1000; // 1 second timeout
  const maxRetries = 10;
  let retries = 0;

  while (retries < maxRetries) {
    try {
      const controller = new AbortController();

      // Create a race between the fetch and the timeout
      const response = await Promise.race([
        fetch(url, { signal: controller.signal }),
        new Promise<never>((_, reject) => {
          setTimeout(() => {
            controller.abort();
            reject(new Error("Request timed out"));
          }, timeout);
        }),
      ]);

      return response;
    } catch (err) {
      retries++;
      if (retries === maxRetries) {
        throw new Error(`Failed to fetch after ${maxRetries} retries: ${err}`);
      }
      // Exponential backoff
      await new Promise((resolve) =>
        setTimeout(resolve, Math.pow(2, retries) * 100)
      );
    }
  }
  throw new Error("should not get here");
}

export const roundsDataAtom = atomWithQuery((get: Getter) => ({
  queryKey: ["rounds", get(eventIdAtom)],
  queryFn: async () => {
    const eventId = get(eventIdAtom);
    if (!eventId) return null;
    const page = await robustFetch(`/api/events/${eventId}/Rounds.json`);
    const json = await page.json();
    return json as Round[];
  },
  enabled: !!get(eventIdAtom),
}));

export const racesAtom = atomWithQuery((get: Getter) => ({
  queryKey: ["races", get(eventIdAtom)],
  queryFn: async () => {
    const eventData = get(eventDataAtom);
    if (!eventData || !Array.isArray(eventData) || eventData.length === 0) {
      return [];
    }

    const races = await Promise.all(eventData[0].Races.map((raceId: string) => {
      const raceAtom = raceFamilyAtom(raceId);
      return get(raceAtom);
    }));

    const filteredRaces = races.filter((race): race is RaceWithProcessedLaps =>
      race !== null && race.Valid
    );

    const roundsData = get(roundsDataAtom);
    if (roundsData && Array.isArray(roundsData)) {
      orderRaces(filteredRaces, roundsData);
    }

    return filteredRaces;
  },
  enabled: !!get(eventDataAtom) && !!get(roundsDataAtom),
}));

function orderRaces(races: Race[], rounds: Round[]) {
  return races.sort((a, b) => {
    const aRound = rounds.find((r) => r.ID === a.Round);
    const bRound = rounds.find((r) => r.ID === b.Round);
    const orderDiff = (aRound?.Order ?? 0) - (bRound?.Order ?? 0);
    if (orderDiff !== 0) return orderDiff;
    return (a.RaceNumber ?? 0) - (b.RaceNumber ?? 0);
  });
}

export function findIndexOfCurrentRace(sortedRaces: Race[]) {
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

  return 0;
}

function findLastIndex<T>(
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

export interface RaceWithProcessedLaps extends Race {
  processedLaps: ProcessedLap[];
}

interface ProcessedLap {
  id: string;
  lapNumber: number;
  lengthSeconds: number;
  pilotId: string;
  valid: boolean;
  startTime: string;
  endTime: string;
  isHoleshot: boolean;
}

export const raceFamilyAtom = atomFamily((raceId: string) =>
  atomWithQuery((get: Getter) => ({
    queryKey: ["race", get(eventIdAtom), raceId],
    queryFn: async () => {
      const eventId = get(eventIdAtom);
      if (!eventId) return null;
      const page = await fetch(`/api/events/${eventId}/${raceId}/Race.json`);
      const json = await page.json();
      const race = json[0] as Race;

      const processedLaps = race.Laps
        .map((lap) => {
          const detection = race.Detections.find((d) => lap.Detection === d.ID);
          if (!detection || !detection.Valid) return null;

          return {
            id: lap.ID,
            lapNumber: lap.LapNumber,
            lengthSeconds: lap.LengthSeconds,
            pilotId: detection.Pilot,
            valid: true,
            startTime: lap.StartTime,
            endTime: lap.EndTime,
            isHoleshot: detection.IsHoleshot,
          };
        })
        .filter((lap): lap is ProcessedLap => lap !== null)
        .sort((a, b) => a.lapNumber - b.lapNumber);

      return {
        ...race,
        processedLaps,
      } as RaceWithProcessedLaps;
    },
    enabled: !!get(eventIdAtom),
  }))
);

export const updateAtom = atom<
  (Record<string, { func: () => void; count: number }>)
>({});

export function useUpdater(key: string, updater: () => void) {
  const setUpdate = useSetAtom(updateAtom);
  useEffect(() => {
    setUpdate((update) => {
      update[key] = { func: updater, count: (update[key]?.count ?? 0) + 1 };
      return update;
    });
    return () => {
      setUpdate((update) => {
        update[key].count--;
        if (update[key].count === 0) {
          delete update[key];
        }
        return update;
      });
    };
  }, [updater]);
}

export function useUpdate() {
  const update = useAtomValue(updateAtom);
  useEffect(() => {
    const interval = setInterval(() => {
      for (const updater of Object.values(update)) {
        updater.func();
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [update]);
}

export interface OverallBestTimes {
  overallFastestLap: number;
  pilotBestLaps: Map<string, number>;
}

export const overallBestTimesAtom = atom((get: Getter) => {
  const racesData = get(racesAtom);
  if (!racesData || !Array.isArray(racesData)) return null;

  const overallBestTimes: OverallBestTimes = {
    overallFastestLap: Infinity,
    pilotBestLaps: new Map(),
  };

  racesData.forEach((race: RaceWithProcessedLaps) => {
    race.processedLaps.forEach((lap: ProcessedLap) => {
      if (!lap.isHoleshot) {
        // Update overall fastest
        if (lap.lengthSeconds < overallBestTimes.overallFastestLap) {
          overallBestTimes.overallFastestLap = lap.lengthSeconds;
        }

        // Update pilot's personal best
        const currentBest = overallBestTimes.pilotBestLaps.get(lap.pilotId) ??
          Infinity;
        if (lap.lengthSeconds < currentBest) {
          overallBestTimes.pilotBestLaps.set(lap.pilotId, lap.lengthSeconds);
        }
      }
    });
  });

  return overallBestTimes;
});
