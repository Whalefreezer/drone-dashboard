import "../tests/global-jsdom.ts"; // Initialize JSDOM environment FIRST
import "../tests/test_setup.ts"; // Import common setup (MSW, cleanup)
import { render, screen, act } from "@testing-library/react"; // Import act
import { describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";
import { Provider } from 'jotai';
import RaceTime from './RaceTime.tsx';
import { server } from '../mocks/server.ts'; // Import server for test-specific overrides
import { http } from 'msw'; // Import msw utils for overrides

describe('RaceTime', () => {
  it('renders initial time correctly based on mocked API data', async () => {
    // Wrap render in async act to handle async state updates triggered by useQueryAtom
    await act(async () => {
      render(
          <RaceTime />
      );
    });

    // findBy* waits for the element to appear after async operations
    const timeElement = await screen.findByText(/^180\.0$/); 
    assertEquals(timeElement !== null, true, "Should display initial time 180.0");
  });

  it('renders error state when API fails', async () => {
    // Override the default handler for /api/event to return an error for this test
    server.use(
      http.get('/api/event', () => {
        const errorResponse = new Response(null, {
          status: 500,
          statusText: 'Internal Server Error'
        });
        return errorResponse; 
      })
    );

    // Wrap render in async act here too for consistency and potential async error handling
    await act(async () => {
      render(
          <RaceTime />
      );
    });

    // Assert how the component handles the error.
    const timeElement = screen.queryByText(/\d+\.\d/); 
    assertEquals(timeElement, null, "Time element should not be present on error");

    // Optionally, look for an error message if the component renders one
    // const errorElement = await screen.findByText(/error/i); 
    // assertEquals(errorElement !== null, true, "Should display an error message");
  });

  // TODO: Add tests for timer countdown behavior when race starts (requires Date/timer mocking).
}); 