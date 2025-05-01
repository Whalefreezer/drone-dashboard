# Deno Testing Guide

## Overview
Deno provides a built-in test runner that supports both JavaScript and TypeScript testing without requiring additional dependencies like Node.js test runners often do. The test runner offers fine-grained permission control and various testing features.

## Writing Tests

### Test Structure Styles

**1. Using `Deno.test`:**
The built-in `Deno.test` function is the standard way to define tests.

```ts
import { assertEquals } from "@std/assert";
import { delay } from "@std/async/delay";

// Simple synchronous test
Deno.test("simple test", () => {
  const x = 1 + 2;
  assertEquals(x, 3);
});

// Async test
Deno.test("async test", async () => {
  const x = 1 + 2;
  await delay(100); // Assuming delay is imported
  assertEquals(x, 3);
});

// Test with configuration
Deno.test({
  name: "read file test",
  permissions: { read: true },
  fn: () => {
    const data = Deno.readTextFileSync("./somefile.txt"); // Ensure file exists or mock
    assertEquals(data, "expected content");
  },
});
```

**2. Using BDD (`describe`, `it`):**
For a Behavior-Driven Development style similar to Jest or Mocha, import functions from `@std/testing/bdd`. This is common when working with UI testing libraries like `@testing-library/react`.

```ts
import { describe, it, beforeAll, afterEach } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";

// Assume myFunc and myAsyncFunc are defined elsewhere
declare function myFunc(): string;
declare function myAsyncFunc(): Promise<string>;


describe("My Module", () => {
  beforeAll(() => { /* Setup logic */ });
  afterEach(() => { /* Teardown logic */ });

  it("should do something", () => {
    const result = myFunc();
    assertEquals(result, "expected");
  });

  it("should do something else async", async () => {
    const result = await myAsyncFunc();
    assertEquals(result, "other_expected");
  });
});
```
*Note: When using the BDD style, you still run tests using the standard `deno test` command.*


### Assertion Libraries & Styles
Deno offers flexibility in assertion libraries. The two primary choices from the standard library are:

1.  **`@std/assert`:** Provides traditional assertion functions like `assertEquals`, `assertExists`, `assertMatch`, etc. It's straightforward and often sufficient for many tests.
    ```ts
    import { assertEquals } from "@std/assert";

    Deno.test("std/assert style test", () => {
      const x = 1 + 2;
      assertEquals(x, 3);
    });
    ```

2.  **`@std/expect`:** Offers a Jest-like `expect` API (`.toBe()`, `.toEqual()`, `.toMatch()`, etc.). Requires importing `expect` and potentially related matchers.
    ```ts
    import { expect } from "@std/expect";
    // import { ... } from "@std/expect/expect"; // For specific matchers if needed

    // Assume add is defined elsewhere
    declare function add(a: number, b: number): number;

    Deno.test("std/expect style test", () => {
      const result = add(2, 3);
      expect(result).toBe(5);
    });
    ```
*Note: You can also use other assertion libraries (like Chai) imported via `npm:` specifiers if preferred.*

## Running Tests

### Command Line Usage
```bash
# Run all tests in current directory and subdirectories
deno test

# Run tests in specific directory
deno test util/

# Run specific test file
deno test my_test.ts

# Run tests in parallel
deno test --parallel

# Pass arguments to test file
deno test my_test.ts -- -e --foo --bar

# Run with permissions
deno test --allow-read my_test.ts
```

### Test Steps
Tests can be broken down into smaller steps for better organization:

```ts
Deno.test("database operations", async (t) => {
  using db = await openDatabase();
  await t.step("insert user", async () => {
    // Insert user logic
  });
  await t.step("insert book", async () => {
    // Insert book logic
  });
});
```

## Test Filtering

### Command Line Filtering
```bash
# Filter by string
deno test --filter "my"  # Runs tests containing "my"

# Filter by pattern
deno test --filter "/test-*\d/"  # Runs tests matching regex pattern
```

### Configuration File Filtering
```json
{
  "test": {
    "include": [
      "src/fetch_test.ts",
      "src/signal_test.ts"
    ],
    "exclude": ["out/"]
  }
}
```

## Test Selection Features

### Ignoring Tests
```ts
// Using ignore option
Deno.test({
  name: "do macOS feature",
  ignore: Deno.build.os !== "darwin",
  fn() {
    // macOS specific test
  },
});

// Using ignore function
Deno.test.ignore("my test", () => {
  // test code
});
```

### Running Specific Tests
```ts
// Using only option
Deno.test({
  name: "Focus on this test only",
  only: true,
  fn() {
    // test code
  },
});

// Using only function
Deno.test.only("my test", () => {
  // test code
});
```

## Sanitizers

### Resource Sanitizer
Ensures all I/O resources are properly closed:

```ts
// Example of proper resource handling
const file = await Deno.open("hello.txt");
try {
  // Use file
} finally {
  file.close();
}

// Disable resource sanitizer
Deno.test({
  name: "leaky resource test",
  sanitizeResources: false,
  async fn() {
    // Test code
  },
});
```

### Async Operation Sanitizer
Ensures all async operations complete before test ends:

```ts
// Disable async operation sanitizer
Deno.test({
  name: "leaky operation test",
  sanitizeOps: false,
  fn() {
    // Test code
  },
});
```

### Exit Sanitizer
Prevents false test success through `Deno.exit()`:

```ts
Deno.test({
  name: "exit test",
  sanitizeExit: false,
  fn() {
    // Test code
  },
});
```

## Permission Testing

