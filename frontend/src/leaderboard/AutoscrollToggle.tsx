import React from 'react';
import { useAtom } from 'jotai';
import { leaderboardAutoscrollEnabledAtom } from '../state/autoscroll-atoms.ts';

interface AutoscrollToggleProps {
	compact?: boolean;
}

export function AutoscrollToggle({ compact = true }: AutoscrollToggleProps) {
	const [autoscrollEnabled, setAutoscrollEnabled] = useAtom(leaderboardAutoscrollEnabledAtom);

	const toggleAutoscroll = () => {
		setAutoscrollEnabled(!autoscrollEnabled);
	};

	const buttonStyle: React.CSSProperties = compact
		? { width: 28, height: 28, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }
		: { padding: '4px 8px' };

	const buttonContent = compact
		? (
			<span aria-hidden title={`Autoscroll ${autoscrollEnabled ? 'enabled' : 'disabled'}`} style={{ fontSize: 16 }}>
				{autoscrollEnabled ? '⏸' : '▶'}
			</span>
		)
		: <span>Autoscroll {autoscrollEnabled ? 'On' : 'Off'}</span>;

	return (
		<button
			type='button'
			onClick={toggleAutoscroll}
			style={buttonStyle}
			aria-label={`Toggle autoscroll - currently ${autoscrollEnabled ? 'enabled' : 'disabled'}`}
			title={`Toggle autoscroll - currently ${autoscrollEnabled ? 'enabled' : 'disabled'}`}
		>
			{buttonContent}
		</button>
	);
}
