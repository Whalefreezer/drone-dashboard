import './index.css'
// @deno-types="@types/react"
import { StrictMode } from 'react'
// @deno-types="@types/react-dom/client"
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import ErrorBoundary from './components/ErrorBoundary.tsx'

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

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
