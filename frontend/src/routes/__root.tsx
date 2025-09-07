import { createRootRouteWithContext, Link, Outlet } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';

type RouterContext = Record<PropertyKey, never>;

const enableRouterDevtools = import.meta.env.DEV && (import.meta.env.VITE_ROUTER_DEVTOOLS === 'true');

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
			{enableRouterDevtools && <TanStackRouterDevtools position='bottom-right' />}
		</>
	),
});
