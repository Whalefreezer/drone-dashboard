import { createFileRoute } from '@tanstack/react-router';
import App from '../App.tsx';

// @ts-ignore - TanStack Router type issue, see https://github.com/denoland/deno/issues/30444
export const Route = createFileRoute('/')({
	// Render the existing dashboard as-is at the root
	component: App,
});
