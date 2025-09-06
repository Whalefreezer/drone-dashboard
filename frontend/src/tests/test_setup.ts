import '../tests/global-jsdom.ts';

import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from '@std/testing/bdd';
// No longer importing JSDOM manually
// import { JSDOM } from "jsdom";
import { applyServerHandlers, initializeServerHandlers, server } from '../devTools/server.ts'; // MSW server
import axios from 'axios'; // Import axios
import { BASE_URL } from '../devTools/snapshotConstants.ts';

// Define a base URL for tests

// --- MSW Server Lifecycle ---
// Establish API mocking before all tests.
beforeAll(async () => {
	// Set base URL for axios requests made during tests
	axios.defaults.baseURL = BASE_URL;

	// 1. Load the default handlers asynchronously
	await initializeServerHandlers();
	// 2. Apply the loaded handlers to the server instance
	applyServerHandlers();
	// 3. Start the server to listen for requests
	server.listen({ onUnhandledRequest: 'error' });
});

// Reset any request handlers that were added during the tests,
// so they don't affect other tests.
afterEach(() => server.resetHandlers());

// Clean up after the tests are finished.
afterAll(() => server.close());
// --- End MSW Server Lifecycle ---

// --- Testing Library Cleanup (Keep this) ---
afterEach(() => {
	cleanup(); // Cleans up Testing Library rendered components
});
// --- End Testing Library Cleanup ---

// --- JSDOM Setup Removed ---
// let dom: JSDOM | undefined;
// beforeAll(() => {
//   // Simulate a DOM environment using JSDOM
//   dom = new JSDOM("<!doctype html><html><body></body></html>", {
//     url: "http://localhost/", // Set a base URL for relative paths if needed
//   });
//   // Assign JSDOM globals to Deno's globalThis
//   globalThis.document = dom.window.document;
//   globalThis.window = dom.window as unknown as Window & typeof globalThis;
//   globalThis.navigator = dom.window.navigator;
//   globalThis.Event = dom.window.Event;
//   globalThis.CustomEvent = dom.window.CustomEvent;
//   globalThis.HTMLElement = dom.window.HTMLElement;
//   // Add any other necessary DOM globals
// });
// afterAll(() => {
//   // Clean up JSDOM window
//   dom?.window.close();
// });
// --- End JSDOM Setup ---
