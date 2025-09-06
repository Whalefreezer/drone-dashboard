import type { HttpHandler } from 'msw';
import { DEFAULT_SCENARIO_NAME, getHandlersByScenarioName } from './scenarios/index.ts';

/**
 * Asynchronously loads the default MSW handlers based on the default scenario name.
 * @returns A promise resolving to the array of default handlers, or an empty array if loading fails.
 */
export async function loadDefaultHandlers(): Promise<readonly HttpHandler[]> {
	try {
		const defaultHandlers = await getHandlersByScenarioName(DEFAULT_SCENARIO_NAME);
		if (!defaultHandlers) {
			console.error(
				`MSW Utils: getHandlersByScenarioName returned null/undefined for default scenario: ${DEFAULT_SCENARIO_NAME}`,
			);
			return [];
		}
		return defaultHandlers;
	} catch (error) {
		return []; // Return empty array on error
	}
}
