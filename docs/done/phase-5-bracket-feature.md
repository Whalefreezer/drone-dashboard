# Refactoring Phase 5: Bracket Feature

This phase involves extracting components related to the race bracket system into a dedicated feature directory.

**Guiding Principle: Move Only, Minimal Changes**
The primary goal is to *move* the existing `BracketsView` and `EliminatedPilotsView` implementations from `App.tsx` to their new locations. Avoid refactoring or changing the logic itself during this phase. Reference the original code in `App.tsx` for all implementation details, including component structure, state usage (Jotai atoms), types, utility functions, and applied styles. Look up any necessary imports or details directly from the existing code.

## Objectives

- Create the `frontend/src/bracket/` directory structure.
- Extract the `BracketsView` and `EliminatedPilotsView` components from `App.tsx`.
- Define necessary types, state, and potentially hooks for the bracket features.

## Steps

1.  **Create Directory Structure:**
    Create the following directory and core files:
    ```
    frontend/src/
    └── bracket/
        ├── BracketsView.tsx
        ├── EliminatedPilotsView.tsx
        ├── bracket-hooks.ts       # Placeholder for future hooks
        ├── bracket-state.ts       # Placeholder for future state
        ├── bracket-types.ts       # Placeholder for types
        └── index.ts             # For exporting components/hooks
    ```

2.  **Extract `BracketsView` Component:**
    - Locate the `BracketsView` function component within `frontend/src/App.tsx`.
    - Cut the component code from `App.tsx`.
    - Paste the code into `frontend/src/bracket/BracketsView.tsx`.
    - Add necessary imports (e.g., React, Jotai atoms, types, other components like `ChannelSquare`) to `BracketsView.tsx`.
    - Define the component's props interface (if any) in `bracket-types.ts` and import it.
    - Export the `BracketsView` component from `BracketsView.tsx`.
    - Add an export statement for `BracketsView` in `frontend/src/bracket/index.ts`.

3.  **Extract `EliminatedPilotsView` Component:**
    - Locate the `EliminatedPilotsView` function component within `frontend/src/App.tsx`.
    - Cut the component code from `App.tsx`.
    - Paste the code into `frontend/src/bracket/EliminatedPilotsView.tsx`.
    - Add necessary imports (e.g., React, Jotai atoms, types) to `EliminatedPilotsView.tsx`.
    - Define the component's props interface (if any) in `bracket-types.ts` and import it.
    - Export the `EliminatedPilotsView` component from `EliminatedPilotsView.tsx`.
    - Add an export statement for `EliminatedPilotsView` in `frontend/src/bracket/index.ts`.

4.  **Update `App.tsx`:**
    - Remove the original `BracketsView` and `EliminatedPilotsView` code from `App.tsx`.
    - Import the `BracketsView` and `EliminatedPilotsView` components from `frontend/src/bracket`.
    - Ensure the components are used correctly in `App.tsx`.

5.  **Define Types:**
    - Identify any types specific to the bracket system, rounds, or eliminated pilots.
    - Define these types in `frontend/src/bracket/bracket-types.ts`.

6.  **Placeholder Files:**
    - The files `bracket-hooks.ts` and `bracket-state.ts` are created as placeholders. Logic related to managing bracket data, rounds, and tracking eliminated pilots will be moved here in Phase 6 (Feature Hooks).

7.  **Testing:**
    - Create basic snapshot tests for `BracketsView.tsx` and `EliminatedPilotsView.tsx`.
    - Manually verify the application still renders the bracket and eliminated pilots information correctly after the extraction.

## Related Documentation

- [Component Refactoring Plan](mdc:docs/component-refactoring-plan.md) 