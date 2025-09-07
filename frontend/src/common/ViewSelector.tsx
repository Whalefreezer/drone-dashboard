import { useAtom } from 'jotai';
import { activePaneAtom, DashboardPane } from '../state/viewAtoms.ts';
import './ViewSelector.css';

const panes: { key: DashboardPane; label: string }[] = [
	{ key: 'leaderboard', label: 'Leaderboard' },
	{ key: 'current', label: 'Current Race' },
	{ key: 'next', label: 'Next Races' },
	{ key: 'brackets', label: 'Brackets' },
	{ key: 'eliminated', label: 'Eliminated' },
];

export function ViewSelector() {
	const [active, setActive] = useAtom(activePaneAtom);
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
