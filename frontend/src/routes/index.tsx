import { createFileRoute } from '@tanstack/react-router';
import App from '../App.tsx';

type DebugWindow = Window & {
	__APP_BOOTSTRAP_LOG?: (message: string, extra?: Record<string, unknown>) => void;
};

// @ts-ignore - TanStack Router type issue, see https://github.com/denoland/deno/issues/30444
export const Route = createFileRoute('/')({
	// Render the existing dashboard as-is at the root
	component: () => {
		const bootstrapLogger = typeof window !== 'undefined' ? (window as DebugWindow).__APP_BOOTSTRAP_LOG : undefined;
		bootstrapLogger?.('Index route render');
		return <App />;
	},
});
