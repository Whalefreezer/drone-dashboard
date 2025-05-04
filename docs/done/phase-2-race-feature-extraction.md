# Phase 2 Refactoring: Extract RaceTime Component

This document outlines the steps to complete Phase 2 of the component refactoring plan: extracting the `RaceTime` component from `frontend/src/App.tsx` into the `frontend/src/race/` directory.

## Background

This component was identified in the [Component Refactoring Plan](mdc:docs/component-refactoring-plan.md) as being defined within `App.tsx` and suitable for extraction into the `race` feature directory.

- `RaceTime`: Displays the remaining time in the current race.

## Extraction Steps

Follow these steps in order:

### 1. Extract `RaceTime`

   a. **Create File:** Create a new file: `frontend/src/race/RaceTime.tsx`

   b. **Copy Code:** Copy the `RaceTime` function definition (approximately lines 157-185 in the current `App.tsx`) into `frontend/src/race/RaceTime.tsx`.

   c. **Add Imports:** Add the necessary imports at the top (React hooks, state atoms, utility functions):
      ```typescript
      import { useEffect, useState } from 'react';
      import { useAtomValue } from 'jotai';
      import { eventDataAtom, racesAtom, useQueryAtom } from '../state/index.ts'; // Adjust path if needed
      import { findIndexOfCurrentRace, secondsFromString } from '../common/index.ts'; // Adjust path if needed
      ```

   d. **Export Component:** Add a default export at the bottom:
      ```typescript
      export default RaceTime;
      ```

### 2. Update `App.tsx`

   a. **Remove Definition:** Delete the original `RaceTime` function definition from `frontend/src/App.tsx`.

   b. **Add Import:** Add an import for the new component at the top of `App.tsx`:
      ```typescript
      import RaceTime from './race/RaceTime.tsx'; // Adjust path as needed
      ```

   c. **Verify Usage:** Ensure the `<RaceTime />` component is still rendered correctly within the `App` component's JSX where it was previously defined.

### 3. Testing (Recommended)

   a. **Create Test File:** Create a basic test file for the new component:
      - `frontend/src/race/RaceTime.test.tsx`

   b. **Add Basic Tests:** Implement simple tests to ensure the component renders and potentially handles basic state changes (e.g., renders initial time). Refer to the updated [Deno Testing Guide](mdc:docs/deno-testing-guide.md) for patterns.
      ```typescript
      // Example Structure for RaceTime.test.tsx
      import "../tests/test_setup.ts";
      import { render, screen, act } from "@testing-library/react";
      import { describe, it } from "@std/testing/bdd";
      import { assertEquals } from "@std/assert";
      import { Provider } from 'jotai'; // Need Provider for atoms
      import RaceTime from './RaceTime.tsx';
      // Mock necessary atoms here

      describe('RaceTime', () => {
        it('renders initial time correctly', () => {
          // Setup mock atoms for eventDataAtom, racesAtom
          render(
            <Provider> {/* Wrap with Jotai Provider */}
              <RaceTime />
            </Provider>
          );
          // Add assertions: Check initial time display
          // e.g., assertEquals(screen.getByText(/\d+\.\d+/) !== null, true);
        });

        // Add more tests for timer behavior if possible/needed
      });
      ```
      *Note: Testing components relying heavily on Jotai atoms and timers can be complex. Start with basic rendering tests.*

## Completion

Once these steps are completed and verified, Phase 2 is done. The `RaceTime` component will be located within its relevant feature directory. 