# Deno Testing Guide

## Overview
Deno provides a built-in test runner that supports both JavaScript and TypeScript testing without requiring additional dependencies. The test runner offers fine-grained permission control and various testing features.

## Writing Tests

### Basic Test Structure
```ts
// Simple synchronous test
Deno.test("simple test", () => {
  const x = 1 + 2;
  assertEquals(x, 3);
});

// Async test
Deno.test("async test", async () => {
  const x = 1 + 2;
  await delay(100);
  assertEquals(x, 3);
});

// Test with configuration
Deno.test({
  name: "read file test",
  permissions: { read: true },
  fn: () => {
    const data = Deno.readTextFileSync("./somefile.txt");
    assertEquals(data, "expected content");
  },
});
```

### Assertion Styles
- Standard assertions using `assertEquals` from `jsr:@std/assert`
- Jest-style assertions using `expect` from `jsr:@std/expect`

```ts
import { expect } from "jsr:@std/expect";

Deno.test("expect style test", () => {
  const result = add(2, 3);
  expect(result).toBe(5);
});
```

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