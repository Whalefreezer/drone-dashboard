import { useEffect, useState } from 'react';

function getInitialPreference(): boolean {
	if (typeof window === 'undefined' || typeof globalThis.matchMedia !== 'function') return false;
	return globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function usePrefersReducedMotion(): boolean {
	const [prefersReducedMotion, setPrefersReducedMotion] = useState<boolean>(getInitialPreference);

	useEffect(() => {
		if (typeof window === 'undefined' || typeof globalThis.matchMedia !== 'function') return;
		const mediaQuery = globalThis.matchMedia('(prefers-reduced-motion: reduce)');
		const handleChange = (event: MediaQueryListEvent) => setPrefersReducedMotion(event.matches);
		// Support older browsers where addEventListener may not exist
		if (typeof mediaQuery.addEventListener === 'function') mediaQuery.addEventListener('change', handleChange);
		else if (typeof mediaQuery.addListener === 'function') mediaQuery.addListener(handleChange);
		setPrefersReducedMotion(mediaQuery.matches);

		return () => {
			if (typeof mediaQuery.removeEventListener === 'function') mediaQuery.removeEventListener('change', handleChange);
			else if (typeof mediaQuery.removeListener === 'function') mediaQuery.removeListener(handleChange);
		};
	}, []);

	return prefersReducedMotion;
}

export default usePrefersReducedMotion;
