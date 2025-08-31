import { Suspense } from 'react';
export function GenericSuspense({ children, id }: { children: React.ReactNode; id: string }) {
    return <Suspense fallback={<Fallback id={id} />}>{children}</Suspense>;
}

function Fallback({ id }: { id?: string }) {
    return <div>Loading {id}...</div>;
}
