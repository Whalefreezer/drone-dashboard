# Component Refactoring Plan

## Current Structure Analysis

### Overview

The current codebase has a monolithic structure with most of the UI components directly embedded in `App.tsx`. The application uses Jotai for state management, with atoms defined in `state.ts`. There's limited component separation, with only two components extracted into the components directory:

- `ErrorBoundary.tsx`
- `DaySchedule.tsx`

### Issues with Current Structure

1. **Monolithic App Component**: `App.tsx` is 829 lines long and contains multiple components that should be separated.
2. **Limited Component Separation**: Most UI elements are defined within `App.tsx` rather than as separate components.
3. **No Clear Folder Structure**: There's minimal organization of code into domain or function-specific directories.
4. **Business Logic Mixed with UI**: Data fetching and transformation logic is mixed with UI rendering.
5. **No Custom Hooks**: Reusable logic is not extracted into custom hooks.
6. **No Clear Typing Patterns**: Types are defined in a single file without domain-specific organization.

### Components Identified for Extraction

The following components are defined within `App.tsx` or already extracted and should be organized according to the proposed structure:

1. **Already Extracted / Located:**
   - `ErrorBoundary.tsx` (in `frontend/src/common/`) - Already exists
   - `DaySchedule.tsx` (in `frontend/src/race/`) - Already exists
   - `TimeDisplay.tsx` (in `frontend/src/common/`) - Already exists
   - `Spinner.tsx` (in `frontend/src/common/`) - Already exists
   - `ChannelSquare.tsx` (in `frontend/src/common/`) - Already exists
   - `LapsView.tsx` (in `frontend/src/race/`) - Already exists

2. **Defined within `App.tsx` (Needs Extraction):**
   - `PilotChannelView` (Line 130) -> Move to `frontend/src/pilot/PilotChannelView.tsx`
   - `RaceTime` (Line 157) -> Moved to `frontend/src/race/RaceTime.tsx` (Done)
   - `Leaderboard` (Line 191) -> Move to `frontend/src/leaderboard/Leaderboard.tsx`
   - `LegendItem` (Line 455) -> Moved to `frontend/src/common/LegendItem.tsx` (Done)
   - `Legend` (Line 479) -> Moved to `frontend/src/common/Legend.tsx` (Done)
   - `BracketsView` (Line 501) -> Move to `frontend/src/bracket/BracketsView.tsx`
   - `EliminatedPilotsView` (Line 570) -> Move to `frontend/src/bracket/EliminatedPilotsView.tsx`

*Note 1: Components `LapsTable`, `LapsTableHeader`, `LapsTableRow` are defined within `LapsView.tsx` but will **not** be extracted for now as `LapsView.tsx` is self-contained and not overly complex.*


### Business Logic for Custom Hooks

The following business logic can be extracted into custom hooks:

1. **Race Data**:
   - `useRaceData`: For fetching and processing race data
   - `useCurrentRace`: For getting the current race
   - `useLastRace`: For getting the last race
   - `useNextRaces`: For getting upcoming races

2. **Pilot Data**:
   - `usePilotData`: For fetching and processing pilot data
   - `usePilotChannel`: For getting a pilot's channel
   - `usePilotPositions`: For calculating pilot positions

3. **Time and Updates**:
   - `useCurrentTime`: For managing the current time display
   - `useRaceTime`: For calculating race time
   - `usePeriodicUpdate`: Already exists but could be enhanced

4. **Leaderboard**:
   - `useLeaderboard`: For calculating and sorting leaderboard data
   - `usePositionChanges`: For tracking position changes

5. **Brackets**:
   - `useBrackets`: For managing bracket data
   - `useEliminatedPilots`: For tracking eliminated pilots

6. **Ensure consistent error handling across features**

## Refactoring Strategy

### 1. New Folder Structure (Target State)

