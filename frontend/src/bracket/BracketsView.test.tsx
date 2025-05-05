import '../tests/test_setup.ts';
import { render } from '@testing-library/react';
import { BracketsView } from './BracketsView.tsx';
import { Provider } from 'jotai';
import { it } from '@std/testing/bdd';
import { assertExists } from '@std/assert';

it('BracketsView renders without crashing', () => {
    const { container } = render(
        <Provider>
            <BracketsView />
        </Provider>,
    );
    assertExists(container, 'BracketsView container should exist even if potentially empty');
});
