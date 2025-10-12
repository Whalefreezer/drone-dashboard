import './BracketView.css';
import { EliminationDiagram } from './EliminationDiagram.tsx';
import { FinalsModule } from './FinalsModule.tsx';

/**
 * BracketView combines the elimination bracket diagram with the finals module.
 * This is the main view for the bracket visualization that includes both
 * the double-elimination bracket and the Top 6 finals.
 */
export function BracketView() {
	return (
		<div className='bracket-view'>
			<EliminationDiagram />
			{
				/* <div className='bracket-view-finals'>
				<FinalsModule />
			</div> */
			}
		</div>
	);
}
