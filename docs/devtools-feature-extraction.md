# DevTools Feature Extraction and Consolidation Plan

## Overview

This document outlines the plan to consolidate all development tooling, mocking infrastructure (MSW), scenario management, and data snapshotting capabilities into a single dedicated `devTools` feature folder. This feature-driven approach groups all related functionalities, including UI components and core logic, into one location, deviating from a strict UI/core separation.

This replaces the previous plan which involved splitting constants and keeping the core mocking separate.

## Current Structure Analysis

### Components and Files Involved:

1.  **`ScenarioSelector.tsx`**: Located in `frontend/src/common/`. UI for switching MSW scenarios.
2.  **`SnapshotControl.tsx`**: Located in `frontend/src/common/`. UI for triggering live data snapshots.
3.  **`frontend/src/mocks/` directory**: Contains the core MSW setup, scenario definitions, snapshot constants, initialization logic, and utilities.
    *   `browser.ts`: MSW worker setup.
    *   `initialize.tsx`: Logic to enable mocking and render dev tools UI based on URL params.
    *   `scenarios/`: Subdirectory with scenario definitions (index, loader, data files).
    *   `snapshotConstants.ts`: Constants used by snapshotting, mocking, and tests.
    *   `workerUtils.ts`: MSW utility functions.
4.  **`App.tsx` / `main.tsx`**: Import and use components/functions from `common/` and `mocks/`.
5.  **Test Files**: Various test files import constants or setup utilities from `mocks/`.

### Issues with Current Structure:

1.  **Scattered Feature**: Development tooling (UI in `common/`, core logic in `mocks/`) is spread across different locations instead of being grouped by feature.
2.  **`common/` Misuse**: `ScenarioSelector` and `SnapshotControl` are not general-purpose UI components suitable for `common/`.

## Refactoring Strategy: Consolidation into `devTools`

### 1. New Folder Structure (Target State)

```
frontend/
├── src/
│   ├── devTools/                # New consolidated feature folder
│   │   ├── ScenarioSelector.tsx # Moved from common/
│   │   ├── SnapshotControl.tsx  # Moved from common/
│   │   ├── browser.ts           # Moved from mocks/
│   │   ├── initialize.tsx       # Moved from mocks/
│   │   ├── snapshotConstants.ts # Moved from mocks/
│   │   ├── workerUtils.ts       # Moved from mocks/
│   │   ├── scenarios/           # Moved from mocks/
│   │   │   ├── index.ts
│   │   │   └── jsonScenarioLoader.ts # Moved from mocks/scenarios/
│   │   └── index.ts             # Optional: Exports UI components
│   │
│   ├── mocks/                   # DIRECTORY REMOVED
│   │
│   ├── common/                  # ScenarioSelector and SnapshotControl REMOVED
│   │   └── ...
│   │
│   ├── state/                   # Global state remains
│   │   └── ...
│   │
│   └── App.tsx                  # May import DevTools UI components
│   └── main.tsx                 # Will import initialize function from devTools/
│   └── ...
│
├── public/
│   └── scenarios/               # JSON files stay here, referenced by devTools/jsonScenarioLoader.ts
│       └── *.json
```

### 2. Component/File Migration Process

**Execution Strategy:**

*   **Use `mv` Command**: Prefer using the `mv` terminal command (or equivalent file explorer move operations) to physically relocate files and directories. This ensures exact copies without accidental modifications.
*   **No In-flight Refactoring**: Do *not* modify the internal code of files *during* the move process. Focus solely on relocating the files first.
*   **Read Source (If Not Using `mv`)**: If for some reason `mv` cannot be used for a specific file, ensure you read the *entire* source file content before recreating it in the new location to avoid transcription errors or omissions.
*   **Update Imports After Moving**: All necessary import path updates across the entire codebase should be performed *after* all files and directories have been moved to their new locations in `frontend/src/devTools/`.

**Steps:**

1.  **Create Directory**: Create `frontend/src/devTools/`.
2.  **Move UI Components**: Move `frontend/src/common/ScenarioSelector.tsx` and `frontend/src/common/SnapshotControl.tsx` to `frontend/src/devTools/`.
3.  **Move Mocking Core**: Move the *entire contents* of `frontend/src/mocks/` (including the `scenarios/` subdirectory) into `frontend/src/devTools/`.
4.  **Delete Old Directory**: Remove the now empty `frontend/src/mocks/` directory.
5.  **Update Internal Imports**: Adjust all relative import paths *within* the moved files (`ScenarioSelector.tsx`, `SnapshotControl.tsx`, `browser.ts`, `initialize.tsx`, `jsonScenarioLoader.ts`, `snapshotConstants.ts`, `workerUtils.ts`, `scenarios/index.ts`, etc.) to correctly reference each other within the `devTools/` directory.
6.  **Update External Imports**: Search the entire `frontend/src/` directory (excluding `devTools/`) for any imports that previously referenced `common/ScenarioSelector.tsx`, `common/SnapshotControl.tsx`, or anything under `mocks/`. Update these paths to point to the new location within `devTools/`. Pay close attention to:
    *   `frontend/src/main.tsx` (importing the initialization function).
    *   `frontend/src/App.tsx` (importing UI components, if applicable).
    *   All test files (`*.test.tsx`, `tests/test_setup.ts`, etc.) importing constants or utilities.
7.  **Exports (Optional)**: If needed for cleaner imports in `App.tsx` or elsewhere, create `frontend/src/devTools/index.ts` to export `ScenarioSelector` and `SnapshotControl`.
8.  **Cleanup**: Remove the original `ScenarioSelector.tsx` and `SnapshotControl.tsx` from `frontend/src/common/`.

### 3. Hooks, State, and Types

*   No placeholder files (`devtools-hooks.ts`, `devtools-state.ts`) will be created initially.
*   A `devtools-types.ts` file can be created *if* types are extracted from components or constants during the move, otherwise it will be omitted.
*   Global state atoms (`eventIdAtom`, `eventDataAtom`) remain in `state/`.

## Testing Strategy

1.  **Update Test Imports**: Modify all test files to use the new import paths pointing into `devTools/`.
2.  **Run Tests**: Execute `deno task test` in `frontend/`. Address any failures caused by incorrect paths or moved logic.
3.  **Update Snapshots**: Run `deno task test -u` to update any Jest snapshots affected by path changes within component outputs.
4.  **Manual Verification**: Thoroughly test the dev tooling:
    *   Load with `?dev=1`: Verify console message, scenario selector appears and works (select different scenarios, verify reload and mock changes).
    *   Load with `?dev=1`: Verify snapshot button appears and works (downloads JSON).
    *   Load without `?dev=1`: Verify dev tools UI (selector, button) are *not* visible.

## Documentation Strategy

*   This document (`devtools-feature-extraction.md`) now serves as the primary plan.
*   Review other documentation (`README.md`, `CONTRIBUTING.md`, other `.md` files in `docs/`) for references to the old `mocks/` directory or components in `common/` and update them.

## Conclusion

Consolidating all mocking, scenario, snapshot, and dev UI functionality into a single `devTools` feature directory aligns with a feature-based code organization strategy. This improves discoverability and maintainability for developers working on these specific tools, although it means the `devTools` directory encompasses both UI and core logic related to this feature. 