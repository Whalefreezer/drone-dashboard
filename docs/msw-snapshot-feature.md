# MSW Live Data Snapshot Feature (JSON Output)

## Overview

This document describes a feature to capture live API responses from the actual backend and save them as a structured JSON file. This JSON file can then be loaded by MSW to represent a specific scenario based on real data. This streamlines the creation of realistic mock data sets.

**Goal:** Provide a mechanism, always available in the application, to trigger a snapshot of predefined API endpoints, save the responses to a JSON file, and allow MSW to load this JSON dynamically as a scenario.

## Activation & Trigger

*   The snapshot feature's trigger (e.g., a button) will **always** be rendered and available, regardless of development mode or URL flags. This avoids the need to bypass MSW during capture.
*   A potential location is a small, unobtrusive button in a corner or within a developer/debug section (if one exists).
*   Clicking the "Snapshot Live Data" button initiates the process.

## User Interface

*   A "Snapshot Live Data" button is always accessible.
*   Clicking the button starts the capture process, providing UI feedback (e.g., "Capturing...").
*   Upon completion, a modal dialog or UI section will:
    *   Trigger a browser download of the generated JSON data file (e.g., `snapshot-<timestamp>.json`).
    *   Display clear instructions on where to save the downloaded file (e.g., `frontend/src/mocks/scenarios/data/`) and how to make the scenario available for selection in the `ScenarioSelector` (manual update to `scenarios/index.ts` initially required).

## Implementation Details

1.  **Triggering the Snapshot:**
    *   Add the always-visible "Snapshot Live Data" button (e.g., to `frontend/src/App.tsx` or a dedicated debug component).
    *   Attach an `onClick` handler to start the `captureAndGenerateJson` function (to be created).

2.  **Identifying Target Endpoints:**
    *   Define a list of API endpoint *template paths* to capture based on `frontend/src/state/atoms.ts` usage. This list should be easily maintainable.
        *   `/api/events/:eventId/Event.json`
        *   `/api/events/:eventId/Pilots.json`
        *   `/api/events/:eventId/Rounds.json`
        *   `/api/httpfiles/Channels.json`
        *   `/api/events/:eventId/:raceId/Race.json` (Requires special handling - see below)
        *   (Potentially `/brackets/groups/0`)
    *   The capture logic **will use existing Jotai atoms** (e.g., `eventIdAtom`, `eventDataAtom` from `frontend/src/state/atoms.ts`) to get the **current** `eventId` and the list of `raceId`s needed for parameter substitution.

3.  **Fetching Live Data:**
    *   The `captureAndGenerateJson` function will:
        *   Read the current `eventId` from the `eventIdAtom`.
        *   Read the current event data (including the `Races` array) from the `eventDataAtom` to get the list of `raceId`s.
        *   For each *template path* identified in step 2:
            *   If the path requires `eventId`, substitute the value obtained from the atom.
            *   If the path is `/api/events/:eventId/:raceId/Race.json`, iterate through the `raceId`s obtained from `eventDataAtom` and fetch data for each one individually.
            *   Construct the full *live* URL for each required fetch using the actual backend origin.
            *   Perform direct `fetch` requests for each required URL.
            *   Store the raw result for each *template path*: If `response.ok`, store `{ status: response.status, data: await response.json() }`. If not ok, store `{ status: response.status, error: response.statusText }`. This includes fetching `Event.json`, `Pilots.json`, etc., again with direct `fetch` to capture their *current raw data* for the snapshot.

4.  **Generating Scenario JSON:**
    *   Create a map (JavaScript object) where keys are the *endpoint template paths* (e.g., `/api/events/:eventId/Pilots.json`, `/api/events/:eventId/:raceId/Race.json`) and values are the corresponding result objects.
    *   **Race Data Storage:** For the `/api/events/:eventId/:raceId/Race.json` template path, the value should be *another map* where keys are the specific `raceId`s and values are their respective result objects (`{status, data?, error?}`).
        ```js
        // Example capturedDataMap fragment
        {
          "/api/events/:eventId/Event.json": { "status": 200, "data": { /* event data, includes race IDs */ } },
          "/api/events/:eventId/Pilots.json": { "status": 200, "data": [ /* pilots data */ ] },
          "/api/events/:eventId/:raceId/Race.json": {
              "race1": { "status": 200, "data": { /* race 1 data */ } },
              "race2": { "status": 404, "error": "Not Found" },
              // ... other captured races
          },
          // ... other endpoints
        }
        ```
    *   Convert the main map to a JSON string: `JSON.stringify(capturedDataMap, null, 2);`

