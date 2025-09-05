import { Outlet, Link, createRootRouteWithContext } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/router-devtools';

interface RouterContext {
  // add shared singletons here later (e.g., queryClient)
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: () => (
    <>
      <nav style={{ padding: 8, display: 'flex', gap: 12 }}>
        <Link to='/'>Dashboard</Link>
        <Link to='/admin'>Admin</Link>
      </nav>
      <main>
        <Outlet />
      </main>
      {import.meta.env.DEV && (
        <TanStackRouterDevtools position='bottom-right' />
      )}
    </>
  ),
});

