# Implementation Plan: race-hooks.ts

## Goal

Create the `frontend/src/race/race-hooks.ts` file and populate it with custom React hooks to encapsulate race-related data fetching, state access, calculations, and side effects, removing this logic from the `App.tsx` and `LapsView.tsx` components. This aligns with Phase 6 of the [Component Refactoring Plan](mdc:docs/component-refactoring-plan.md).

## Prerequisites

1.  Create the file `frontend/src/race/race-hooks.ts`.
2.  Ensure necessary Jotai atoms (`racesAtom`, `raceFamilyAtom`, `roundsDataAtom`, `pilotsAtom`, `channelsDataAtom`, `overallBestTimesAtom`) are defined and exported correctly from the state layer (e.g., `frontend/src/state/atoms.ts`).
3.  **Define Derived Atoms:** Ensure the following derived atoms are defined in the state layer (e.g., `frontend/src/state/atoms.ts` or `frontend/src/state/raceAtoms.ts`), using the helper functions from `frontend/src/common/utils.ts`:
    ```typescript
    // Example definitions:
    import { atom } from 'jotai';
    import { racesAtom } from './atoms';
    import { findIndexOfCurrentRace, findIndexOfLastRace } from '../common/utils';

    export const currentRaceIndexAtom = atom((get) => {
      const races = get(racesAtom);
      return findIndexOfCurrentRace(races);
    });

    export const lastRaceIndexAtom = atom((get) => {
      const races = get(racesAtom);
      return findIndexOfLastRace(races);
    });
    ```
4.  Ensure the `usePeriodicUpdate` hook is available, likely from `frontend/src/state/hooks.ts`.

## Step-by-Step Hook Creation

### 1. `useRaceNavigation`

*   **Purpose:** Provides information about the overall race sequence (current, last, next indices and the subset of next races).
*   **Logic to Extract:**
    *   Accessing `racesAtom` (`useAtomValue(racesAtom)`).
    *   Calculating the `nextRaces` slice based on `currentRaceIndex`.
*   **Source Component:** `App.tsx` (Slicing logic for `raceSubset`, Lines ~24)
*   **Implementation (`race-hooks.ts`):**
    ```typescript
    import { useAtomValue } from 'jotai';
    // Import the derived atoms and racesAtom
    import { racesAtom, currentRaceIndexAtom, lastRaceIndexAtom } from '../state/atoms'; // Adjust path if needed
    import { Race } from '../types'; // Adjust path if needed

    export function useRaceNavigation() {
      const races = useAtomValue(racesAtom); // Needed for slicing nextRaces
      const currentRaceIndex = useAtomValue(currentRaceIndexAtom); // Read derived atom
      const lastRaceIndex = useAtomValue(lastRaceIndexAtom);     // Read derived atom

      // Define how many next races to show, e.g., 8
      const NEXT_RACE_COUNT = 8;
      const nextRaces = races.slice(
        currentRaceIndex + 1,
        // Ensure index does not go out of bounds if currentRaceIndex is near the end
        Math.min(races.length, currentRaceIndex + 1 + NEXT_RACE_COUNT),
      );

      return {
        currentRaceIndex,
        lastRaceIndex,
        nextRaces, // Previously raceSubset
      };
    }
    ```
*   **Return Value:** `{ currentRaceIndex: number, lastRaceIndex: number, nextRaces: Race[] }`

### 2. `useRaceDetails`

*   **Purpose:** Provides detailed information and update capabilities for a *specific* race, identified by `raceId`.
*   **Logic to Extract:**
    *   Accessing/updating specific race state (`useAtom(raceFamilyAtom(raceId))`).
    *   Conditionally applying periodic updates (`usePeriodicUpdate(updateRace, isCurrentRace ? 500 : 10_000)`).
    *   Looking up the corresponding round data (`roundData.find(...)`).
    *   Calculating `maxLaps` based on the race's processed laps.
