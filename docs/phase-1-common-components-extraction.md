# Phase 1 Refactoring: Extract Common Components (Legend, LegendItem)

This document outlines the steps to complete the remaining parts of Phase 1 of the component refactoring plan: extracting the `Legend` and `LegendItem` components from `frontend/src/App.tsx` into the `frontend/src/common/` directory.

## Background

These components were identified in the [Component Refactoring Plan](mdc:docs/component-refactoring-plan.md) as being defined within `App.tsx` and suitable for extraction into the shared `common` directory.

- `LegendItem`: Displays a colored square and a text label.
- `Legend`: Displays a group of `LegendItem` components to explain color coding.

## Extraction Steps

Follow these steps in order:

### 1. Extract `LegendItem`

   a. **Create File:** Create a new file: `frontend/src/common/LegendItem.tsx`

   b. **Copy Code:** Copy the `LegendItem` function definition (approximately lines 455-477 in the current `App.tsx`) into `frontend/src/common/LegendItem.tsx`.

   c. **Add Imports:** Add the necessary React import at the top:
      ```typescript
      import React from 'react';
      ```

   d. **Define Props:** Define an interface for the props:
      ```typescript
      interface LegendItemProps {
        color: string;
        label: string;
      }
      ```
      Update the function signature to use the interface:
      ```typescript
      function LegendItem({ color, label }: LegendItemProps) {
        // ... function body
      }
      ```

   e. **Export Component:** Add a default export at the bottom:
      ```typescript
      export default LegendItem;
      ```

   f. **Add Styling (Optional but Recommended):** Consider extracting the inline styles into a separate CSS file (`frontend/src/common/LegendItem.css`) and importing it, or using a CSS-in-JS solution if preferred.

### 2. Extract `Legend`

   a. **Create File:** Create a new file: `frontend/src/common/Legend.tsx`

   b. **Copy Code:** Copy the `Legend` function definition (approximately lines 479-499 in the current `App.tsx`) into `frontend/src/common/Legend.tsx`.

   c. **Add Imports:** Add the necessary React import and the import for the newly created `LegendItem`:
      ```typescript
      import React from 'react';
      import LegendItem from './LegendItem.tsx'; // Ensure correct path
      ```

   d. **Export Component:** Add a default export at the bottom:
      ```typescript
      export default Legend;
      ```
   e. **Add Styling (Optional but Recommended):** Similar to `LegendItem`, consider extracting inline styles.

### 3. Update `App.tsx`

   a. **Remove Definitions:** Delete the original `LegendItem` and `Legend` function definitions from `frontend/src/App.tsx`.

   b. **Add Imports:** Add imports for the new components at the top of `App.tsx`:
      ```typescript
      import Legend from './common/Legend.tsx'; // Adjust path as needed
      // LegendItem is used by Legend, so no direct import needed in App.tsx unless used elsewhere
      ```

   c. **Verify Usage:** Ensure the `<Legend />` component is still rendered correctly within the `App` component's JSX where it was previously defined.

### 4. Testing (Recommended)

   a. **Create Test Files:** Create basic test files for the new components:
      - `frontend/src/common/LegendItem.test.tsx`
      - `frontend/src/common/Legend.test.tsx`

   b. **Add Snapshot Tests:** Implement simple snapshot tests to ensure the components render as expected.
      ```typescript
      // Example for LegendItem.test.tsx
      import React from 'react';
      import { render } from '@testing-library/react';
      import LegendItem from './LegendItem.tsx';

      it('renders correctly', () => {
        const { container } = render(<LegendItem color="red" label="Test" />);
        expect(container).toMatchSnapshot();
      });
      ```

## Completion

Once these steps are completed and verified, the remaining part of Phase 1 is done. The codebase will be slightly more modular, paving the way for further refactoring. 