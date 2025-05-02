import { standardDataHandlers } from './standardData.ts';
import { emptyStateHandlers } from './emptyState.ts';
import { errorStateHandlers } from './errorState.ts';
import type { HttpHandler } from 'msw';

export const scenarios: Record<string, readonly HttpHandler[]> = {
  'Standard Data': standardDataHandlers,
  'Empty State': emptyStateHandlers,
  'Error State': errorStateHandlers,
};

export type ScenarioName = keyof typeof scenarios;

export const DEFAULT_SCENARIO_NAME: ScenarioName = 'Standard Data';

export const scenarioNames = Object.keys(scenarios) as ScenarioName[];

// Helper function to get handlers by name
export function getHandlersByScenarioName(name: ScenarioName | null): readonly HttpHandler[] {
    const scenarioName = name && scenarios[name] ? name : DEFAULT_SCENARIO_NAME;
    return scenarios[scenarioName];
} 