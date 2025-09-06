import { setupWorker } from 'msw/browser';
// import { getHandlersByScenarioName, DEFAULT_SCENARIO_NAME } from './scenarios/index.ts'; // Logic moved
import { loadDefaultHandlers } from './workerUtils.ts';

// Initialize the worker without handlers initially
export const worker = setupWorker();

// Async function to load default handlers and start the worker
export async function startWorker() {
	const defaultHandlers = await loadDefaultHandlers();

	// Apply the handlers before starting
	if (defaultHandlers.length > 0) {
		worker.use(...defaultHandlers);
		console.log(`MSW Browser: Applied ${defaultHandlers.length} default handlers.`);
	} else {
		console.warn('MSW Browser: No default handlers were loaded.');
	}

	// Start the worker
	return worker.start({
		onUnhandledRequest: 'bypass', // Or 'warn', 'error'
	});
}
