import { createFileRoute } from '@tanstack/react-router';
import { GenericSuspense } from '../../common/GenericSuspense.tsx';
import { PilotPage } from '../../pilot/PilotPage.tsx';

export const Route = createFileRoute('/pilots/$pilotId')({
	component: PilotRouteComponent,
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
