import { createFileRoute } from '@tanstack/react-router';
import { GenericSuspense } from '../../common/GenericSuspense.tsx';
import { PilotPage } from '../../pilot/PilotPage.tsx';

/* @ts-ignore - TanStack Router type issue, see https://github.com/denoland/deno/issues/30444 */
export const Route = createFileRoute('/pilots/$pilotId')({
	component: PilotRouteComponent,
	/* @ts-ignore - TanStack Router type issue, see https://github.com/denoland/deno/issues/30444 */
	params: { parse: (params) => ({ pilotId: params.pilotId }) },
});

function PilotRouteComponent() {
	const { pilotId } = Route.useParams();
	return (
		<GenericSuspense id='pilot'>
			<PilotPage pilotId={pilotId} />
		</GenericSuspense>
	);
}
