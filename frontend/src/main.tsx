import './index.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import ErrorBoundary from './common/ErrorBoundary.tsx';
import { worker } from './mocks/browser.ts';
import { DEFAULT_SCENARIO_NAME, getHandlersByScenarioName, type ScenarioName } from './mocks/scenarios/index.ts';

// --- MSW Setup ---
async function enableMocking() {
    // Check for the ?dev=1 flag in the URL
    const urlParams = new URLSearchParams(globalThis.location.search);
    const useMocks = urlParams.get('dev') === '1'; // Ensure strict check for '1'

    if (useMocks) {
        // Read selected scenario from localStorage or use default
        const selectedScenario = localStorage.getItem('mswScenario') as ScenarioName | null;
        const handlers = getHandlersByScenarioName(selectedScenario);
        const actualScenarioName = selectedScenario || DEFAULT_SCENARIO_NAME;

        console.log(`MSW enabled via ?dev=1 flag. Using scenario: "${actualScenarioName}"`);

        // Start the Service Worker with the selected scenario's handlers
        return worker.start({
            onUnhandledRequest: 'bypass',
            // Pass initial handlers (optional, resetHandlers will be called later if needed)
            // handlers: handlers, // Note: worker needs handlers at setup time or via resetHandlers
        }).then(() => {
            // Ensure worker uses the correct initial handlers if start doesn't take them directly
            // (Check MSW version/behavior - often start is just registration)
             worker.resetHandlers(...handlers); // Ensure the correct handlers are active initially
        });
    }
    return Promise.resolve();
}
// --- End MSW Setup ---

// Global error handlers
globalThis.addEventListener('error', (event) => {
    console.error('Global error caught:', event.error);
    setTimeout(() => {
        globalThis.location.reload();
    }, 3000);
});

globalThis.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
    setTimeout(() => {
        globalThis.location.reload();
    }, 3000);
});

// Render the app after MSW is potentially enabled
enableMocking().then(() => {
    createRoot(document.getElementById('root') as HTMLElement).render(
        <StrictMode>
            <ErrorBoundary>
                <App />
            </ErrorBoundary>
        </StrictMode>,
    );
});
