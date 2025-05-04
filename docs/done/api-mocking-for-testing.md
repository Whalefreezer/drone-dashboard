# API Mocking for Testing with MSW

This document outlines the plan and steps required to implement API mocking using Mock Service Worker (`msw`) for testing components and hooks, particularly those using async Jotai atoms like `atomWithQuery`.

## Goal

To reliably test components that fetch data without making actual network requests during tests. This involves intercepting HTTP requests made by libraries like `axios` (used within `useQueryAtom`) and returning predefined mock responses.

## Chosen Tool: Mock Service Worker (msw)

`msw` is chosen because:
- It intercepts requests at the network level, making tests more realistic.
- It's agnostic to the underlying HTTP client (`fetch`, `axios`, etc.).
- It provides utilities for both Node.js test environments (`setupServer`) and browser environments (`setupWorker`).
- It allows defining default handlers and overriding them per test case for different scenarios (success, error, empty data).

## Implementation Plan

### 1. Installation

   - Add `msw` as a development dependency to the project using `deno add`.
   - **Action:** Run the following command in the `frontend/` directory:
     ```bash
     deno add msw --dev
     ```
   - This command will automatically update your `deno.json` (or `deno.jsonc`) file and download the dependency.

### 2. Define Mock Handlers

   - Create a central place for defining the mock API request handlers.
   - **Action:** Create `frontend/src/mocks/handlers.ts`.
   - **Action:** Define initial handlers for the core API endpoints currently used by `useQueryAtom` (likely related to fetching races, events, pilots, etc.). Use `http.get` or `http.post` from `msw` and `HttpResponse.json` to return realistic mock data structures matching the expected API responses.
     ```typescript
     // Example frontend/src/mocks/handlers.ts
     import { http, HttpResponse } from 'msw';
     import type { Race, RaceEvent /*, other types... */ } from '../types/index.ts';

     // Define realistic mock data
     const mockApiRaces: Race[] = [/* ... mock race objects ... */];
     const mockApiEvent: RaceEvent[] = [/* ... mock event object ... */];

     export const handlers = [
       // Mock GET /api/races (adjust path if needed)
       http.get('/api/races', () => {
         return HttpResponse.json(mockApiRaces);
       }),

       // Mock GET /api/event (adjust path if needed)
       http.get('/api/event', () => {
         return HttpResponse.json(mockApiEvent);
       }),

       // TODO: Add handlers for other endpoints (pilots, channels, rounds, etc.)
     ];
     ```
   - **Note:** Ensure the base URL used in `axios` calls (e.g., `/api`) is matched correctly in the handlers. If `axios` is configured with a `baseURL`, the handlers might need to include it (e.g., `http.get('http://localhost:8000/api/races', ...)` if `baseURL` is `http://localhost:8000`). This needs investigation.

### 3. Setup Mock Server for Tests (Node.js)

   - Create a configuration file to set up the `msw` server for the Node.js test environment (Deno test runs in Node context).
   - **Action:** Create `frontend/src/mocks/server.ts`.
   - **Action:** Import handlers and use `setupServer` from `msw/node`.
     ```typescript
     // frontend/src/mocks/server.ts
     import { setupServer } from 'msw/node';
     import { handlers } from './handlers.ts';

     // This configures a request mocking server with the given request handlers.
     export const server = setupServer(...handlers);
     ```

### 4. Integrate with Test Setup

   - Modify the existing test setup file to manage the mock server's lifecycle.
   - **Action:** Edit `frontend/src/tests/test_setup.ts`.
   - **Action:** Import the `server` instance from `frontend/src/mocks/server.ts`.
   - **Action:** Add `beforeAll`, `afterEach`, and `afterAll` hooks (using `@std/testing/bdd` imports already present) to start the server, reset handlers between tests, and close the server.
     ```typescript
     // frontend/src/tests/test_setup.ts
     import { cleanup } from "@testing-library/react";
     import { beforeAll, afterEach, afterAll } from "@std/testing/bdd";
     import { JSDOM } from "jsdom";
     import { server } from '../mocks/server.ts'; // Import the server

     // --- MSW Server Lifecycle --- 
     beforeAll(() => server.listen({ onUnhandledRequest: 'error' })); // Start server, error on unhandled requests
     afterEach(() => server.resetHandlers()); // Reset handlers between tests
     afterAll(() => server.close()); // Close server after all tests
     // --- End MSW Server Lifecycle ---

     // --- JSDOM Setup (Existing) --- 
     beforeAll(() => {
       // ... existing JSDOM setup ...
     });

     afterEach(() => {
       cleanup();
     });

     afterAll(() => {
       // @ts-ignore:
       globalThis.window?.close();
     });
     // --- End JSDOM Setup ---
     ```
   - **Note:** The `onUnhandledRequest: 'error'` option is recommended to catch tests making unexpected API calls.

### 5. Refactor Tests

   - Update tests for components using `useQueryAtom` (like `RaceTime.test.tsx`) to leverage the mock server.
   - **Action:** Modify `frontend/src/race/RaceTime.test.tsx`.
   - **Action:** Remove the simplified "renders without crashing" test.
   - **Action:** Add tests that assert on the expected output *after* the mocked API data is loaded. Use `async/await` with `findBy*` queries.
     ```typescript
     // Example frontend/src/race/RaceTime.test.tsx
     import "../tests/test_setup.ts";
     import { render, screen } from "@testing-library/react";
     import { describe, it } from "@std/testing/bdd";
     import { assertEquals } from "@std/assert";
     import { Provider } from 'jotai';
     import RaceTime from './RaceTime.tsx';
     import { server } from '../mocks/server.ts'; // May not be needed directly if setup runs
     import { http, HttpResponse } from 'msw'; // Needed for test-specific overrides

     describe('RaceTime', () => {
       it('renders initial time correctly based on mocked API data', async () => {
         // Handlers in setup should provide mock data for eventDataAtom
         render(
           <Provider>
             <RaceTime />
           </Provider>
         );
         // findBy* waits for the async operation (mocked fetch) to complete
         const timeElement = await screen.findByText('180.0'); // Assumes mock RaceLength is '03:00'
         assertEquals(timeElement !== null, true, "Initial time should be displayed from mock");
       });

       it('handles API error state', async () => {
         // Override the default handler for this specific test
         server.use(
           http.get('/api/event', () => { // Match the exact path used by the atom
             return new HttpResponse(null, { status: 500, statusText: 'Server Error' })
           })
         );

         render(
           <Provider>
             <RaceTime />
           </Provider>
         );

         // Assert how the component handles the error
         // e.g., find an error message, or check if it renders null/fallback
         // const errorElement = await screen.findByText(/error/i);
         // assertEquals(errorElement !== null, true);
       });

       // TODO: Add tests for timer countdown behavior (requires Date/timer mocking)
     });
     ```
   - **Action:** Apply similar refactoring to other tests involving data-fetching components/hooks as needed.

### 6. Verify Axios Base URL (If Applicable)

   - Determine if `axios` calls made within `useQueryAtom` or other fetching logic use a relative path (like `/api/...`) or an absolute URL.
   - **Action:** Inspect the implementation of `useQueryAtom` or related fetching functions in `frontend/src/state/atoms.ts`.
   - **Action:** If a `baseURL` is configured in `axios` or full URLs are used, update the `msw` handlers in `frontend/src/mocks/handlers.ts` to match the exact URLs being requested (e.g., `http.get('http://localhost:8000/api/races', ...)`).

## Next Steps After This Document

1.  Review and approve this plan.
2.  Implement the actions outlined above step-by-step.
3.  Run tests frequently (`deno task test` in `frontend/`) to verify each step. 