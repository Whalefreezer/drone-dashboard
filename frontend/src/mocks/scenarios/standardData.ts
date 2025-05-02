// Scenario re-exporting the original handlers from handlers.ts

// We keep the original data and handlers in the main handlers.ts file
// and just re-export them here for consistency within the scenario structure.

import { handlers } from '../handlers.ts';

export const standardDataHandlers = handlers; 