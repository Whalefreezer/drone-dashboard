import '../tests/test_setup.ts'; // Import common setup (MSW, cleanup)
import { act, render, screen } from '@testing-library/react'; // Import act
import { describe, it } from '@std/testing/bdd';
import { assertEquals } from '@std/assert';
import RaceTime from './RaceTime.tsx';

describe('RaceTime', () => {
    it('renders initial time correctly based on mocked API data', async () => {
        // Wrap render in async act to handle async state updates triggered by useQueryAtom
        await act(async () => {
            render(
                <RaceTime />,
            );
        });

        // findBy* waits for the element to appear after async operations
        const timeElement = await screen.findByText(/^180\.0$/); // Escaped dot for regex
        assertEquals(timeElement !== null, true, 'Should display initial time 180.0');
    });

    // TODO: Add tests for timer countdown behavior when race starts (requires Date/timer mocking).
});
