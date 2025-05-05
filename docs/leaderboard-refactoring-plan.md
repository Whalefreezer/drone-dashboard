# Leaderboard Component Refactoring Plan

*This plan details the specific refactoring steps for the `Leaderboard` component ([frontend/src/leaderboard/Leaderboard.tsx](mdc:frontend/src/leaderboard/Leaderboard.tsx)) and aligns with the broader strategy outlined in the main [Component Refactoring Plan](mdc:docs/component-refactoring-plan.md).*

## 1. Introduction

The `Leaderboard.tsx` component ([frontend/src/leaderboard/Leaderboard.tsx](mdc:frontend/src/leaderboard/Leaderboard.tsx)) has grown significantly and currently handles data fetching, complex state calculations, rendering logic, and animation effects within a single file. This makes it difficult to maintain, test, and understand.

**Goal:** Refactor the `Leaderboard` component to improve modularity, readability, testability, and separation of concerns by extracting logic into custom hooks and smaller sub-components.

## 2. Current State Analysis

The component currently performs the following functions:

-   **State Fetching:** Uses Jotai atoms (`racesAtom`, `pilotsAtom`, `channelsDataAtom`, `roundsDataAtom`, `bracketsDataAtom`) and hooks (`useAtomValue`, `useQueryAtom`) to retrieve necessary data.
-   **Data Calculation:**
    -   Calculates `currentRaceIndex`.
    -   Finds `eliminatedPilots`.
    -   Uses `useMemo` with `calculateLeaderboardData` to derive `currentLeaderboard` and `previousLeaderboard`.
    -   Uses `useMemo` with `getPositionChanges` to calculate `positionChanges`.
-   **Callbacks:** Defines memoized callbacks (`isRecentTime`, `renderPositionChange`, `renderTimeWithDiff`) used within the rendering logic.
-   **Animation Effect:** Uses `useEffect` and `useState` (`animatingRows`) to handle the animation of rows when positions improve.
-   **Rendering:** Renders the main container, table headers, and iterates through `currentLeaderboard` to render table rows (`<tr>`), including complex logic for displaying position changes, times with differences, channel information, and next race status.

## 3. Proposed Refactoring Strategy

### 3.1. Extract Data Logic into Custom Hooks

Create a new file for leaderboard-specific hooks: `frontend/src/leaderboard/leaderboard-hooks.ts`.

-   **`useLeaderboardState()` (in `leaderboard-hooks.ts`):**
    -   **Responsibility:** Encapsulate fetching data from Jotai atoms (`racesAtom`, `pilotsAtom`, `channelsDataAtom`, `roundsDataAtom`, `bracketsDataAtom` from `frontend/src/state/index.ts`).
    -   **Returns:** An object containing the raw data needed by other hooks/components.
    `{ races, pilots, channels, roundDataValue, brackets }`

-   **`useLeaderboardCalculations(leaderboardState)` (in `leaderboard-hooks.ts`):**
    -   **Input:** The state object returned by `useLeaderboardState`.
    -   **Responsibility:** Perform calculations based on the raw data. This includes `currentRaceIndex`, `eliminatedPilots`, `currentLeaderboard`, `previousLeaderboard`, and `positionChanges`. It will utilize functions from `frontend/src/leaderboard/leaderboard-logic.ts` and potentially `frontend/src/common/index.ts`.
    -   **Returns:** An object containing the calculated data.
    `{ currentRaceIndex, eliminatedPilots, currentLeaderboard, previousLeaderboard, positionChanges }`
    -   **Internal:** Uses `useMemo` for expensive calculations like `calculateLeaderboardData` and `getPositionChanges`.

-   **`useLeaderboardAnimation(currentLeaderboard, positionChanges)` (in `leaderboard-hooks.ts`):**
    -   **Input:** `currentLeaderboard` and `positionChanges` from `useLeaderboardCalculations`.
    -   **Responsibility:** Manage the state (`animatingRows`) and effect for animating position changes.
    -   **Returns:** The `animatingRows` set.

### 3.2. Define Internal Sub-components for Rendering

Instead of creating separate files, these new components will be defined *within* the `frontend/src/leaderboard/Leaderboard.tsx` file to keep them co-located with their primary usage context.

-   **`LeaderboardTable` (defined in `Leaderboard.tsx`):**
    -   **Responsibility:** Renders the main `<table>` structure, `<thead>`, and `<tbody>`. Iterates over `leaderboardData`.
    -   **Props:** `leaderboardData` (currentLeaderboard), `animatingRows`, and potentially callback functions or derived data needed by rows.

-   **`LeaderboardRow` (defined in `Leaderboard.tsx`):**
    -   **Responsibility:** Renders a single `<tr>` for a pilot.
    -   **Props:** `entry` (current leaderboard entry), `previousEntry`, `isEliminated`, `isAnimating`, `position` (index + 1), callbacks/data needed for cells.
    -   **Internal:** Renders individual cells or delegates to cell components.

