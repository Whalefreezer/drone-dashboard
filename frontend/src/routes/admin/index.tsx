import { createFileRoute, redirect } from '@tanstack/react-router';

// Redirect /admin to /admin/dashboard
// @ts-ignore type quirk noted in repo
export const Route = createFileRoute('/admin/')({
	beforeLoad: () => {
		// @ts-ignore see repo router note
		throw redirect({ to: '/admin/dashboard' });
	},
});
