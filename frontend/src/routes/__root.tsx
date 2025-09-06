import { createRootRouteWithContext, Link, Outlet } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/router-devtools';

interface RouterContext {
	// add shared singletons here later (e.g., queryClient)
}

export const Route = createRootRouteWithContext<RouterContext>()({
	component: () => (
		<>
			<nav style={{ padding: 8, display: 'flex', gap: 12 }}>
				{/* @ts-ignore - TanStack Router type issue, see https://github.com/denoland/deno/issues/30444 */}
				<Link to='/'>Dashboard</Link>
				{/* @ts-ignore - TanStack Router type issue, see https://github.com/denoland/deno/issues/30444 */}
				<Link to='/admin'>Admin</Link>
			</nav>
			<main>
				<Outlet />
			</main>
			{import.meta.env.DEV && <TanStackRouterDevtools position='bottom-right' />}
		</>
	),
});
