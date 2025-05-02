# Refactoring Phase 3: Pilot Feature

This phase focuses on extracting components and logic related to pilot information into a dedicated feature directory.

## Objectives

- Create the `frontend/src/pilot/` directory structure.
- Extract the `PilotChannelView` component from `App.tsx`.
- Define necessary types, state, and potentially hooks for pilot-related features.

## Steps

1.  **Create Directory Structure:**
    Create the following directory and core files:
    ```
    frontend/src/
    └── pilot/
        ├── PilotChannelView.tsx
        ├── pilot-hooks.ts      # Placeholder for future hooks
        ├── pilot-state.ts      # Placeholder for future state
        ├── pilot-types.ts      # Placeholder for types
        └── index.ts            # For exporting components/hooks
    ```

2.  **Extract `PilotChannelView` Component:**
    - Locate the `PilotChannelView` function component within `frontend/src/App.tsx`.
    - Cut the component code from `App.tsx`.
    - Paste the code into `frontend/src/pilot/PilotChannelView.tsx`.
    - Add necessary imports (e.g., React, Jotai atoms, types) to `PilotChannelView.tsx`.
    - Define the component's props interface (e.g., `PilotChannelViewProps`) in `pilot-types.ts` and import it.
    - Export the `PilotChannelView` component from `PilotChannelView.tsx`.
    - Add an export statement for `PilotChannelView` in `frontend/src/pilot/index.ts`.

3.  **Update `App.tsx`:**
    - Remove the original `PilotChannelView` code from `App.tsx`.
    - Import the `PilotChannelView` component from `frontend/src/pilot`.
    - Ensure the component is used correctly in `App.tsx` with the necessary props.

4.  **Define Types:**
    - Identify any types specific to `PilotChannelView` or pilot data.
    - Define these types in `frontend/src/pilot/pilot-types.ts`.

5.  **Placeholder Files:**
    - The files `pilot-hooks.ts` and `pilot-state.ts` are created as placeholders. Logic related to fetching pilot data, calculating positions, or managing pilot-specific state will be moved here in Phase 6 (Feature Hooks).

6.  **Testing:**
    - Create basic snapshot tests for `PilotChannelView`.
    - Manually verify the application still renders the pilot channel information correctly after the extraction.

## Related Documentation

- [Component Refactoring Plan](mdc:docs/component-refactoring-plan.md) 