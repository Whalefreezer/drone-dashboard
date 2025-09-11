import { useAtom } from 'jotai';
import { activePaneAtom, DashboardPane } from '../state/viewAtoms.ts';
import useBreakpoint from '../responsive/useBreakpoint.ts';
import './ViewSelector.css';

const mobilePanes: { key: DashboardPane; label: string }[] = [
	{ key: 'leaderboard', label: 'Leaderboard' },
	{ key: 'races', label: 'Races' },
	{ key: 'brackets', label: 'Brackets' },
	{ key: 'eliminated', label: 'Eliminated' },
];

const desktopPanes: { key: DashboardPane; label: string }[] = [
	{ key: 'leaderboard', label: 'Leaderboard' },
	{ key: 'races', label: 'Races' },
	{ key: 'brackets', label: 'Brackets' },
	{ key: 'eliminated', label: 'Eliminated' },
];

export function ViewSelector() {
	const [active, setActive] = useAtom(activePaneAtom);
	const { isMobile } = useBreakpoint();
	const panes = isMobile ? mobilePanes : desktopPanes;

	return (
		<div className='view-selector' role='tablist'>
			{panes.map((p) => (
				<button
					type='button'
					key={p.key}
					role='tab'
					aria-selected={active === p.key}
					className={active === p.key ? 'active' : ''}
					onClick={() => setActive(p.key)}
				>
					{p.label}
				</button>
			))}
		</div>
	);
}