```
frontend/
├── src/
│   ├── race/                     # Existing race components + RaceTime
│   │   ├── LapsView.tsx          # Contains LapsTable, Header, Row internally
│   │   ├── DaySchedule.tsx
│   │   ├── RaceTime.tsx          # Extracted from App.tsx
│   │   ├── race-hooks.ts
│   │   ├── race-state.ts
│   │   ├── race-utils.ts
│   │   ├── race-types.ts
│   │   └── index.ts
│   │
│   ├── pilot/                    # Pilot-specific components
│   │   ├── PilotChannelView.tsx  # Extracted from App.tsx
│   │   ├── pilot-hooks.ts
│   │   ├── pilot-state.ts
│   │   ├── pilot-types.ts
│   │   └── index.ts
│   │
│   ├── leaderboard/              # Leaderboard components
│   │   ├── Leaderboard.tsx       # Extracted from App.tsx
│   │   ├── leaderboard-hooks.ts
│   │   ├── leaderboard-state.ts
│   │   ├── leaderboard-types.ts
│   │   └── index.ts
│   │
│   ├── bracket/                  # Bracket components
│   │   ├── BracketsView.tsx        # Extracted from App.tsx
│   │   ├── EliminatedPilotsView.tsx # Extracted from App.tsx
│   │   ├── bracket-hooks.ts
│   │   ├── bracket-state.ts
│   │   ├── bracket-types.ts
│   │   └── index.ts
│   │
│   ├── common/                   # Truly shared components and utilities
│   │   ├── ErrorBoundary.tsx     # Existing
│   │   ├── TimeDisplay.tsx       # Existing
│   │   ├── Spinner.tsx           # Existing
│   │   ├── ChannelSquare.tsx     # Existing
│   │   ├── Legend.tsx            # Extracted from App.tsx
│   │   ├── LegendItem.tsx        # Extracted from App.tsx
│   │   └── index.ts
│   │
│   ├── state/                    # Global state
│   │   ├── atoms.ts
│   │   └── selectors.ts
│   │
│   ├── types/                    # Shared types (if needed)
│   │   └── types.ts
│   │
│   ├── App.tsx                 # Should become simpler composition layer
│   └── main.tsx
```

### 2. Component Creation Process

For each feature:

1. Create the feature directory with its core files:
   ```
   feature/
   ├── ComponentName.tsx     # Main component file
   ├── feature-hooks.ts     # Feature-specific hooks
   ├── feature-state.ts     # Feature-specific state
   ├── feature-types.ts     # Feature-specific types
   ├── feature-utils.ts     # Feature-specific utilities (if needed)
   └── index.ts            # Clean exports
   ```

2. Extract components from `App.tsx` to their feature directories
3. Ensure proper props are defined with TypeScript interfaces in the feature's types file
4. Connect to state using Jotai hooks in the feature's state file
5. Create tests alongside the components they test

### 3. Custom Hooks Creation Process

For each feature:

1. Identify related functionality in the codebase
2. Extract the logic into the feature's hooks file (e.g., `race-hooks.ts`)
3. Ensure proper TypeScript typing in the feature's types file
4. Create tests for the hooks

### 4. Migration Strategy

To ensure the application remains functional during refactoring:

1. Start with one feature at a time
2. Begin with the most independent feature (least dependencies on other features)
3. Test after each feature migration
4. Update imports in `App.tsx` to use the new feature organization
5. Gradually extract business logic to feature-specific hooks
6. Refactor `App.tsx` to be a simple composition of features

### 5. State Management Improvements

1. Move feature-specific Jotai atoms into their respective feature directories
2. Keep truly global state in the root state directory
3. Create derived atoms within feature directories
4. Use loadable for better async state handling
5. Ensure consistent error handling across features

## Component Extraction Plan

### Phase 1: Common Components (Partially Done)

1. Ensure shared components are in `common/`:
   - `TimeDisplay` (Done)
   - `ErrorBoundary` (Done)
   - `Spinner` (Done)
   - `ChannelSquare` (Done)
   - Extract `Legend`, `LegendItem` from `App.tsx` to `common/`. (Done)

### Phase 2: Race Feature (Partially Done)

1. `LapsView.tsx` and `DaySchedule.tsx` are already in `race/`.
2. Internal components (`LapsTable`, `LapsTableHeader`, `LapsTableRow`) will remain within `LapsView.tsx` for now.
3. Extract `RaceTime` from `App.tsx` to `frontend/src/race/RaceTime.tsx`. (Done)

### Phase 3: Pilot Feature (Done)

1. Create `pilot/` directory with core files. (Done)
2. Migrate components defined within `App.tsx`:
   - `PilotChannelView` -> `frontend/src/pilot/PilotChannelView.tsx` (Done)

### Phase 4: Leaderboard Feature (Done)

1. Create `leaderboard/` directory with core files. (Done)
2. Migrate components defined within `App.tsx`:
   - `Leaderboard` -> `frontend/src/leaderboard/Leaderboard.tsx` (Done)

### Phase 5: Bracket Feature (Done)

