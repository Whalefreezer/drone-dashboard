# Refactoring Phase 4: Leaderboard Feature

This phase focuses on extracting the `Leaderboard` component and all related logic/types into its own feature directory.

**Guiding Principle: Move Only, Minimal Changes**
- The primary goal is to *move* the existing `Leaderboard` implementation and its associated logic/types/styles from `App.tsx`, `state/atoms.ts`, `race/race-utils.ts`, and `App.css` to their new location within the `frontend/src/leaderboard/` directory.
- Avoid refactoring or changing the logic itself during this phase.
- Reference the original code in the source files for all implementation details, including component structure, state usage (Jotai atoms), types (`LeaderboardEntry`), utility functions (`calculateLeaderboardData`, `getPositionChanges`, `sortLeaderboard`), sorting configuration (`defaultLeaderboardSortConfig`), and applied styles (from `App.css`).
- Look up any necessary imports or details directly from the existing code.
- Ensure associated tests (e.g., from `race/race-utils.test.ts`) are also moved and updated.

## Objectives

- Create the `frontend/src/leaderboard/` directory structure.
- Extract the `Leaderboard` component from `frontend/src/App.tsx`.
- Move the `LeaderboardEntry` type, `calculateLeaderboardData`, and `getPositionChanges` function from `frontend/src/state/atoms.ts`.
- Move the `sortLeaderboard` function, related types/enums (like `SortGroup`, `SortCriteria`), and `defaultLeaderboardSortConfig` from `frontend/src/race/race-utils.ts`.
- Move relevant tests for the sorting logic from `frontend/src/race/race-utils.test.ts`.
- Move relevant CSS rules from `frontend/src/App.css` into a dedicated file within the `leaderboard` directory (e.g., `Leaderboard.css`).
- Define necessary types, state, and potentially hooks *within* the leaderboard directory.

## Steps

1.  **Create Directory Structure:**
    Create the following directory and core files:
    ```
    frontend/src/
    └── leaderboard/
        ├── Leaderboard.tsx
        ├── Leaderboard.css       # For moved styles
        ├── leaderboard-logic.ts    # For calculation/sorting functions
        ├── leaderboard-state.ts    # Placeholder for future state atoms (if needed)
        ├── leaderboard-types.ts    # For LeaderboardEntry and sorting types
        ├── leaderboard.test.ts     # For moved/new tests
        └── index.ts              # For exporting components/hooks/types
    ```

2.  **Move Styles:**
    - Identify CSS rules in `frontend/src/App.css` that specifically target the leaderboard (e.g., `.leaderboard-container`, `.leaderboard-table`, `.position-change`, `.recent-time`, etc.).
    - Cut these rules from `App.css`.
    - Paste them into `frontend/src/leaderboard/Leaderboard.css`.
    - Ensure any necessary CSS variables or global styles they depend on are still accessible or redefined if necessary.

3.  **Extract `Leaderboard` Component:**
    - Locate the `Leaderboard` function component within `frontend/src/App.tsx`.
    - Cut the component code from `App.tsx`.
    - Paste the code into `frontend/src/leaderboard/Leaderboard.tsx`.
    - Add necessary imports (React, Jotai atoms, types, utility functions) to `Leaderboard.tsx`, updating paths as needed.
    - **Import Styles:** Import the moved styles by adding `import './Leaderboard.css';` at the top of `Leaderboard.tsx`.
    - Ensure the component retains its styling now sourced from the local CSS file.
    - Export the `Leaderboard` component from `Leaderboard.tsx`.
    - Add an export statement for `Leaderboard` in `frontend/src/leaderboard/index.ts`.

4.  **Move Types (`LeaderboardEntry`, Sort Types):**
    - Locate the `LeaderboardEntry` interface in `frontend/src/state/atoms.ts`. Cut and paste it into `frontend/src/leaderboard/leaderboard-types.ts`.
    - Locate `SortDirection`, `NullHandling`, `SortCriteria`, `SortGroup` in `frontend/src/race/race-utils.ts`. Cut and paste them into `frontend/src/leaderboard/leaderboard-types.ts`.
    - Update all import paths for these types in `Leaderboard.tsx`, `leaderboard-logic.ts`, and potentially other files if they were used elsewhere (though they seem specific).
    - Export these types from `leaderboard-types.ts` and `index.ts`.

5.  **Move Logic (`calculateLeaderboardData`, `getPositionChanges`, `sortLeaderboard`, `defaultLeaderboardSortConfig`):**
    - Locate `calculateLeaderboardData` and `getPositionChanges` in `frontend/src/state/atoms.ts`. Cut and paste them into `frontend/src/leaderboard/leaderboard-logic.ts`.
    - Locate `sortLeaderboard` (and its helper `getGroupHierarchy`) and `defaultLeaderboardSortConfig` in `frontend/src/race/race-utils.ts`. Cut and paste them into `frontend/src/leaderboard/leaderboard-logic.ts`.
    - Update necessary imports within these functions (e.g., importing types from `./leaderboard-types.ts`, utils from `../common/utils.ts`).
    - Update the usage of these functions within `Leaderboard.tsx` to import them from `./leaderboard-logic.ts`.
    - Export necessary functions from `leaderboard-logic.ts` and potentially `index.ts`.

6.  **Update Source Files (`App.tsx`, `atoms.ts`, `race-utils.ts`, `App.css`):**
    - Remove the original `Leaderboard` component code from `App.tsx`.
    - Import the `Leaderboard` component from `frontend/src/leaderboard` in `App.tsx`.
    - Remove the moved types and functions (`LeaderboardEntry`, `calculateLeaderboardData`, `getPositionChanges`) from `frontend/src/state/atoms.ts`.
    - Remove the moved types and functions (`SortDirection`, `NullHandling`, `SortCriteria`, `SortGroup`, `sortLeaderboard`, `getGroupHierarchy`, `defaultLeaderboardSortConfig`) from `frontend/src/race/race-utils.ts`.
    - Remove the moved CSS rules from `frontend/src/App.css` (handled in Step 2).
    - Ensure `App.tsx` and potentially other files still compile and function correctly after the removals and import updates.

7.  **Move Tests:**
    - Locate tests related to `sortLeaderboard` in `frontend/src/race/race-utils.test.ts`.
    - Cut these tests and paste them into `frontend/src/leaderboard/leaderboard.test.ts`.
    - Update imports within the tests (e.g., `sortLeaderboard` from `./leaderboard-logic.ts`, types from `./leaderboard-types.ts`).
    - Run tests to ensure they pass after moving.

8.  **Placeholder Files:**
    - The file `leaderboard-state.ts` remains a placeholder for any leaderboard-specific state atoms that might be extracted later.

9.  **Final Verification:**
    - Create basic snapshot tests for the moved `Leaderboard.tsx` in `leaderboard.test.ts`.
    - Manually verify the application still renders the leaderboard correctly, including sorting and position changes, after the extraction.

## Related Documentation

- [Component Refactoring Plan](mdc:docs/component-refactoring-plan.md) 