*   **Source Component:** `LapsView.tsx` (Lines ~37-50, ~91)
*   **Implementation (`race-hooks.ts`):**
    ```typescript
    import { useAtom, useAtomValue } from 'jotai';
    // Import raceFamilyAtom, roundsDataAtom, and the derived currentRaceIndexAtom
    import { raceFamilyAtom, roundsDataAtom, currentRaceIndexAtom } from '../state/atoms'; // Adjust path
    import { usePeriodicUpdate } from '../state/hooks'; // Adjust path
    import { RaceWithProcessedLaps, Round } from '../types'; // Adjust path

    export function useRaceDetails(raceId: string) {
      const roundData = useAtomValue(roundsDataAtom);
      const [race, updateRace] = useAtom(raceFamilyAtom(raceId));
      const currentRaceIndex = useAtomValue(currentRaceIndexAtom); // Use derived atom

      // Need to get the specific race from the family *or* the full list to compare ID
      // Simpler approach: Check if the fetched race's index matches currentRaceIndex
      // This assumes race data includes its position/index or can be found easily.
      // Alternative: Fetch racesAtom if needed, but less efficient.
      // Let's assume for now the comparison happens in the component or a selector.
      // We'll just pass the index for now.
      // A potentially better approach: the atomFamily itself could derive isCurrentRace.

      // Determine if this race IS the current race (simplified check based on index)
      // This logic might be better placed *within* the component using the hook,
      // or ideally, derived within the state layer if possible.
      // For now, we rely on the component calling this hook to know the races list
      // to perform the check: races[currentRaceIndex]?.ID === raceId
      const isCurrentRace = useAtomValue(racesAtom)[currentRaceIndex]?.ID === raceId; // Example check

      // Apply periodic updates
      usePeriodicUpdate(updateRace, isCurrentRace ? 500 : 10_000);

      const round = roundData.find((r) => r.ID === race.Round);

      const maxLaps = Math.max(
        0,
        ...(race.processedLaps?.map((lap) => lap.lapNumber) || [0]),
      );

      return {
        race, // RaceWithProcessedLaps
        updateRace,
        round, // Round | undefined
        maxLaps,
        isCurrentRace, // Pass the calculated flag
      };
    }
    ```
*   **Return Value:** `{ race: RaceWithProcessedLaps, updateRace: (update: RaceWithProcessedLaps) => void, round: Round | undefined, maxLaps: number, isCurrentRace: boolean }`

### 3. `usePilotRaceData` (Example Name - Could be part of `useRaceDetails` or separate)

*   **Purpose:** Provides calculated lap time data for a specific pilot within a specific race context. *Initially considered `useLapTimes`, but this is more about pilot context within the race.*
*   **Logic to Extract:**
    *   Accessing pilot/channel/best time atoms (`pilotsAtom`, `channelsDataAtom`, `overallBestTimesAtom`).
    *   Finding specific pilot and channel details.
    *   Calculating `pilotLaps`, `racingLaps`, `fastestLap`, `overallFastestLap` for the given pilot in the race.
*   **Source Component:** `LapsTableRow` within `LapsView.tsx` (Lines ~158-171)
*   **Implementation (`race-hooks.ts`):**
    ```typescript
    import { useAtomValue } from 'jotai';
    import { pilotsAtom, channelsDataAtom, overallBestTimesAtom } from '../state/atoms'; // Adjust path
    import { PilotChannel, RaceWithProcessedLaps, Pilot, Channel, Lap } from '../types'; // Adjust path

    export function usePilotRaceData(race: RaceWithProcessedLaps, pilotChannel: PilotChannel) {
      const pilots = useAtomValue(pilotsAtom);
      const channels = useAtomValue(channelsDataAtom);
      const overallBestTimes = useAtomValue(overallBestTimesAtom); // Global bests

      const pilot = pilots.find((p) => p.ID === pilotChannel.Pilot);
      const channel = channels.find((c) => c.ID === pilotChannel.Channel);

      const pilotLaps = race.processedLaps?.filter((lap) => lap.pilotId === pilotChannel.Pilot) || []; // Add null check

      const racingLaps = pilotLaps.filter((lap) => !lap.isHoleshot);

      // Pilot's fastest lap in *this* race
      const fastestLapInRace = racingLaps.length > 0
        ? Math.min(...racingLaps.map((lap) => lap.lengthSeconds))
        : Infinity;

      // Overall fastest lap in *this* race (across all pilots)
      const overallFastestLapInRace = race.processedLaps?.filter(lap => !lap.isHoleshot).length > 0
        ? Math.min(
          ...(race.processedLaps
            .filter((lap) => !lap.isHoleshot)
            .map((lap) => lap.lengthSeconds)),
        )
        : Infinity;
        
      // Pilot's best ever recorded lap (from overallBestTimesAtom)
      const pilotOverallBest = overallBestTimes.pilotBestLaps.get(pilotChannel.Pilot); 
      // Overall best ever recorded lap (from overallBestTimesAtom)
      const overallBestEver = overallBestTimes.overallFastestLap; 

      return {
        pilot, // Pilot | undefined
        channel, // Channel | undefined
        pilotLaps, // Lap[]
        fastestLapInRace, // number
        overallFastestLapInRace, // number
        pilotOverallBest, // number | undefined (from global state)
        overallBestEver, // number | undefined (from global state)
      };
    }
    ```
