import "../tests/test_setup.ts"; // Import test setup for DOM environment
import { render } from '@testing-library/react';
import { EliminatedPilotsView } from './EliminatedPilotsView.tsx';
import { Provider } from 'jotai';
import { it } from "@std/testing/bdd";
import { assertExists } from "@std/assert";

it('EliminatedPilotsView renders without crashing', () => {
    // Basic render test - assumes atoms provide initial state where view might render null
    // If it should always render a container, adjust assertions.
    // Testing conditional rendering requires mocking atom state.
    const { container } = render(
        <Provider>
            <EliminatedPilotsView />
        </Provider>,
    );
    // Check if the component renders *something*. It might render null initially.
    // A more robust test would mock atom state to force rendering.
    assertExists(container, "EliminatedPilotsView container should exist even if potentially empty");
}); 