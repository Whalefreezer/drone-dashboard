import "../tests/global-jsdom.ts"; // Initialize JSDOM environment FIRST
import "../tests/test_setup.ts";
import { assertEquals } from "@std/assert";
import { render } from "@testing-library/react";
import { describe, it } from "@std/testing/bdd";
import Legend from './Legend.tsx';

describe('Legend', () => {
  it('renders correctly with four LegendItem components', () => {
    const { container } = render(<Legend />);

    // Find the Legend component's main container div (first div child of the render container)
    const legendContainer = container.querySelector('div');
    assertEquals(legendContainer !== null, true, "Legend container div should exist");

    // Check that there are four direct div children within the Legend container
    // These correspond to the outer divs of the LegendItem components
    const legendItems = legendContainer?.querySelectorAll(':scope > div'); // Use :scope to query direct children
    assertEquals(legendItems?.length, 4, "Should find 4 direct LegendItem divs");
  });
}); 