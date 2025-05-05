import { useEffect, useState } from 'react';
import {
    DEFAULT_SCENARIO_NAME,
    getHandlersByScenarioName,
    jsonScenarioFiles, // Need this to check if it's a JSON scenario
    scenarioNames,
} from './scenarios/index.ts';
import { worker } from './browser.ts'; // Import the worker instance

// Basic styling for the selector
const selectorStyle: React.CSSProperties = {
    position: 'fixed',
    bottom: '10px',
    right: '10px',
    padding: '8px',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    color: 'white',
    borderRadius: '4px',
    zIndex: 9999, // Ensure it's on top
    fontSize: '12px',
};

const selectElementStyle: React.CSSProperties = {
    marginLeft: '8px',
    backgroundColor: '#333',
    color: 'white',
    border: '1px solid #555',
};

function ScenarioSelector() {
    const initialScenario = localStorage.getItem('mswScenario') || DEFAULT_SCENARIO_NAME;
    const [selectedScenario, setSelectedScenario] = useState<string>(initialScenario);
    const [isLoading, setIsLoading] = useState(false); // Loading state for async handlers

    const handleChange = async (event: React.ChangeEvent<HTMLSelectElement>) => {
        const newScenarioName = event.target.value;
        const isJsonScenario = !!jsonScenarioFiles[newScenarioName];

        setIsLoading(true); // Start loading indicator
        setSelectedScenario(newScenarioName); // Update selection immediately
        localStorage.setItem('mswScenario', newScenarioName);
        console.log(`Switching MSW scenario to: "${newScenarioName}"`);

        try {
            // Get handlers, potentially loading from JSON asynchronously
            const newHandlers = await getHandlersByScenarioName(newScenarioName);

            // Apply the new handlers
            worker.resetHandlers(...newHandlers);
            console.log(`MSW handlers updated for scenario: "${newScenarioName}"`);

            // Force a reload to reflect changes
            window.location.reload();
        } catch (error) {
            console.error(`Error applying scenario "${newScenarioName}":`, error);
            // Optionally revert selection or show error state
            setIsLoading(false);
            // Maybe revert to default?
            // localStorage.setItem('mswScenario', DEFAULT_SCENARIO_NAME);
            // window.location.reload();
        }
        // Note: isLoading might not reset if reload happens before this line
    };

    return (
        <div style={selectorStyle}>
            <label htmlFor='msw-scenario-select'>
                {isLoading ? 'Loading Scenario...' : 'MSW Scenario:'}
            </label>
            <select
                id='msw-scenario-select'
                value={selectedScenario}
                onChange={handleChange}
                style={selectElementStyle}
                disabled={isLoading} // Disable while loading
            >
                {scenarioNames.map((name) => (
                    <option key={name} value={name}>
                        {name}
                    </option>
                ))}
            </select>
        </div>
    );
}

export default ScenarioSelector;
