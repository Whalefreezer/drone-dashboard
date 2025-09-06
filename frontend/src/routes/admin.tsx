import { createFileRoute, redirect } from '@tanstack/react-router';
import { isAuthenticated } from '../api/pb.ts';
import AdminPage from './admin/AdminPage.tsx';

// @ts-ignore - TanStack Router type issue, see https://github.com/denoland/deno/issues/30444
export const Route = createFileRoute('/admin')({
	beforeLoad: () => {
		if (!isAuthenticated()) {
			// @ts-ignore - TanStack Router type issue, see https://github.com/denoland/deno/issues/30444
			throw redirect({ to: '/login' });
		}
	},
	component: AdminPage,
});
