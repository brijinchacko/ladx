import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

/**
 * The package's own tests. Node, because the geometry, the DXF writer, the
 * command parser and the drawing templates are all pure: the canvas renderer
 * is the only part that needs a browser and it is exercised through the app.
 */
export default defineConfig({
  resolve: { alias: { "@ladx/cad": resolve(__dirname, "./src") } },
  test: { environment: "node" },
});