### Permission Configuration
```ts
Deno.test({
  name: "permission test",
  permissions: {
    read: true,  // Grant all read permissions
    read: ["./data", "./config"],  // Grant specific read permissions
    write: false,  // Deny write permissions
    net: ["example.com:443"],  // Allow specific network access
    env: ["API_KEY"],  // Allow specific env variables
    run: false,  // Deny subprocess execution
    ffi: false,  // Deny dynamic libraries
    hrtime: false,  // Deny high-resolution time
  },
  fn() {
    // Test code
  },
});
```

### Running Tests with Permissions
```bash
deno test --allow-read  # Grant read permissions
```

## Best Practices

1. Always close resources properly in tests
2. Await all async operations
3. Use test steps for complex test scenarios
4. Properly configure permissions for each test
5. Use sanitizers to catch resource leaks and async issues
6. Consider using snapshot testing for complex data structures
7. Write both positive and negative permission tests

## Additional Features

- Snapshot testing available through Deno Standard Library
- Documentation testing support
- Built-in test reporters
- Coverage analysis tools
- Support for behavior-driven development 

## Snapshot Testing
Deno's standard library provides snapshot testing capabilities via `@std/testing/snapshot`. This is useful for asserting against complex data structures or rendered UI components, ensuring they don't change unexpectedly.

```ts
import { snapshot } from "@std/testing/snapshot";
import { describe, it } from "@std/testing/bdd"; // Assumes BDD style

// Example using BDD style test context
describe("My Component/Function", () => {
  it("should match the data snapshot", async (t) => { // `t` is the test context
    const data = { complex: "object", value: 123, nested: { arr: [1, 2] } };
    await snapshot(t, data);
  });

  // Example with React component rendering (requires DOM setup, see below)
  // it("should match the component snapshot", async (t) => {
  //   const { container } = render(<MyComponent />); // Assumes render is imported
  //   await snapshot(t, container.innerHTML);
  // });
});

// Example using Deno.test context
Deno.test("Snapshot with Deno.test", async (t) => {
    const otherData = ["item1", "item2"];
    await snapshot(t, otherData);
});

```

**Running Snapshot Tests:**
- First run: `deno test --allow-read --allow-write` (to create `__snapshots__` directory and `.snap` files)
- Subsequent runs: `deno test --allow-read`
- Update snapshots: `deno test -u --allow-read --allow-write` or `deno test --update --allow-read --allow-write`

*Note: Snapshot testing requires write permissions on the first run and to update snapshots. Ensure your test function accepts the test context (`t`) argument.*

## Testing React Components
Testing React components in Deno often involves `@testing-library/react` and requires a DOM environment setup, as Deno itself doesn't have a native DOM.

**1. Setup:**
Create a setup file (e.g., `tests/test_setup.ts`) to initialize a DOM environment using `jsdom` before tests run.
```ts
// tests/test_setup.ts
import { cleanup } from "@testing-library/react";
import { beforeAll, afterEach, afterAll } from "@std/testing/bdd"; // Use BDD hooks
import { JSDOM } from "jsdom"; // Import via jsr: or npm: in deno.json

// Simulate a DOM environment using JSDOM
beforeAll(() => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/", // Necessary for some DOM features
  });

  // @ts-ignore: Assign JSDOM globals to Deno's globalThis
  globalThis.document = dom.window.document;
  globalThis.window = dom.window as unknown as Window & typeof globalThis; // Cast needed
  globalThis.navigator = dom.window.navigator;
  globalThis.Event = dom.window.Event; // Ensure Event is available
  // Add other globals like CustomEvent, HTMLElement etc. if needed by your tests or libraries
  globalThis.CustomEvent = dom.window.CustomEvent;
  globalThis.HTMLElement = dom.window.HTMLElement;
});

// Clean up Testing Library's rendered components after each test
afterEach(() => {
  cleanup();
});

// Optional: Close JSDOM window after all tests to free resources
afterAll(() => {
  // @ts-ignore: Close the window if it exists
  globalThis.window?.close();
});
```
*Ensure `jsdom` is added to your `deno.json` import map (e.g., `"jsdom": "npm:jsdom@^24"`).*

**2. Import Setup:**
Import this setup file **at the very top** of your test files, before any React or Testing Library imports.
```ts
// my_component.test.tsx
import "../tests/test_setup.ts"; // MUST be the first import

import { render, screen } from "@testing-library/react";
import { describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";
import { snapshot } from "@std/testing/snapshot"; // If using snapshots
import MyComponent from "./MyComponent.tsx"; // Your component import
```

**3. Writing Tests:**
Use Testing Library's queries (`getByText`, `getByRole`, `screen`, etc.) and standard Deno assertions (`@std/assert` or `@std/expect`).
```ts
// Assume MyComponent takes a title prop
declare function MyComponent(props: { title: string }): JSX.Element;

describe("MyComponent", () => {
  it("should render the title passed as prop", () => {
    render(<MyComponent title="Test Title" />);

    // Use screen queries from @testing-library/react
    const titleElement = screen.getByRole("heading", { name: /test title/i });

    // Use assertEquals from @std/assert
    assertEquals(titleElement instanceof globalThis.HTMLElement, true); // Check if it's a valid element
    assertEquals(titleElement.textContent, "Test Title"); // Check content
  });

  // Snapshot test example (using the snapshot setup from above)
  it("should match the component snapshot", async (t) => { // Pass test context 't'
     const { container } = render(<MyComponent title="Another Title" />);
     // Snapshot the rendered HTML
     await snapshot(t, container.innerHTML);
  });
});
```
**4. Running Tests:**
Run tests using `deno test`. You will likely need `--allow-read` (for imports, snapshots) and potentially `--allow-env` or other permissions depending on your setup and component logic.
```bash
deno test --allow-read --allow-env # Add --allow-write for initial snapshot creation/updates
``` 