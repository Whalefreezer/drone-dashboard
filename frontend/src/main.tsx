import './index.css';
import { StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import ErrorBoundary from './common/ErrorBoundary.tsx';
import { enableMocking } from './devTools/initialize.tsx';
import { GenericSuspense } from './common/GenericSuspense.tsx';
import { RouterProvider, createRouter } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';

// Create router from generated route tree
const router = createRouter({ routeTree, context: {} });

// Type augmentation for strong typing across the app
declare module '@tanstack/react-router' {
    interface Register { router: typeof router }
}

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
                <GenericSuspense id='router'>
                    <RouterProvider router={router} />
                </GenericSuspense>
            </ErrorBoundary>
        </StrictMode>,
    );
});
