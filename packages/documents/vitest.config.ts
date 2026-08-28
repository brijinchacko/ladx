import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

/** Node: the parser, the templates and the renderer are all pure. */
export default defineConfig({
  resolve: { alias: { "@ladx/documents": resolve(__dirname, "./src") } },
  test: { environment: "node" },
});
