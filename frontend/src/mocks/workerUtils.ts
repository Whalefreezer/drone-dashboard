import type { HttpHandler } from 'msw';
import { getHandlersByScenarioName, DEFAULT_SCENARIO_NAME } from './scenarios/index.ts';

/**
 * Asynchronously loads the default MSW handlers based on the default scenario name.
 * @returns A promise resolving to the array of default handlers, or an empty array if loading fails.
 */
export async function loadDefaultHandlers(): Promise<readonly HttpHandler[]> {
    console.log('MSW Utils: Loading default scenario handlers...');
    try {
        const defaultHandlers = await getHandlersByScenarioName(DEFAULT_SCENARIO_NAME);
        if (!defaultHandlers) {
            console.error(`MSW Utils: getHandlersByScenarioName returned null/undefined for default scenario: ${DEFAULT_SCENARIO_NAME}`);
            return [];
        }
        console.log(`MSW Utils: Successfully loaded ${defaultHandlers.length} default handlers for scenario: ${DEFAULT_SCENARIO_NAME}`);
        return defaultHandlers;
    } catch (error) {
        console.error(`MSW Utils: Error loading default handlers for scenario ${DEFAULT_SCENARIO_NAME}:`, error);
        return []; // Return empty array on error
    }
} 