5.  **Saving (JSON Download):**
    *   Generate a default filename (e.g., `snapshot-${Date.now()}.json`).
    *   Use the "download trick" (Blob, object URL, temporary link) to trigger a browser download, using the generated filename as the default.
    *   The user can rename the file in the browser's save dialog.
    *   Display instructions in the UI:
        1.  "Snapshot JSON downloaded."
        2.  "**Action Required:** Move the downloaded file into the `frontend/src/mocks/scenarios/data/` directory."
        3.  "**Action Required:** To use this scenario, add its filename (without `.json`) to the `jsonScenarioFiles` list in `frontend/src/mocks/scenarios/index.ts` and give it a display name."

6.  **Dynamic JSON Handler Generation:**
    *   Create `frontend/src/mocks/scenarios/jsonScenarioLoader.ts`.
    *   Export `async function createHandlersFromJson(scenarioFilename: string): Promise<readonly HttpHandler[] | null>`.
    *   Inside, construct the path: `const jsonPath = \`./data/${scenarioFilename}.json\`;`.
    *   Dynamically `import(jsonPath, { assert: { type: 'json' } })` to load the `capturedDataMap`.
    *   Handle import errors.
    *   Iterate through the `capturedDataMap`.
    *   For each entry (`endpointTemplatePath` -> `resultOrMap`):
        *   If the template is **not** `/api/events/:eventId/:raceId/Race.json`:
            *   Create a standard `http.get(BASE_URL + endpointTemplatePath, ...)` handler using the `status`, `data`, or `error` from `resultOrMap`.
        *   If the template **is** `/api/events/:eventId/:raceId/Race.json`:
            *   Create a parameterized handler: `http.get(BASE_URL + endpointTemplatePath, ({ params }) => { ... })`.
            *   Inside the handler, use `params.raceId` to look up the corresponding result (`{status, data?, error?}`) from the nested map (`resultOrMap[params.raceId]`).
            *   Return `HttpResponse.json(data)`, `new HttpResponse(null, { status, statusText: error })`, or a default 404 if the specific `raceId` wasn't found in the snapshot.
    *   Return the array of generated `HttpHandler`s.

7.  **Scenario Index Update:**
    *   Modify `frontend/src/mocks/scenarios/index.ts`:
        *   Keep static scenarios (`Standard Data`, etc.).
        *   Define a map for JSON scenarios: `jsonScenarioFiles: Record<string, string> = { 'Race Day Start': 'race-day-start', 'Qualifying R2': 'qualifying-round-2' };` (Display Name -> Filename without .json).
        *   Update `getHandlersByScenarioName(name)`:
            *   If `name` is a key in static scenarios, return those handlers.
            *   If `name` is a key in `jsonScenarioFiles`, get the filename and call `await createHandlersFromJson(filename)`.
            *   Otherwise, return default.
    *   Modify `ScenarioSelector.tsx`:
        *   Combine keys from static scenarios and `jsonScenarioFiles` for the dropdown.
        *   Make `handleChange` `async` to handle `await createHandlersFromJson`.
        *   Show loading state.

8.  **Error Handling:**
    *   Report `fetch` errors during capture.
    *   Handle JSON load/parse errors gracefully in `createHandlersFromJson`.

## Potential Challenges

*   **Live API Origin/CORS/Authentication:** Still relevant for capture.
*   **Parameterised Paths:** Getting current `eventId` for capture is needed.
*   **State Consistency:** The state might change *during* the multi-request snapshot process. The snapshot represents a *moment in time*, which might have slight inconsistencies.
*   **JSON Scenario Management:** Requires manual file placement and update to `index.ts` after download.
*   **Async Handler Loading:** UI needs to handle delay.

---

This approach makes capturing easier and uses a more robust JSON format, requiring manual file management after download. 