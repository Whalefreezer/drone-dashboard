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

From `App.tsx`, the following components can be extracted:

1. **Layout Components**:
   - `AppLayout`: Main layout with header and content areas
   - `TimeDisplay`: Current time display in the header
   - `MainContent`: Container for races and leaderboard

2. **Race Components**:
   - `LapsView`: Currently defined as a function component within `App.tsx`
   - `LapsTable`: Currently defined within `LapsView`
   - `LapsTableHeader`: Currently defined as a separate function
   - `LapsTableRow`: Currently defined as a separate function
   - `RaceContainer`: Container for all race-related components
   - `CurrentRace`: Container specific to the current race
   - `LastRace`: Container specific to the last race
   - `NextRaces`: Container for upcoming races

3. **Pilot Components**:
   - `PilotChannelView`: Currently defined as a separate function
   - `ChannelSquare`: Currently defined as a separate function

4. **Leaderboard Components**:
   - `Leaderboard`: Currently defined as a separate function
   - `LeaderboardHeader`: Currently defined within `Leaderboard`
   - `LeaderboardRow`: Currently defined within `Leaderboard`

5. **Bracket Components**:
   - `BracketsView`: Currently defined as a separate function
   - `EliminatedPilotsView`: Currently defined as a separate function

6. **Utility Components**:
   - `RaceTime`: Currently defined as a separate function
   - `Legend`: Currently defined as a separate function
   - `LegendItem`: Currently defined as a separate function

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

## Refactoring Strategy

### 1. New Folder Structure

```
frontend/
├── src/
│   ├── race/                     # Everything race-related
│   │   ├── CurrentRace.tsx      
│   │   ├── LastRace.tsx
│   │   ├── NextRaces.tsx
│   │   ├── LapsView.tsx
│   │   ├── race-hooks.ts        # Race-specific hooks
│   │   ├── race-state.ts        # Race-specific state
│   │   ├── race-utils.ts        # Race-specific utilities
│   │   ├── race-types.ts        # Race-specific types
│   │   └── index.ts             # Public API for race feature
│   │
│   ├── pilot/                   
│   │   ├── ChannelView.tsx
│   │   ├── Channel.tsx
│   │   ├── pilot-hooks.ts
│   │   ├── pilot-state.ts
│   │   ├── pilot-types.ts
│   │   └── index.ts
│   │
│   ├── leaderboard/            
│   │   ├── Leaderboard.tsx
│   │   ├── Row.tsx
│   │   ├── leaderboard-hooks.ts
│   │   ├── leaderboard-state.ts
│   │   ├── leaderboard-types.ts
│   │   └── index.ts
│   │
│   ├── bracket/                
│   │   ├── Bracket.tsx
│   │   ├── EliminatedPilots.tsx
│   │   ├── bracket-hooks.ts
│   │   ├── bracket-state.ts
│   │   ├── bracket-types.ts
│   │   └── index.ts
│   │
│   ├── common/                  # Truly shared components and utilities
│   │   ├── ErrorBoundary.tsx
│   │   ├── TimeDisplay.tsx
│   │   └── Spinner.tsx
│   │
│   ├── state/                   # Global state
│   │   ├── atoms.ts           
│   │   └── selectors.ts        
│   │
│   ├── types/                   # Shared types (if needed)
│   │   └── types.ts
│   │
│   ├── App.tsx
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

### Phase 1: Common Components

1. Extract shared components to `common/`:
   - `TimeDisplay`
   - `ErrorBoundary`
   - `Spinner`

### Phase 2: Race Feature

1. Create `race/` directory with core files
2. Migrate race-related components:
   - `CurrentRace`
   - `LastRace`
   - `NextRaces`
   - `LapsView`

### Phase 3: Pilot Feature

1. Create `pilot/` directory with core files
2. Migrate pilot-related components:
   - `ChannelView`
   - `Channel`

### Phase 4: Leaderboard Feature

1. Create `leaderboard/` directory with core files
2. Migrate leaderboard components:
   - `Leaderboard`
   - `Row`

### Phase 5: Bracket Feature

1. Create `bracket/` directory with core files
2. Migrate bracket components:
   - `Bracket`
   - `EliminatedPilots`

### Phase 6: Feature Hooks

For each feature, create its hooks file with related functionality:
1. `race-hooks.ts`: Race data and timing
2. `pilot-hooks.ts`: Pilot data and channels
3. `leaderboard-hooks.ts`: Leaderboard calculations
4. `bracket-hooks.ts`: Bracket management

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

1. Breaking down the monolithic App.tsx
2. Implementing a clear folder structure
3. Separating business logic from UI components
4. Creating reusable custom hooks
5. Organizing related code into domain-specific directories

The result will be a more maintainable, testable, and scalable codebase that follows React best practices. 