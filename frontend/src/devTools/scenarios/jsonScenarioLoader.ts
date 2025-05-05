/// <reference lib="deno.ns" />
import { http, type HttpHandler, HttpResponse } from 'msw';
import { BASE_URL, RACE_DATA_ENDPOINT_TEMPLATE } from '../snapshotConstants.ts';

interface SnapshotResult {
    status: number;
    data?: any;
    error?: string;
}

interface RaceDataSnapshot {
    [raceId: string]: SnapshotResult;
}

interface ScenarioContext {
    eventId: string;
}

type CapturedDataMapValue = SnapshotResult | RaceDataSnapshot | ScenarioContext;

type CapturedDataMap = Record<string, CapturedDataMapValue>;

/**
 * Dynamically creates MSW handlers from a specified scenario JSON file.
 * Handles loading the JSON file in both Browser and Node (Deno test) environments.
 * @param scenarioFilename - The name of the JSON file (without extension) in ./data/
 * @returns A promise resolving to an array of MSW handlers, or null if loading fails.
 */
export async function createHandlersFromJson(
    scenarioFilename: string,
): Promise<readonly HttpHandler[] | null> {
    let capturedDataMap: CapturedDataMap;
    let scenarioContext: ScenarioContext | null = null;

    try {
        // --- Environment-Specific JSON Loading ---
        // Use Deno check for test environment, otherwise assume browser
        if (typeof Deno === 'undefined') {
            // Browser environment: Use fetch with relative path
            const jsonPath = `/scenarios/${scenarioFilename}.json`;
            console.log(`MSW Browser: Loading scenario JSON from: ${jsonPath}`);
            const response = await fetch(jsonPath);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            capturedDataMap = await response.json();
        } else {
            // Node/Deno environment: Use Deno.readTextFile
            // Assumes tests run from the 'frontend' directory
            const filePath = `./public/scenarios/${scenarioFilename}.json`;
            const fileContent = await Deno.readTextFile(filePath);
            capturedDataMap = JSON.parse(fileContent);
        }
        // --- End Environment-Specific JSON Loading ---

        // Extract context using type assertion after check
        const contextValue = capturedDataMap['__scenarioContext'];
        if (contextValue && typeof (contextValue as ScenarioContext).eventId === 'string') {
            scenarioContext = contextValue as ScenarioContext;
        } else {
            console.warn(
                `Scenario JSON ${scenarioFilename}.json is missing valid __scenarioContext.eventId`,
            );
        }
    } catch (error) {
        // Use scenarioFilename in the error message as path depends on environment
        console.error(`Failed to load or parse scenario JSON for ${scenarioFilename}:`, error);
        return null;
    }

    const handlers: HttpHandler[] = [];

    // Add handler for /api first, using the context
    if (scenarioContext) {
        handlers.push(
            http.get(`${BASE_URL}/api`, () => {
                const htmlResponse =
                    `<html><body><script>var eventManager = new EventManager("events/${scenarioContext?.eventId}")</script></body></html>`;
                return new Response(htmlResponse, { headers: { 'Content-Type': 'text/html' } });
            }),
        );
    } else {
        console.warn(`MSW: No eventId found in scenario context for /api handler.`);
        // Fallback handler also uses full URL
        handlers.push(
            http.get(`${BASE_URL}/api`, () => {
                return new Response(
                    '<html><body>Error: Mock scenario context missing eventId</body></html>',
                    { status: 500, headers: { 'Content-Type': 'text/html' } },
                );
            }),
        );
    }

    // Process the rest of the captured endpoints
    for (const templatePath in capturedDataMap) {
        if (templatePath === '__scenarioContext') continue;

        const resultOrMap = capturedDataMap[templatePath];
        const fullMockUrl = `${BASE_URL}${templatePath}`;

        if (templatePath === RACE_DATA_ENDPOINT_TEMPLATE) {
            // Handle parameterized race data
            handlers.push(
                http.get(fullMockUrl, ({ params }) => {
                    const raceId = params.raceId as string;
                    const raceDataSnapshot = resultOrMap as RaceDataSnapshot;
                    const raceResult = raceDataSnapshot[raceId];

                    if (raceResult) {
                        if (raceResult.data !== undefined) {
                            return HttpResponse.json(raceResult.data);
                        } else {
                            console.log(
                                `MSW: Moking ${templatePath} (Race ID: ${raceId}) with captured error ${raceResult.status}.`,
                            );
                            return new Response(null, {
                                status: raceResult.status,
                                statusText: raceResult.error,
                            });
                        }
                    } else {
                        // If specific raceId wasn't in snapshot, return 404
                        console.warn(
                            `MSW: No snapshot data found for ${templatePath} (Race ID: ${raceId}). Returning 404.`,
                        );
                        return new Response(null, { status: 404, statusText: 'Not Found' });
                    }
                }),
            );
        } else {
            // Handle standard, non-parameterized endpoints
            const standardResult = resultOrMap as SnapshotResult;
            handlers.push(
                http.get(fullMockUrl, () => { // Use full URL for matching
                    if (standardResult.data !== undefined) {
                        return HttpResponse.json(standardResult.data);
                    } else {
                        return new Response(null, {
                            status: standardResult.status,
                            statusText: standardResult.error,
                        });
                    }
                }),
            );
        }
    }

    return handlers;
}
