import { Suspense } from 'react';

type DebugWindow = Window & {
	__APP_BOOTSTRAP_LOG?: (message: string, extra?: Record<string, unknown>) => void;
};

export function GenericSuspense({ children, id }: { children: React.ReactNode; id: string }) {
	return <Suspense fallback={<Fallback id={id} />}>{children}</Suspense>;
}

function Fallback({ id }: { id?: string }) {
	const bootstrapLogger = typeof window !== 'undefined' ? (window as DebugWindow).__APP_BOOTSTRAP_LOG : undefined;
	bootstrapLogger?.('Suspense fallback rendered', { id: id ?? 'unknown' });
	return <div>Loading {id}...</div>;
}
