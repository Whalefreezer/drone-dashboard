# Refactoring Phase 4: Leaderboard Feature

This phase focuses on extracting the `Leaderboard` component and related logic into its own feature directory.

## Objectives

- Create the `frontend/src/leaderboard/` directory structure.
- Extract the `Leaderboard` component from `App.tsx`.
- Define necessary types, state, and potentially hooks for the leaderboard.

## Steps

1.  **Create Directory Structure:**
    Create the following directory and core files:
    ```
    frontend/src/
    └── leaderboard/
        ├── Leaderboard.tsx
        ├── leaderboard-hooks.ts   # Placeholder for future hooks
        ├── leaderboard-state.ts   # Placeholder for future state
        ├── leaderboard-types.ts   # Placeholder for types
        └── index.ts             # For exporting components/hooks
    ```

2.  **Extract `Leaderboard` Component:**
    - Locate the `Leaderboard` function component within `frontend/src/App.tsx`.
    - Cut the component code from `App.tsx`.
    - Paste the code into `frontend/src/leaderboard/Leaderboard.tsx`.
    - Add necessary imports (e.g., React, Jotai atoms, types, utility functions) to `Leaderboard.tsx`.
    - Define the component's props interface (if any, though it might be self-contained initially) in `leaderboard-types.ts` and import it.
    - Export the `Leaderboard` component from `Leaderboard.tsx`.
    - Add an export statement for `Leaderboard` in `frontend/src/leaderboard/index.ts`.

3.  **Update `App.tsx`:**
    - Remove the original `Leaderboard` code from `App.tsx`.
    - Import the `Leaderboard` component from `frontend/src/leaderboard`.
    - Ensure the component is used correctly in `App.tsx`.

4.  **Define Types:**
    - Identify any types specific to the `Leaderboard` or its data.
    - Define these types in `frontend/src/leaderboard/leaderboard-types.ts`.

5.  **Placeholder Files:**
    - The files `leaderboard-hooks.ts` and `leaderboard-state.ts` are created as placeholders. Logic related to calculating leaderboard data, sorting, and handling position changes will be moved here in Phase 6 (Feature Hooks).

6.  **Testing:**
    - Create basic snapshot tests for `Leaderboard.tsx`.
    - Manually verify the application still renders the leaderboard correctly after the extraction.

## Related Documentation

- [Component Refactoring Plan](mdc:docs/component-refactoring-plan.md) 