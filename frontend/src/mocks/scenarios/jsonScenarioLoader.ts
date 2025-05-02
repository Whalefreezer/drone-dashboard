import { http, HttpResponse, type HttpHandler } from 'msw';
import { BASE_URL } from '../handlers.ts'; // Mock base URL
import { RACE_DATA_ENDPOINT_TEMPLATE } from '../snapshotConstants.ts';

interface SnapshotResult {
    status: number;
    data?: any;
    error?: string;
}

interface RaceDataSnapshot {
    [raceId: string]: SnapshotResult;
}

type CapturedDataMap = Record<string, SnapshotResult | RaceDataSnapshot>;

/**
 * Dynamically creates MSW handlers from a specified scenario JSON file.
 * @param scenarioFilename - The name of the JSON file (without extension) in ./data/
 * @returns A promise resolving to an array of MSW handlers, or null if loading fails.
 */
export async function createHandlersFromJson(scenarioFilename: string): Promise<readonly HttpHandler[] | null> {
    const jsonPath = `./data/${scenarioFilename}.json`;
    let capturedDataMap: CapturedDataMap;

    try {
        console.log(`Loading scenario JSON: ${jsonPath}`);
        // Use dynamic import to load the JSON data
        const module = await import(/* @vite-ignore */ jsonPath, { assert: { type: 'json' } });
        capturedDataMap = module.default as CapturedDataMap;
        console.log(`Successfully loaded scenario: ${scenarioFilename}`);
    } catch (error) {
        console.error(`Failed to load scenario JSON from ${jsonPath}:`, error);
        return null; // Indicate failure
    }

    const handlers: HttpHandler[] = [];

    for (const templatePath in capturedDataMap) {
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
                            console.log(`MSW: Mocking ${templatePath} (Race ID: ${raceId}) with captured data.`);
                            return HttpResponse.json(raceResult.data);
                        } else {
                            console.log(`MSW: Mocking ${templatePath} (Race ID: ${raceId}) with captured error ${raceResult.status}.`);
                            return new Response(null, { status: raceResult.status, statusText: raceResult.error });
                        }
                    } else {
                        // If specific raceId wasn't in snapshot, return 404
                        console.warn(`MSW: No snapshot data found for ${templatePath} (Race ID: ${raceId}). Returning 404.`);
                        return new Response(null, { status: 404, statusText: 'Not Found' });
                    }
                })
            );
        } else {
            // Handle standard, non-parameterized endpoints
            const standardResult = resultOrMap as SnapshotResult;
            handlers.push(
                http.get(fullMockUrl, () => {
                    if (standardResult.data !== undefined) {
                        console.log(`MSW: Mocking ${templatePath} with captured data.`);
                        return HttpResponse.json(standardResult.data);
                    } else {
                        console.log(`MSW: Mocking ${templatePath} with captured error ${standardResult.status}.`);
                        return new Response(null, { status: standardResult.status, statusText: standardResult.error });
                    }
                })
            );
        }
    }

    return handlers;
} 