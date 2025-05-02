import './index.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import ErrorBoundary from './common/ErrorBoundary.tsx';

// --- MSW Setup ---
async function enableMocking() {
    // Start the worker only in development or if a specific flag is set
    if (import.meta.env.MODE === 'development' /* || import.meta.env.VITE_USE_MOCKS === 'true' */) {
        const { worker } = await import('./mocks/browser.ts');
        console.log('MSW enabled');
        // Start the Service Worker. `onUnhandledRequest` prevents warnings for requests not handled by mocks.
        return worker.start({ onUnhandledRequest: 'bypass' });
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
