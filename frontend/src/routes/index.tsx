import { createFileRoute } from '@tanstack/react-router';
import App from '../App.tsx';

export const Route = createFileRoute('/')({
	// Render the existing dashboard as-is at the root
	component: App,
});
