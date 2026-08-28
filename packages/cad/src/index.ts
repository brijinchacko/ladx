/**
 * CAD: panel layouts and electrical schematics.
 *
 * A package rather than a folder in the web app, because the desktop needs the
 * same editor and reaching into another app's `components/` is not a thing to
 * build on. Everything here is client side and always was, which is why it
 * could move at all: the drawing model, the snapping, the DXF and PDF writers
 * and the renderer never needed a server.
 *
 * What did need one is injected: where a drawing is stored and how one is
 * generated. See `CadStore` and `GenerateDrawing`.
 */

export { default as CadEditor } from "./components/cad-editor";
export * from "./lib/types";
export * from "./lib/commands";
export * from "./lib/operations";
export * from "./lib/drawing-templates";
export * from "./lib/dxf";
export * from "./lib/panels";
export * from "./lib/pdf";
export * from "./lib/render";
export * from "./lib/snap";
export * from "./lib/symbols";
export * from "./lib/theme";
export * from "./lib/titleblock";
