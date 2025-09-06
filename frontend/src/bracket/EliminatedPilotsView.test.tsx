import '../tests/test_setup.ts';
import { render } from '@testing-library/react';
import { EliminatedPilotsView } from './EliminatedPilotsView.tsx';
import { Provider } from 'jotai';
import { it } from '@std/testing/bdd';
import { assertExists } from '@std/assert';

it('EliminatedPilotsView renders without crashing', () => {
	const { container } = render(
		<Provider>
			<EliminatedPilotsView />
		</Provider>,
	);
	assertExists(
		container,
		'EliminatedPilotsView container should exist even if potentially empty',
	);
});
