import './index.css';
import { StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import ErrorBoundary from './common/ErrorBoundary.tsx';
import { enableMocking } from './devTools/initialize.tsx';
import { GenericSuspense } from './common/GenericSuspense.tsx';
import { RouterProvider } from '@tanstack/react-router';
import { ResponsiveProvider } from './responsive/index.ts';
import { router } from './router.ts';

type BootstrapLogger = (message: string, extra?: Record<string, unknown>) => void;
type DebugWindow = Window & { __APP_BOOTSTRAP_LOG?: BootstrapLogger };

declare global {
	interface Window {
		__APP_BOOTSTRAP_LOG?: BootstrapLogger;
	}
}

const bootLog: BootstrapLogger = (message, extra) => {
	const augmentedMessage = `[bootstrap] ${message}`;
	if (extra) {
		console.log(augmentedMessage, extra);
	} else {
		console.log(augmentedMessage);
	}
	if (typeof document !== 'undefined') {
		try {
			const marker = document.createElement('div');
			marker.dataset.bootstrapLog = '1';
			marker.textContent = `${new Date().toISOString()} - ${message}${extra ? ` ${JSON.stringify(extra)}` : ''}`;
			marker.style.cssText = 'font-family: monospace; font-size: 11px; opacity: 0.5;';
			document.body.appendChild(marker);
		} catch {
			// ignore marker failures
		}
	}
};

if (typeof window !== 'undefined') {
	((webView) => {
		try {
			(webView as DebugWindow).__APP_BOOTSTRAP_LOG = bootLog;
		} catch {
			// ignore assignment failures
		}
	})(window);
}

bootLog('main module evaluated');

const SafeRouter = () => {
	bootLog('SafeRouter render', {
		status: router.state.status,
		matches: router.state.matches?.map((match) => {
			const loaderStatus = 'loaderStatus' in match ? (match as { loaderStatus?: unknown }).loaderStatus ?? null : null;
			return {
				routeId: match.routeId,
				loaderStatus,
				context: match.context,
			};
		}) ?? null,
		pendingMatches: router.state.pendingMatches?.map((match) => match.routeId) ?? null,
	});
	return <RouterProvider router={router} />;
};

try {
	bootLog('router initial state', { location: router.state.location.href, status: router.state.status });
	void router.load()
		.then(() => bootLog('router.load resolved'))
		.catch((error) => bootLog('router.load rejected', { error: error instanceof Error ? error.message : String(error) }));
} catch (error) {
	bootLog('router instrumentation failed', { error: error instanceof Error ? error.message : String(error) });
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
enableMocking()
	.then(() => {
		const query = new URLSearchParams(globalThis.location.search);
		const debugApp = query.get('debugApp') === '1';
		bootLog('enableMocking resolved, mounting app', { debugApp });
		const rootElement = document.getElementById('root');
		if (!rootElement) {
			bootLog('root element missing');
			return;
		}

		bootLog('Invoking createRoot.render', { debugApp });
		createRoot(rootElement).render(
			debugApp
				? (
					<StrictMode>
						<div style={{ padding: '2rem', color: '#fff', background: '#111' }}>
							Debug placeholder rendered (debugApp=1). If you can see this, React mounted successfully.
						</div>
					</StrictMode>
				)
				: (
					<StrictMode>
						<ErrorBoundary>
							<ResponsiveProvider>
								<GenericSuspense id='router'>
									<SafeRouter />
								</GenericSuspense>
							</ResponsiveProvider>
						</ErrorBoundary>
					</StrictMode>
				),
		);
		bootLog('createRoot.render completed');
		setTimeout(() => {
			bootLog('post-render snapshot', {
				childNodes: Array.from(rootElement.childNodes).map((node) => node.nodeName),
				innerHTMLPreview: rootElement.innerHTML.slice(0, 200),
			});
		}, 0);
	})
	.catch((error) => {
		bootLog('enableMocking rejected', { error: error instanceof Error ? error.message : String(error) });
	});
