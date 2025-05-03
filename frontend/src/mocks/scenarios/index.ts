import { standardDataHandlers } from './standardData.ts';
import { emptyStateHandlers } from './emptyState.ts';
import { errorStateHandlers } from './errorState.ts';
import type { HttpHandler } from 'msw';
import { createHandlersFromJson } from './jsonScenarioLoader.ts'; // Import the JSON loader

// Static scenarios defined directly
export const staticScenarios: Record<string, readonly HttpHandler[]> = {
  'Standard Data': standardDataHandlers,
  'Empty State': emptyStateHandlers,
  'Error State': errorStateHandlers,
};

// JSON-based scenarios (Display Name -> Filename without .json)
// User needs to add entries here after downloading a snapshot
export const jsonScenarioFiles: Record<string, string> = {
    // Example: 'Race Day Start': 'race-day-start',
    // Example: 'Qualifying Round 2': 'qualifying-round-2',
    'Test 1': 'test-1',
    'Test 2': 'test-2'
};

// Combine static and JSON scenario names for the selector
export const scenarioNames: string[] = [
    ...Object.keys(staticScenarios),
    ...Object.keys(jsonScenarioFiles),
];

export const DEFAULT_SCENARIO_NAME: string = 'Standard Data';

/**
 * Gets MSW handlers based on a scenario name.
 * Loads handlers from JSON if the name matches a JSON scenario file.
 * @param name - The display name of the scenario.
 * @returns A promise resolving to the handlers array, or the default handlers if not found/failed.
 */
export async function getHandlersByScenarioName(name: string | null): Promise<readonly HttpHandler[]> {
    const scenarioName = name && scenarioNames.includes(name) ? name : DEFAULT_SCENARIO_NAME;

    if (staticScenarios[scenarioName]) {
        return staticScenarios[scenarioName];
    }

    if (jsonScenarioFiles[scenarioName]) {
        const filename = jsonScenarioFiles[scenarioName];
        const jsonHandlers = await createHandlersFromJson(filename);
        if (jsonHandlers) {
            return jsonHandlers;
        } else {
            console.warn(`Failed to load JSON scenario "${scenarioName}" from ${filename}.json. Falling back to default.`);
            // Fallback to default if JSON loading fails
            return staticScenarios[DEFAULT_SCENARIO_NAME]; 
        }
    }

    // Default fallback (should ideally not be reached if name is validated)
    return staticScenarios[DEFAULT_SCENARIO_NAME];
} 