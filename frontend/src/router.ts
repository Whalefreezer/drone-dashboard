import { createRouter } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen.ts';

// Create router from generated route tree
export const router = createRouter({ routeTree, context: {} });

// Type augmentation for strong typing across the app
declare module '@tanstack/react-router' {
	interface Register {
		router: typeof router;
	}
}
