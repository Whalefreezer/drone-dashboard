import { useState, useEffect } from 'react';
import { scenarios, scenarioNames, DEFAULT_SCENARIO_NAME, ScenarioName } from '../mocks/scenarios/index.ts';
import { worker } from '../mocks/browser.ts'; // Import the worker instance

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
    // Get the initial scenario name from localStorage or default
    const initialScenario = (localStorage.getItem('mswScenario') as ScenarioName) || DEFAULT_SCENARIO_NAME;
    const [selectedScenario, setSelectedScenario] = useState<ScenarioName>(initialScenario);

    // Effect to apply initial handlers (redundant with main.tsx but safe)
    // useEffect(() => {
    //     const initialHandlers = scenarios[initialScenario];
    //     worker.resetHandlers(...initialHandlers);
    // }, [initialScenario]); // Run only once on mount essentially

    const handleChange = async (event: React.ChangeEvent<HTMLSelectElement>) => {
        const newScenarioName = event.target.value as ScenarioName;

        if (scenarios[newScenarioName]) {
            setSelectedScenario(newScenarioName);
            localStorage.setItem('mswScenario', newScenarioName);
            console.log(`Switching MSW scenario to: "${newScenarioName}"`);

            // Apply the new handlers
            worker.resetHandlers(...scenarios[newScenarioName]);

            // Force a reload to reflect changes (simplest approach)
            // TODO: Implement more granular state refresh if needed
            window.location.reload();
        }
    };

    return (
        <div style={selectorStyle}>
            <label htmlFor="msw-scenario-select">MSW Scenario:</label>
            <select
                id="msw-scenario-select"
                value={selectedScenario}
                onChange={handleChange}
                style={selectElementStyle}
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