*   **Return Value:** `{ pilot?: Pilot, channel?: Channel, pilotLaps: Lap[], fastestLapInRace: number, overallFastestLapInRace: number, pilotOverallBest?: number, overallBestEver?: number }`

### 4. Review Time-Related Logic

*   **Action:** Examine `RaceTime.tsx` and `TimeDisplay.tsx`.
*   **Goal:** Determine if any core state logic (not just presentation) resides there that should be moved to a hook (either `useRaceDetails` or a new common `useTime` hook if applicable). `TimeDisplay` likely uses a global `currentTimeAtom`. `RaceTime` might calculate elapsed time based on the current race start time fetched via `useRaceDetails`. Decide if refactoring is needed based on findings. (No specific hook creation planned *yet*, just analysis).

## Component Refactoring Steps

1.  **Refactor `App.tsx`:**
    *   Remove direct `useAtomValue(racesAtom)` call *unless* needed to pass specific race IDs based on index.
    *   Remove `findIndexOfCurrentRace`, `findIndexOfLastRace` helper function calls.
    *   Remove direct `usePeriodicUpdate` call (unless it's for a truly global update not related to races).
    *   Call `const { currentRaceIndex, lastRaceIndex, nextRaces } = useRaceNavigation();`.
    *   Use `currentRaceIndex` and `lastRaceIndex` (potentially with `useAtomValue(racesAtom)`) to get the IDs needed for `LapsView`.
    *   Pass `nextRaces` map to the relevant components (`LapsView`).

2.  **Refactor `LapsView.tsx`:**
    *   Remove direct `useAtom(raceFamilyAtom(raceId))`.
    *   Remove direct `useAtomValue(roundsDataAtom)`.
    *   Remove direct `usePeriodicUpdate`.
    *   Remove `round` lookup logic.
    *   Remove `maxLaps` calculation.
    *   Remove `getBracketData` (This logic likely belongs in `bracket-hooks.ts`, needs cross-checking).
    *   Call `const { race, round, maxLaps, isCurrentRace } = useRaceDetails(raceId);`.
    *   Use the returned `race`, `round`, and `maxLaps` in the component rendering.
    *   Remove state atom imports that are no longer directly used.

3.  **Refactor `LapsTableRow` (within `LapsView.tsx`):**
    *   Remove direct `useAtomValue` calls for `pilotsAtom`, `channelsDataAtom`, `overallBestTimesAtom`.
    *   Remove pilot/channel lookup logic.
    *   Remove calculations for `pilotLaps`, `racingLaps`, `fastestLap`, `overallFastestLap`.
    *   Call `const { pilot, channel, pilotLaps, fastestLapInRace, overallFastestLapInRace, pilotOverallBest, overallBestEver } = usePilotRaceData(race, pilotChannel);` (passing `race` and `pilotChannel` as props).
    *   Use the returned values for rendering lap cells and pilot info. Update `getLapClassName` usage to pass the correct best lap values (e.g., `overallBestEver`, `pilotOverallBest`, `overallFastestLapInRace`, `fastestLapInRace`).
    *   Remove state atom imports that are no longer directly used.

## Testing

1.  Write unit tests for each new custom hook (`useRaceNavigation`, `useRaceDetails`, `usePilotRaceData`) using a library like React Testing Library (`renderHook`).
2.  Mock Jotai providers and atom values as needed for testing hook logic in isolation.
3.  Verify that the refactored components (`App.tsx`, `LapsView.tsx`) still render correctly and behave as expected using existing or new component/integration tests.

## Final Review

*   Ensure all extracted logic is covered by the new hooks.
*   Remove unused imports and variables from refactored components.
*   Verify props passed between components are correct after refactoring.
*   Update `frontend/src/race/index.ts` to export the new hooks if desired.
*   Mark the relevant section in the main [Component Refactoring Plan](mdc:docs/component-refactoring-plan.md) as "In Progress" or "Done" once completed. 