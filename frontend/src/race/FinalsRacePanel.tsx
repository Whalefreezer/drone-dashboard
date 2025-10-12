import './FinalsRacePanel.css';
import { useAtomValue } from 'jotai';
import { finalsStateAtom } from '../bracket/finalsState.ts';

/**
 * Compact finals panel for the races container.
 * Shows current finals standings and active heat info.
 */
export function FinalsRacePanel() {
	const finals = useAtomValue(finalsStateAtom);

	if (!finals.enabled || finals.heats.length === 0) {
		return null;
	}

	const activeHeat = finals.heats.find((h) => h.isActive);
	const completedHeats = finals.heats.filter((h) => h.isCompleted).length;

	return (
		<div className='finals-race-panel'>
			<div className='finals-race-header'>
				<h3>Finals - Top 6</h3>
				<span className='finals-race-progress'>
					{completedHeats} / {Math.max(finals.heats.length, 3)} heats
				</span>
			</div>

			{activeHeat && (
				<div className='finals-race-active-heat'>
					<span className='active-heat-label'>Active Heat {activeHeat.heatNumber}</span>
				</div>
			)}

			{finals.message && completedHeats < 3 && (
				<div className='finals-race-message'>
					{finals.message}
				</div>
			)}

			<div className='finals-race-standings'>
				<table>
					<thead>
						<tr>
							<th>Pos</th>
							<th>Pilot</th>
							<th>Wins</th>
							<th>Pts</th>
						</tr>
					</thead>
					<tbody>
						{finals.participants.slice(0, 6).map((participant) => (
							<tr
								key={participant.pilotId}
								data-champion={participant.isChampion ? 'true' : 'false'}
							>
								<td className='pos'>
									{participant.finalPosition}
									{participant.isChampion && <span className='champion-icon'>👑</span>}
								</td>
								<td className='pilot'>{participant.pilotName}</td>
								<td className='wins'>{participant.wins}</td>
								<td className='pts'>{participant.totalPoints}</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</div>
	);
}
