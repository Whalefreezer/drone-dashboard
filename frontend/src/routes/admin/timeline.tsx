import { createFileRoute } from '@tanstack/react-router';
import TimelineEditor from '../../admin/TimelineEditor.tsx';

// @ts-ignore see TanStack Router typing quirk noted in repo
export const Route = createFileRoute('/admin/timeline')({
	component: TimelineEditor,
});
