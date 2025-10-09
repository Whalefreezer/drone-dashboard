import { createRootRouteWithContext, Link, Outlet } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';
import { useAtomValue } from 'jotai';
import { useEffect } from 'react';
import useBreakpoint from '../responsive/useBreakpoint.ts';
import { appTitleAtom, DEFAULT_APP_TITLE } from '../state/pbAtoms.ts';

type DebugWindow = Window & {
	__APP_BOOTSTRAP_LOG?: (message: string, extra?: Record<string, unknown>) => void;
};

type RouterContext = Record<PropertyKey, never>;

const enableRouterDevtools = import.meta.env.DEV && (import.meta.env.VITE_ROUTER_DEVTOOLS === 'true');

export const Route = createRootRouteWithContext<RouterContext>()({
	component: () => {
		const { isMobile } = useBreakpoint();
		// const appTitle = useAtomValue(appTitleAtom);
		const bootstrapLogger = typeof window !== 'undefined' ? (window as DebugWindow).__APP_BOOTSTRAP_LOG : undefined;
		bootstrapLogger?.('Root route render', { isMobile });

		// useEffect(() => {
		// 	const nextTitle = appTitle?.trim() ? appTitle : DEFAULT_APP_TITLE;
		// 	if (document.title !== nextTitle) {
		// 		document.title = nextTitle;
		// 	}
		// }, [appTitle]);

		return (
			<>
				<main>
					<Outlet />
				</main>
				{enableRouterDevtools && <TanStackRouterDevtools position='bottom-right' />}
			</>
		);
	},
});
