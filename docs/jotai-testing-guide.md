# Testing Jotai Atoms and Components

This guide provides strategies for testing React components and custom hooks that use Jotai for state management, covering basic atoms, async operations, and integration with testing libraries.

## Guiding Principle

Following the principles of React Testing Library:

> "The more your tests resemble the way your software is used, the more confidence they can give you."

Aim to test your components by interacting with them as a user would, treating Jotai largely as an implementation detail. Assert based on the rendered output and behavior, not the internal atom state, whenever possible.

## Basic Testing (Synchronous Atoms)

For components using simple, synchronous atoms (`atom()`), testing is straightforward. Often, no special Jotai setup is needed beyond rendering the component.

```typescript
// Counter.tsx
import { atom, useAtom } from 'jotai';
export const countAtom = atom(0);
export function Counter() {
  const [count, setCount] = useAtom(countAtom);
  return (
    <div>
      <span>{count}</span>
      <button onClick={() => setCount((c) => c + 1)}>Increment</button>
    </div>
  );
}

// Counter.test.tsx
import "../tests/test_setup.ts"; // Assuming common test setup
import { render, screen } from "@testing-library/react";
import userEvent from '@testing-library/user-event';
import { describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";
import { Counter } from './Counter.tsx';

describe('Counter', () => {
  it('should increment counter on button click', async () => {
    render(<Counter />);
    const countElement = screen.getByText('0');
    const button = screen.getByRole('button', { name: /increment/i });

    assertEquals(countElement.textContent, '0');
    await userEvent.click(button);
    assertEquals(countElement.textContent, '1');
  });
});
```
*Note: Even without an explicit `<Provider>`, components often work in tests because Jotai uses a default internal store.* 

## Testing with Initial Values

To test specific scenarios, you might need to initialize atoms with specific values.

**Method 1: Using `useHydrateAtoms` (Recommended for simple cases)**

This utility hook allows setting initial values for atoms within a specific `<Provider>` scope.

```typescript
// Test setup using useHydrateAtoms
import "../tests/test_setup.ts";
import { render, screen } from "@testing-library/react";
import { describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";
import { Provider } from 'jotai';
import { useHydrateAtoms } from 'jotai/utils';
import { countAtom, Counter } from './Counter.tsx'; // Assume Counter uses countAtom

// Helper component to hydrate atoms
const HydrateAtoms = ({ initialValues, children }) => {
  useHydrateAtoms(initialValues); // Takes an array of [atom, value] tuples
  return children;
};

// Wrapper Provider for tests
const TestProvider = ({ initialValues, children }) => (
  <Provider>
    <HydrateAtoms initialValues={initialValues}>{children}</HydrateAtoms>
  </Provider>
);

describe('Counter with initial value', () => {
  it('should start with the hydrated value', () => {
    const initialValues = [[countAtom, 100]] as const; // Tuple [atom, value]
    render(
      <TestProvider initialValues={initialValues}>
        <Counter />
      </TestProvider>
    );
    assertEquals(screen.getByText('100').textContent, '100');
  });
});
```

**Method 2: Using `createStore`**

You can create a dedicated store instance for your test and pre-populate *writable* atoms using `store.set()`.

```typescript
import { createStore, Provider } from 'jotai';
// ... other imports

describe('Counter with store.set', () => {
  it('should start with the pre-set value', () => {
    const testStore = createStore();
    testStore.set(countAtom, 50); // Set value *before* rendering

    render(
      <Provider store={testStore}>
        <Counter />
      </Provider>
    );
    assertEquals(screen.getByText('50').textContent, '50');
  });
});
```
*Limitation: `store.set` only works for directly writable atoms. It **cannot** be used to directly set the value of derived atoms or atoms managed by hooks like `atomWithQuery`.* 

## Testing Async Atoms (`atomWithQuery`, `loadable`, etc.)

Testing components that rely on async atoms (fetching data, using `loadable`) is more complex because:
1.  You usually can't directly set their resolved state (like with `store.set`).
2.  The underlying async operation (e.g., API fetch) might run during the test.
3.  Components might suspend, requiring careful handling with `act` and async utilities.

**The Problem We Faced (`RaceTime.test.tsx`):**
- `useQueryAtom` tried to fetch from `/api` using Axios.
- The test environment (jsdom) couldn't resolve `/api` relative to `about:blank` -> Invalid URL error.
- Even if the URL was valid, we don't want tests making real network requests.
- The async nature likely caused React's "async Client Component" warnings and required `act`.

**Recommended Solution: Mock the API Layer**

The most robust approach is to intercept and mock the network requests made by the underlying fetcher (`axios` in our case).

