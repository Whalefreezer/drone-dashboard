import './FinalsModule.css';
import { useAtomValue } from 'jotai';
import { finalsStateAtom } from './finalsState.ts';
import { currentRaceAtom } from '../race/race-atoms.ts';

export function FinalsModule() {
	const finals = useAtomValue(finalsStateAtom);
	const currentRace = useAtomValue(currentRaceAtom);

	if (!finals.enabled) {
		return null;
	}

	// Show message if no heats yet or waiting for more data
	if (finals.heats.length === 0 || finals.participants.length === 0) {
		return (
			<div className='finals-module'>
				<header className='finals-header'>
					<h3>Finals - Top 6</h3>
				</header>
				<div className='finals-message'>
					{finals.message || 'Waiting for finals to begin.'}
				</div>
			</div>
		);
	}

	const completedHeats = finals.heats.filter((h) => h.isCompleted).length;

	return (
		<div className='finals-module'>
			<header className='finals-header'>
				<h3>Finals - Top 6</h3>
				<div className='finals-header-info'>
					<span className='finals-heat-count'>
						{completedHeats} / {Math.max(finals.heats.length, 3)} heats
					</span>
					{finals.championId && <span className='finals-champion-badge'>Champion Crowned</span>}
				</div>
			</header>

			{finals.message && completedHeats < 3 && (
				<div className='finals-message finals-message--warning'>
					{finals.message}
				</div>
			)}

			{finals.message && completedHeats >= 3 && finals.championId && (
				<div className='finals-message finals-message--success'>
					{finals.message}
				</div>
			)}

			<div className='finals-standings'>
				<table className='finals-table'>
					<thead>
						<tr>
							<th className='col-position'>Pos</th>
							<th className='col-pilot'>Pilot</th>
							<th className='col-wins'>Wins</th>
							<th className='col-points'>Points</th>
							<th className='col-heats'>Heats</th>
						</tr>
					</thead>
					<tbody>
						{finals.participants.map((participant) => (
							<tr
								key={participant.pilotId}
								className='finals-row'
								data-champion={participant.isChampion ? 'true' : 'false'}
							>
								<td className='col-position'>
									{participant.finalPosition}
									{participant.isChampion && <span className='champion-icon' title='Champion'>👑</span>}
								</td>
								<td className='col-pilot'>{participant.pilotName}</td>
								<td className='col-wins'>{participant.wins}</td>
								<td className='col-points'>{participant.totalPoints}</td>
								<td className='col-heats'>{participant.heatResults.length}</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>

			{finals.heats.length > 0 && (
				<div className='finals-heats'>
					<h4>Finals Heats</h4>
					<div className='finals-heats-grid'>
						{finals.heats.map((heat) => {
							const isCurrentHeat = currentRace && heat.raceId === currentRace.id;
							return (
								<div
									key={heat.raceId}
									className='finals-heat-card'
									data-completed={heat.isCompleted ? 'true' : 'false'}
									data-active={heat.isActive ? 'true' : 'false'}
									data-current={isCurrentHeat ? 'true' : 'false'}
								>
									<div className='heat-header'>
										<span className='heat-number'>Heat {heat.heatNumber}</span>
										<span className='heat-status'>
											{heat.isActive ? 'Active' : heat.isCompleted ? 'Complete' : 'Scheduled'}
										</span>
									</div>
									{heat.isCompleted && heat.results.length > 0 && (
										<ul className='heat-results'>
											{heat.results
												.slice()
												.sort((a, b) => a.position - b.position)
												.slice(0, 3)
												.map((result) => (
													<li key={result.pilotId} className='heat-result'>
														<span className='result-position'>{result.position}.</span>
														<span className='result-pilot'>{result.pilotName}</span>
														<span className='result-points'>{result.points}pts</span>
													</li>
												))}
										</ul>
									)}
								</div>
							);
						})}
					</div>
				</div>
			)}
		</div>
	);
}