1. Create `bracket/` directory with core files. (Done)
2. Migrate components defined within `App.tsx`:
   - `BracketsView` -> `frontend/src/bracket/BracketsView.tsx` (Done)
   - `EliminatedPilotsView` -> `frontend/src/bracket/EliminatedPilotsView.tsx` (Done)

### Phase 6: Feature Hooks (To Do)

Extract business logic implemented with hooks from components into dedicated feature hook files.

1.  **`race-hooks.ts`**: Race data and timing (Missing)
    *   Extract race data fetching/access (`useAtomValue(racesAtom)`) from `App.tsx` and `LapsView.tsx`.
    *   Extract current/last/next race index logic (`findIndexOfCurrentRace`, `findIndexOfLastRace`) from `App.tsx`.
    *   Extract logic for getting race subset from `App.tsx`.
    *   Extract race-specific periodic update logic (`usePeriodicUpdate` usage) from `App.tsx` and `LapsView.tsx`.
    *   Extract race-specific atom family usage (`useAtom(raceFamilyAtom(raceId))`) from `LapsView.tsx`.
    *   Extract round data lookup from `LapsView.tsx`.
    *   Extract max laps calculation from `LapsView.tsx`.
    *   Extract lap time calculations (fastest, overall fastest) from `LapsTableRow` within `LapsView.tsx`.
    *   Consider consolidating time-related logic from `RaceTime.tsx` and `TimeDisplay.tsx` here or in a common time hook.

2.  **`pilot-hooks.ts`**: Pilot data and channels (Placeholder exists)
    *   Extract pilot data access (`useAtomValue(pilotsAtom)`) from `LapsView.tsx` (and potentially other components).
    *   Extract channel data access (`useAtomValue(channelsDataAtom)`) from `LapsView.tsx` (specifically `LapsTableRow`).
    *   Extract overall best times access (`useAtomValue(overallBestTimesAtom)`) from `LapsTableRow`.
    *   Extract pilot/channel lookup logic from `LapsTableRow`.
    *   Logic for `PilotChannelView` seems minimal and mostly prop-based, but review if any state/effects are added later.

3.  **`leaderboard-hooks.ts`**: Leaderboard calculations (Missing - logic currently in `leaderboard-logic.ts` invoked by hooks in `Leaderboard.tsx`)
    *   Create hooks (`useLeaderboardData`, `usePositionChanges`) that encapsulate the `useMemo` calls currently in `Leaderboard.tsx` which trigger `calculateLeaderboardData` and `getPositionChanges` from `leaderboard-logic.ts`.
    *   Move the state atom access (`racesAtom`, `pilotsAtom`, etc.) used for leaderboard calculation into these hooks.
    *   Move the `isRecentTime` callback logic from `Leaderboard.tsx`.
    *   Move the animation effect (`useEffect`) logic from `Leaderboard.tsx` into a relevant hook if appropriate.

4.  **`bracket-hooks.ts`**: Bracket management (Missing - placeholder creation mentioned in docs but file not found)
    *   Extract bracket data access (`useQueryAtom(bracketsDataAtom)`) from `BracketsView.tsx`, `EliminatedPilotsView.tsx`, and `Leaderboard.tsx`.
    *   Extract the logic for finding the `matchingBracket` based on current race pilots from `BracketsView.tsx`.
    *   Extract the calculation of `eliminatedPilots` (using `findEliminatedPilots`) from `EliminatedPilotsView.tsx` and `Leaderboard.tsx` into a dedicated hook (e.g., `useEliminatedPilots`).
    *   Extract bracket pilot lookup logic from `LapsTableRow` in `LapsView.tsx`.

### Phase 7: Final App Refactoring

1. Refactor `App.tsx` to use the new feature-based organization
2. Ensure all business logic is moved to feature-specific hooks
3. Make App.tsx a simple composition of features

## Testing Strategy

1. Create snapshot tests for all UI components
2. Test custom hooks with React Testing Library's renderHook
3. Ensure all components handle loading, error, and success states
4. Test edge cases (no data, partial data)
5. Create integration tests for main features

## Documentation Strategy

1. Create JSDoc comments for all components and hooks
2. Document prop types with TypeScript interfaces
3. Create a component hierarchy diagram
4. Document state flow between components
5. Create usage examples for reusable components

## Conclusion

This refactoring plan addresses the key issues in the current codebase by:

1. Breaking down the monolithic `App.tsx`.
2. Implementing a clear folder structure
3. Separating business logic from UI components
4. Creating reusable custom hooks
5. Organizing related code into domain-specific directories

The result will be a more maintainable, testable, and scalable codebase that follows React best practices. 