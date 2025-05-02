# MSW Scenario Selection Feature

## Overview

This document describes a feature to allow developers to easily switch between different sets of mock API responses (scenarios) when running the frontend application in a mocked development mode. This enhances the ability to test various application states, edge cases, and UI behaviors without relying on a specific backend state.

**Goal:** Provide a simple UI control, accessible only when mocks are enabled, to select predefined MSW handler scenarios (e.g., "Standard Data", "Empty State", "Error Responses").

## Activation

The scenario selection feature will only be active when the application is loaded with the `?dev=1` URL query parameter.

Example: `http://localhost:5173/?dev=1`

When active, a confirmation message "MSW enabled via ?dev=1 flag" will appear in the browser's developer console, and the Scenario Selector UI will be visible.

## User Interface

A simple UI component (the "Scenario Selector") will be displayed on the page when MSW is active (`?dev=1`).

*   **Placement:** Suggestion: A small, fixed-position dropdown or button panel in one corner of the screen (e.g., bottom-right).
*   **Visibility:** Only rendered when the `?dev=1` flag is present.
*   **Functionality:**
    *   Displays the currently active scenario.
    *   Provides a list of available predefined scenarios.
    *   Allows the user to select a different scenario.
    *   Selecting a scenario will update the MSW handlers and potentially trigger a page reload or data refresh to reflect the new mocked state.

## Implementation Details

1.  **Scenario Definition:**
    *   Create a new directory: `frontend/src/mocks/scenarios/`.
    *   Define each scenario in its own file within this directory (e.g., `standardData.ts`, `emptyState.ts`, `errorState.ts`).
    *   Each scenario file should export an array of MSW handlers, similar to the current `frontend/src/mocks/handlers.ts`.
        ```typescript
        // Example: frontend/src/mocks/scenarios/errorState.ts
        import { http, HttpResponse } from 'msw';
        import { BASE_URL, MOCK_EVENT_ID } from '../handlers.ts'; // Re-use constants

        export const errorHandlers = [
          http.get(`${BASE_URL}/api/events/:eventId/Event.json`, () => {
            return new HttpResponse(null, { status: 500, statusText: 'Internal Server Error' });
          }),
          // ... other error handlers
        ];
        ```
    *   Create an index file `frontend/src/mocks/scenarios/index.ts` to export all scenarios and define a default.
        ```typescript
        // Example: frontend/src/mocks/scenarios/index.ts
        import { handlers as standardHandlers } from '../handlers.ts'; // Use original as default
        import { errorHandlers } from './errorState.ts';
        import { emptyHandlers } from './emptyState.ts';

        export const scenarios = {
          'Standard Data': standardHandlers,
          'Error State': errorHandlers,
          'Empty State': emptyHandlers,
        };

        export const DEFAULT_SCENARIO_NAME = 'Standard Data';
        ```

2.  **State Management & Persistence:**
    *   Use `localStorage` to store the name of the currently selected scenario (e.g., key: `mswScenario`).
    *   The Scenario Selector UI component will manage its own state for the dropdown/selection list.
    *   On initial load (`enableMocking` in `main.tsx`), read the scenario name from `localStorage` or use the `DEFAULT_SCENARIO_NAME`.
    *   Dynamically import the handlers corresponding to the selected scenario name.

3.  **MSW Worker Update:**
    *   The `frontend/src/mocks/browser.ts` file will still initialize the worker using `setupWorker()`, but potentially without initial handlers or with default ones.
    *   When a scenario is selected in the UI:
        1.  Update the state in the Scenario Selector component.
        2.  Save the new scenario name to `localStorage`.
        3.  Dynamically import the handlers for the *new* scenario.
        4.  Call `worker.resetHandlers(...newScenarioHandlers)` to apply the new mock handlers to the active service worker. Reference: [MSW resetHandlers](https://mswjs.io/docs/api/setup-worker/reset-handlers)
        5.  **Crucially:** Trigger a page reload (`window.location.reload()`) or implement a more sophisticated data re-fetching mechanism within the app to ensure the UI updates with data from the new scenario. A full reload is often simpler initially.

4.  **Conditional Rendering:**
    *   Modify `frontend/src/main.tsx` (or `App.tsx`) to conditionally render the Scenario Selector component only when `urlParams.get('dev') === '1'`.

## Usage Example

1.  Navigate to `http://localhost:5173/?dev=1`.
2.  Observe the "MSW enabled..." message in the console and the Scenario Selector UI appearing on the page.
3.  The selector shows "Standard Data" (the default).
4.  Select "Error State" from the Scenario Selector.
5.  The page reloads (or data is re-fetched).
6.  The application now behaves as if the API returned errors, based on the handlers in `errorState.ts`.
7.  Select "Standard Data" again to return to the default mock behavior.

---

This feature provides a powerful way to simulate different backend responses directly in the browser, streamlining frontend development and testing. 