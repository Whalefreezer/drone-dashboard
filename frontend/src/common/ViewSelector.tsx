import { useEffect } from 'react';
import { useAtom } from 'jotai';
import { useAtomValue } from 'jotai';
import { activePaneAtom, DashboardPane } from '../state/viewAtoms.ts';
import useBreakpoint from '../responsive/useBreakpoint.ts';
import './ViewSelector.css';
import { bracketEnabledAtom } from '../bracket/eliminationState.ts';

export function ViewSelector() {
	const [active, setActive] = useAtom(activePaneAtom);
	const { isMobile } = useBreakpoint();
	const bracketEnabled = useAtomValue(bracketEnabledAtom);
	const panes: { key: DashboardPane; label: string }[] = isMobile
		? (bracketEnabled
			? [
				{ key: 'leaderboard', label: 'Leaderboard' },
				{ key: 'races', label: 'Races' },
				{ key: 'brackets', label: 'Brackets' },
			]
			: [
				{ key: 'leaderboard', label: 'Leaderboard' },
				{ key: 'races', label: 'Races' },
			])
		: [
			{ key: 'leaderboard', label: 'Leaderboard' },
			{ key: 'races', label: 'Races' },
		];

	useEffect(() => {
		if (!bracketEnabled && active === 'brackets') {
			setActive('leaderboard');
		}
	}, [bracketEnabled, active, setActive]);

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
