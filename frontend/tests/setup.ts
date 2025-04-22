import { assertEquals } from "jsr:@std/assert@0.218.2";
import { afterEach, beforeEach, describe, it } from "jsr:@std/testing@0.218.2/bdd";

declare global {
  var describe: typeof describe;
  var it: typeof it;
  var beforeEach: typeof beforeEach;
  var afterEach: typeof afterEach;
  var assertEquals: typeof assertEquals;
}

// Make test functions globally available
globalThis.describe = describe;
globalThis.it = it;
globalThis.beforeEach = beforeEach;
globalThis.afterEach = afterEach;
globalThis.assertEquals = assertEquals;

// Add any other test setup here 