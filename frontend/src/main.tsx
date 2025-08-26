import './index.css';
import { StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import ErrorBoundary from './common/ErrorBoundary.tsx';
import { enableMocking } from './devTools/initialize.tsx';

// Global error handlers
globalThis.addEventListener('error', (event) => {
    console.error('Global error caught:', event.error);
    // setTimeout(() => {
    //     globalThis.location.reload();
    // }, 3000);
});

globalThis.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
    // setTimeout(() => {
    //     globalThis.location.reload();
    // }, 3000);
});

// Enable mocking (if applicable) then render the main app
enableMocking().then(() => {
    createRoot(document.getElementById('root') as HTMLElement).render(
        <StrictMode>
            <ErrorBoundary>
                <Suspense fallback={<div>Loading...</div>}>
                    <App />
                </Suspense>
            </ErrorBoundary>
        </StrictMode>,
    );
});
