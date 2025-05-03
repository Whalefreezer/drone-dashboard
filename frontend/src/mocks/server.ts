import { setupServer } from 'msw/node';
// import { getHandlersByScenarioName, DEFAULT_SCENARIO_NAME } from './scenarios/index.ts'; // Logic moved
import { loadDefaultHandlers } from './workerUtils.ts';
import type { HttpHandler } from 'msw';
// import axios from 'axios'; // Base URL setting removed, axios likely not needed here directly

let serverHandlers: readonly HttpHandler[] = [];

// Async function to initialize server handlers (call this before tests run)
export async function initializeServerHandlers() {
    serverHandlers = await loadDefaultHandlers();
    // Logging is now handled within loadDefaultHandlers
}

// This configures a request mocking server.
// Handlers are added dynamically after async loading.
export const server = setupServer();

// Function to apply handlers (call this in test setup, e.g., beforeAll)
export const applyServerHandlers = () => {
    if (serverHandlers.length === 0) {
        console.warn('MSW Node: No handlers loaded. Call initializeServerHandlers() first.');
    }
    server.use(...serverHandlers);
};

// Removing default base URL setting for axios
// axios.defaults.baseURL = BASE_URL;

