import './index.css'
// @deno-types="@types/react"
import { StrictMode } from 'react'
// @deno-types="@types/react-dom/client"
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import ErrorBoundary, { REFRESH_TIMEOUT } from './components/ErrorBoundary.tsx'

// Global error handlers
window.addEventListener('error', (event) => {
  console.error('Global error caught:', event.error);
  setTimeout(() => {
    window.location.reload();
  }, REFRESH_TIMEOUT);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
  setTimeout(() => {
    window.location.reload();
  }, REFRESH_TIMEOUT);
});

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
