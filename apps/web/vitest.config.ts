import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Vitest, taught the "@/" alias so tests can import app modules the same way
 * the app does. Without this a test importing "@/content/templates" fails to
 * resolve, and the pure logic in lib/ could not be unit tested at all.
 */
export default defineConfig({
  resolve: {
    alias: { "@": resolve(__dirname, ".") },
  },
  test: {
    // Node by default, because almost everything under test is pure. A file
    // that genuinely needs a DOM asks for one with a
    // `@vitest-environment jsdom` comment at the top, which keeps the fast
    // path fast rather than booting a DOM for 400 arithmetic tests.
    environment: "node",
  },
});
