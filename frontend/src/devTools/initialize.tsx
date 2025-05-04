import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { worker } from './browser.ts';
import { DEFAULT_SCENARIO_NAME, getHandlersByScenarioName, scenarioNames } from './scenarios/index.ts';
import ScenarioSelector from './ScenarioSelector.tsx';

/**
 * Enables MSW mocking based on the `?dev=1` URL flag.
 * Renders the ScenarioSelector UI and starts the MSW worker with the selected scenario.
 * @returns {Promise<void>} A promise that resolves when mocking is enabled (or immediately if not). 
 */
export async function enableMocking(): Promise<void> {
    const urlParams = new URLSearchParams(globalThis.location.search);
    const useMocks = urlParams.get('dev') === '1';

    if (useMocks) {
        const selectedScenario = localStorage.getItem('mswScenario') as typeof scenarioNames[number] | null;
        const handlers = await getHandlersByScenarioName(selectedScenario);
        const actualScenarioName = selectedScenario || DEFAULT_SCENARIO_NAME;

        console.log(`MSW enabled via ?dev=1 flag. Using scenario: "${actualScenarioName}"`);

        let selectorRootDiv = document.getElementById('scenario-selector-root');
        if (!selectorRootDiv) {
            selectorRootDiv = document.createElement('div');
            selectorRootDiv.id = 'scenario-selector-root';
            document.body.appendChild(selectorRootDiv);
        }
        const selectorRoot = createRoot(selectorRootDiv);
        selectorRoot.render(
            <StrictMode>
                <ScenarioSelector />
            </StrictMode>
        );

        await worker.start({
            onUnhandledRequest: 'bypass',
            quiet: true,
        });
        worker.resetHandlers(...handlers);
        return; // Return void explicitly after async operation
    }
    return Promise.resolve();
} 