-   **`PositionCell` (defined in `Leaderboard.tsx`):**
    -   **Responsibility:** Renders the position `<td>`, including the position number and the position change indicator (`↑X from Y`).
    -   **Props:** `pilotId`, `currentPosition`, `positionChanges`.

-   **`TimeDisplayCell` (defined in `Leaderboard.tsx`):**
    -   **Responsibility:** Renders a `<td>` for time values (Holeshot, Top Lap, Consecutive), including the time, source info, and time difference logic.
    -   **Props:** `currentTime` object, `previousTime` object, `isRecentCallback`, `roundData`. Uses `formatTimeDifference` (defined initially in `Leaderboard.tsx`, potentially moved to `leaderboard-utils.ts` or `common/time-utils.ts`).

-   **`ChannelDisplayCell` (defined in `Leaderboard.tsx`):**
    -   **Responsibility:** Renders the `<td>` displaying the channel short band, number, and the `ChannelSquare` ([frontend/src/common/ChannelSquare.tsx](mdc:frontend/src/common/ChannelSquare.tsx)).
    -   **Props:** `channel` object.

-   **`NextRaceCell` (defined in `Leaderboard.tsx`):**
    -   **Responsibility:** Renders the `<td>` for the 'Next Race In' column, handling the logic for 'Done', '-', 'To Staging', 'Racing', or the number.
    -   **Props:** `racesUntilNext`, `isEliminated`.

### 3.3. Handle Callbacks

The existing callbacks (`isRecentTime`, `renderPositionChange`, `renderTimeWithDiff`) are tightly coupled to the data and rendering logic. The preferred approach is to:

-   **Incorporate logic into sub-components:** Simple display logic, like that in `renderPositionChange`, should be moved directly into the relevant cell component (e.g., `PositionCell`).
-   **Pass necessary data/functions from hooks:** If a callback relies heavily on calculated data (like `isRecentTime` needing `currentRaceIndex`), the necessary data or a simplified helper function derived from it can be returned from `useLeaderboardCalculations` and passed down as props. For instance, `isRecentTime` could be replaced by passing `currentRaceIndex` down and performing the check within `TimeDisplayCell`. The `renderTimeWithDiff` logic, using `formatTimeDifference`, should reside within the `TimeDisplayCell`.

This avoids prop-drilling complex functions while keeping components focused.

## 4. Benefits of Refactoring

-   **Improved Readability:** Smaller, focused components and hooks are easier to understand.
-   **Enhanced Maintainability:** Changes related to data fetching, calculation, or rendering are isolated.
-   **Better Testability:** Custom hooks and presentational sub-components can be tested independently.
-   **Increased Reusability:** Hooks or components might be reusable elsewhere (though less likely for this specific leaderboard).
-   **Clear Separation of Concerns:** Data fetching, business logic, state management, and rendering are distinctly separated.

## 5. Potential Steps

1.  Create `frontend/src/leaderboard/leaderboard-hooks.ts` and define `useLeaderboardState`. Update `Leaderboard.tsx` to use it.
2.  Define `useLeaderboardCalculations` in `leaderboard-hooks.ts`, moving calculations from `Leaderboard.tsx` (leveraging `leaderboard-logic.ts`). Update `Leaderboard.tsx`.
3.  Define `useLeaderboardAnimation` in `leaderboard-hooks.ts`. Update `Leaderboard.tsx`.
4.  Define the `LeaderboardTable` component within `Leaderboard.tsx` and move the table structure into it.
5.  Define the `LeaderboardRow` component within `Leaderboard.tsx` and move row rendering logic into it.
6.  Define the cell components (`PositionCell`, `TimeDisplayCell`, `ChannelDisplayCell`, `NextRaceCell`) within `Leaderboard.tsx` and integrate them into `LeaderboardRow`.
7.  Refactor callback logic as described in section 3.3, potentially moving helpers like `formatTimeDifference` to a utils file (e.g., `frontend/src/leaderboard/leaderboard-utils.ts`).
8.  Clean up the main exported `Leaderboard` component in `frontend/src/leaderboard/Leaderboard.tsx`, which should now primarily compose the hooks and the internal `LeaderboardTable` component.
9.  Review imports across all modified/new files for consistency ([imports.mdc](mdc:.cursor/rules/imports.mdc)).

## 6. Considerations

-   **Prop Drilling:** Be mindful of passing too many props down through multiple component layers. Context or state management libraries (already using Jotai) can help if this becomes an issue, but might be overkill for this level of refactoring.
-   **Memoization:** Ensure appropriate use of `React.memo` for sub-components if performance profiling indicates it's necessary, especially for `LeaderboardRow` and cell components. The custom hooks should already leverage `useMemo`.
-   **Type Safety:** Define clear TypeScript interfaces for the props of new components and the return values of hooks. 