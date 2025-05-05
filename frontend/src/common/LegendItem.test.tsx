import '../tests/test_setup.ts'; // Add test setup import
import { assertEquals } from '@std/assert'; // Use std/assert
import { render } from '@testing-library/react';
import { describe, it } from '@std/testing/bdd'; // Use std/testing/bdd
import LegendItem from './LegendItem.tsx';

describe('LegendItem', () => {
    it('renders correctly', () => {
        const { container } = render(<LegendItem color='red' label='Test' />);
        // Check elements exist using assertEquals and querySelector
        assertEquals(container.querySelector('div') !== null, true);
        assertEquals(container.querySelector('span') !== null, true);
    });
});