- **Tools:** Libraries like `msw` (Mock Service Worker) or framework/client-specific adapters (e.g., `axios-mock-adapter`) are excellent for this.
- **How it Works:**
    1.  Configure the mocking tool in your test setup (`tests/test_setup.ts` or similar).
    2.  Define handlers that intercept specific API requests (e.g., `GET /api/user`).
    3.  Specify the mock response (data, status code) the handler should return.
- **Benefits:**
    - Tests the component's interaction with the *actual* hook (`useQueryAtom`).
    - Allows testing loading, success, and error states by controlling the mock response.
    - Avoids needing to manipulate Jotai's internal state.

```typescript
// Conceptual Example using MSW (requires msw setup)
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
// ... other imports ...

// Define handlers for your API endpoints
const handlers = [
  http.get('/api/event', () => {
    return HttpResponse.json(mockEventData); // Return mock data
  }),
  http.get('/api/races', () => {
    return HttpResponse.json(mockRaces);
  }),
  // Add handlers for other endpoints used by atoms
];

// Setup the server in your test setup file or before tests
const server = setupServer(...handlers);
beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// --- In your test file ---
describe('RaceTime with MSW', () => {
  it('renders time correctly after mock fetch', async () => {
    // MSW intercepts the fetch called by useQueryAtom
    render(
      <Provider>
        <RaceTime />
      </Provider>
    );

    // Need findBy* because data fetching is async
    const timeElement = await screen.findByText('180.0'); 
    assertEquals(timeElement !== null, true);
  });

  it('handles API error state', async () => {
    // Override specific handler for this test
    server.use(
      http.get('/api/event', () => {
        return new HttpResponse(null, { status: 500 }); // Simulate server error
      })
    );

    render(
      <Provider>
        <RaceTime />
      </Provider>
    );
    // Assert that an error message is shown, or component renders null/fallback
    // e.g., expect(await screen.findByText(/error loading/i)).toBeInTheDocument();
  });
});
```

**Alternative: Mocking via TanStack Query Client Cache**

Since `atomWithQuery` uses TanStack Query, you *might* be able to pre-populate the query cache *if* you manage the `QueryClient` instance yourself and pass it to Jotai.

```typescript
// Conceptual Example - Requires careful setup
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Provider } from 'jotai';
// ...

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: Infinity, gcTime: Infinity }, // Prevent fetching in tests
  },
});

describe('RaceTime with QueryClient Cache', () => {
  it('renders time using cached data', async () => {
    // Set initial data in the cache BEFORE rendering
    queryClient.setQueryData(['api', 'event'], mockEventData); // Match queryKey used in atom
    queryClient.setQueryData(['api', 'races'], mockRaces); // Match queryKey

    render(
      <QueryClientProvider client={queryClient}>
        <Provider>
          {/* Assumes atomWithQuery uses the ambient QueryClient */}
          <RaceTime />
        </Provider>
      </QueryClientProvider>
    );

    // Should render synchronously if data is in cache and not stale
    const timeElement = await screen.findByText('180.0');
    assertEquals(timeElement !== null, true);
  });
});
```
*This approach requires more knowledge of the underlying TanStack Query setup within your Jotai integration.* 

**Handling Suspense and Async Updates:**
- Wrap renders and updates that trigger async atom resolution in `act` (often `async act`).
- Use `findBy*` or `waitFor` from React Testing Library to wait for elements that appear asynchronously.

## Testing Custom Hooks

Use `renderHook` (from `@testing-library/react` v13.2+ or `@testing-library/react-hooks` for older versions) to test custom hooks that use Jotai hooks like `useAtom`.

```typescript
import { renderHook, act } from '@testing-library/react';
import { useAtom } from 'jotai';
import { countAtom } from './Counter.tsx';
// ... other imports

describe('useCounter hook (example)', () => {
  it('should return count and setter', () => {
    const { result } = renderHook(() => useAtom(countAtom));

    expect(result.current[0]).toBe(0); // Initial count
    expect(typeof result.current[1]).toBe('function'); // Setter function
  });

  it('should update count when setter is called', () => {
    const { result } = renderHook(() => useAtom(countAtom));

    act(() => {
      result.current[1](c => c + 1); // Call the setter
    });

    expect(result.current[0]).toBe(1); // Check updated count
  });
});
```
*Remember to wrap `renderHook` in `<Provider>` (potentially with initial values or a dedicated store) if the hook depends on atom values set elsewhere.* 

## Summary & Best Practices

- **Prefer testing user behavior** over implementation details.
- **Use `<Provider>` and `useHydrateAtoms` or `createStore`** for setting initial states in tests for *writable* atoms.
- **Mock the API layer (e.g., MSW)** when testing components/hooks using `atomWithQuery` or other data-fetching atoms. This is generally the most robust approach.
- **Use `act`, `findBy*`, `waitFor`** when dealing with async operations and suspense.
- **Isolate custom hooks** using `renderHook`.
- **Keep tests focused:** Test one scenario or behavior per test case. 