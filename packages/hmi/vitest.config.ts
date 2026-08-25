import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

/**
 * The package's own tests. Node by default, because the model, the alarm
 * engine and the expression parser are pure; the SVG sanitiser asks for a DOM
 * with a `@vitest-environment jsdom` comment of its own.
 */
export default defineConfig({
  resolve: { alias: { "@ladx/hmi": resolve(__dirname, "./src") } },
  test: { environment: "node" },
});
