import type { HttpHandler } from 'msw';
import { createHandlersFromJson } from './jsonScenarioLoader.ts'; // Import the JSON loader

// Static scenarios defined directly
// These are now migrated to JSON format
// export const staticScenarios: Record<string, readonly HttpHandler[]> = {
//   'Standard Data': standardDataHandlers,
//   'Empty State': emptyStateHandlers,
//   'Error State': errorStateHandlers,
// };

// JSON-based scenarios (Display Name -> Filename without .json)
// User needs to add entries here after downloading a snapshot
export const jsonScenarioFiles: Record<string, string> = {
	// Static scenarios migrated to JSON:
	'Standard Data': 'standard-data',
	'Empty State': 'empty-state',
	'Error State': 'error-state',
	'Test 1': 'test-1',
};

// Combine static and JSON scenario names for the selector
export const scenarioNames: string[] = [
	// ...Object.keys(staticScenarios),
	...Object.keys(jsonScenarioFiles),
];

export const DEFAULT_SCENARIO_NAME: string = 'Standard Data'; // Keep default

/**
 * Gets MSW handlers based on a scenario name.
 * Loads handlers from JSON if the name matches a JSON scenario file.
 * @param name - The display name of the scenario.
 * @returns A promise resolving to the handlers array, or the default handlers if not found/failed.
 */
export async function getHandlersByScenarioName(
	name: string | null,
): Promise<readonly HttpHandler[]> {
	const scenarioName = name && scenarioNames.includes(name) ? name : DEFAULT_SCENARIO_NAME;

	// Remove check for staticScenarios as they are now in jsonScenarioFiles
	// if (staticScenarios[scenarioName]) {
	//     return staticScenarios[scenarioName];
	// }

	if (jsonScenarioFiles[scenarioName]) {
		const filename = jsonScenarioFiles[scenarioName];
		const jsonHandlers = await createHandlersFromJson(filename);
		if (jsonHandlers) {
			return jsonHandlers;
		} else {
			console.warn(
				`Failed to load JSON scenario "${scenarioName}" from ${filename}.json. Falling back to default.`,
			);
			// Fallback to default if JSON loading fails
			// Need to load the default handlers if the requested one fails
			const defaultFilename = jsonScenarioFiles[DEFAULT_SCENARIO_NAME];
			const defaultHandlers = await createHandlersFromJson(defaultFilename);
			if (defaultHandlers) {
				return defaultHandlers;
			}
			// If even the default fails, return empty (or handle error appropriately)
			console.error(
				`CRITICAL: Failed to load default JSON scenario "${DEFAULT_SCENARIO_NAME}" from ${defaultFilename}.json.`,
			);
			return [];
		}
	}

	// Default fallback (should ideally not be reached if name is validated)
	console.warn(
		`Scenario name "${scenarioName}" not found in jsonScenarioFiles. Falling back to default.`,
	);
	const defaultFilenameFallback = jsonScenarioFiles[DEFAULT_SCENARIO_NAME];
	const defaultHandlersFallback = await createHandlersFromJson(defaultFilenameFallback);
	if (defaultHandlersFallback) {
		return defaultHandlersFallback;
	}
	console.error(
		`CRITICAL: Failed to load default JSON scenario (fallback) "${DEFAULT_SCENARIO_NAME}" from ${defaultFilenameFallback}.json.`,
	);
	return [];
}
