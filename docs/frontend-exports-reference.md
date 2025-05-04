# Frontend Exports Reference

This document provides a snapshot of the exported components, functions, types, and state atoms within the `frontend/src` directory. It is generated based on the current codebase and serves as a reference for understanding the project structure.

Much of this structure is the result of the plan outlined in [`component-refactoring-plan.md`](mdc:docs/component-refactoring-plan.md).

## Directory Overview

### `common/`
Shared utilities, components, and hooks used across different features.

-   **`ChannelSquare.tsx`**:
    -   `ChannelSquare`
-   **`ErrorBoundary.tsx`**:
    -   `ErrorBoundary` (default)
-   **`Legend.tsx`**:
    -   `Legend` (default)
-   **`LegendItem.tsx`**:
    -   `LegendItem` (default)
-   **`Spinner.tsx`**:
    -   `Spinner` (default)
-   **`TimeDisplay.tsx`**:
    -   `TimeDisplay` (default)
-   **`index.ts`**:
    -   Exports from `./utils.ts`.
    -   `TimeDisplay`, `Spinner`, `ErrorBoundary`.
-   **`useIdleCursor.ts`**:
    -   `useIdleCursor`
-   **`utils.ts`**:
    -   `CONSECUTIVE_LAPS`
    -   `getPositionWithSuffix`
    -   `secondsFromString`
    -   `orderRaces`
    -   `getLapClassName`
    -   `calculateRacesUntilNext`
    -   `findIndexOfLastRace`
    -   `findLastIndex`
    -   `calculateBestTimes`
    -   `getNormalizedPilotName`
    -   `getEliminationOrderIndex`
    -   `isPilotInEliminationOrder`
    -   `pilotHasLaps`
    -   `pilotHasConsecutiveLaps`
    -   `isPilotEliminated`
    -   `getEliminationStage`
    -   `findIndexOfCurrentRace`

### `leaderboard/`
Components, logic, state, and types related to the race leaderboard.

-   **`Leaderboard.tsx`**:
    -   `Leaderboard`
-   **`index.ts`**:
    -   `Leaderboard`
    -   Exports from `./leaderboard-types.ts`.
-   **`leaderboard-logic.ts`**:
    -   `calculateLeaderboardData`
    -   `getPositionChanges`
    -   `sortLeaderboard`
    -   `defaultLeaderboardSortConfig`
-   **`leaderboard-state.ts`**: (Currently empty placeholder).
-   **`leaderboard-types.ts`**:
    -   `LeaderboardEntry`
    -   `SortDirection`
    -   `NullHandling`
    -   `SortCriteria`
    -   `SortGroup`

### `devTools/`
Tools and utilities for development and debugging, primarily related to mock service workers (MSW) and scenario switching.

-   **`ScenarioSelector.tsx`**:
    -   `ScenarioSelector` (default)
-   **`SnapshotControl.tsx`**:
    -   `SnapshotControl` (default)
-   **`browser.ts`**:
    -   `worker`
    -   `startWorker`
-   **`index.ts`**: (Not present in search results, assumed no index).
-   **`initialize.tsx`**:
    -   `enableMocking`
-   **`server.ts`**:
    -   `initializeServerHandlers`
    -   `server`
    -   `applyServerHandlers`
-   **`snapshotConstants.ts`**:
    -   `SNAPSHOT_TARGET_ENDPOINTS`
    -   `RACE_DATA_ENDPOINT_TEMPLATE`
    -   `BASE_URL`
-   **`workerUtils.ts`**:
    -   `loadDefaultHandlers`
-   **`devTools/scenarios/`**: Sub-directory for scenario definitions.
    -   **`index.ts`**:
        -   `jsonScenarioFiles`
        -   `scenarioNames`
        -   `DEFAULT_SCENARIO_NAME`
        -   `getHandlersByScenarioName`
    -   **`jsonScenarioLoader.ts`**:
        -   `createHandlersFromJson`

### `state/`
Global state management using Jotai atoms and related hooks.

-   **`atoms.ts`**:
    -   `eventIdAtom`
    -   `eventDataAtom`
    -   `bracketsDataAtom`
    -   `pilotsAtom`
    -   `useCachedAtom`
    -   `channelsDataAtom`
    -   `roundsDataAtom`
    -   `racesAtom`
    -   `ProcessedLap`
    -   `RaceWithProcessedLaps`
    -   `raceFamilyAtom`
    -   `updateAtom`
    -   `useUpdater`
    -   `useUpdate`
    -   `OverallBestTimes`
    -   `overallBestTimesAtom`
    -   `usePeriodicUpdate`
    -   `findEliminatedPilots`
-   **`hooks.ts`**:
    -   `useQueryAtom`
-   **`index.ts`**:
    -   Exports from `./atoms.ts`.
    -   Exports from `./hooks.ts`.

### `bracket/`
Components and types related to the tournament bracket view.

-   **`BracketsView.tsx`**:
    -   `BracketsView`
-   **`EliminatedPilotsView.tsx`**:
    -   `EliminatedPilotsView`
-   **`index.ts`**:
    -   `BracketsView`, `EliminatedPilotsView`.
-   **`bracket-types.ts`**:
    -   `BracketPilot`
    -   `Bracket`
    -   `EliminatedPilot`

### `pilot/`
Components and types related to individual pilots.

-   **`PilotChannelView.tsx`**:
    -   `PilotChannelView` (Note: Export might be missing/commented in index)
-   **`index.ts`**:
    -   `PilotChannelView`
-   **`pilot-types.ts`**:
    -   `PilotChannelViewProps`

### `race/`
Components and types related to race display and scheduling. (Note: Hooks file `race-hooks.ts` mentioned in plan but not found in exports).

-   **`DaySchedule.tsx`**: (Export not found)
-   **`LapsView.tsx`**: (Export not found)
-   **`RaceTime.tsx`**: (Export not found)

### `types/`
Shared data structures and type definitions.

-   **`types.ts`**:
    -   `RaceEvent`
    -   `Round`
    -   `Pilot`
    -   `Channel`
    -   `Lap`
    -   `Race`
    -   `Detection`
    -   `TimingSystemType`
    -   `ValidityType`

### Root Level

-   **`App.tsx`**:
    -   `App` (default)
-   **`main.tsx`**: (Entry point - no specific exports found)

---

*This reference is based on `export` statements found in `.ts` and `.tsx` files within `frontend/src` as of the generation date. It may not capture all entities if they are exported differently or implicitly used.* 