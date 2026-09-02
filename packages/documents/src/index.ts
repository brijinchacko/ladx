/**
 * The document pack: templates, and turning one into a finished document.
 *
 * A package rather than three folders in the web app, because the desktop
 * produces the same deliverables and a handover pack assembled on a laptop in
 * a switchroom has to match one assembled in the office. It could move because
 * it was always pure: markdown to blocks, blocks to HTML, and a template
 * library that is data.
 *
 * What the web app kept and this does not is the database. The renderer used
 * to take Drizzle row types for the project, the client and the company, and
 * used seven fields between them; it takes those seven now, as plain shapes
 * any surface can supply. The desktop's come from a project folder rather than
 * from Postgres.
 */

export * from "./lib/doc-ast";
export * from "./lib/brief";
export * from "./lib/document";
export * from "./lib/status";

/*
 * The DOCX and PDF writers are deliberately not re-exported here.
 *
 * Both pull a large library, and `docx` in particular is written for Node: put
 * in a browser bundle it fails to parse, which took the whole page down rather
 * than only the button nobody had pressed. Anything importing this barrel for
 * a template or the markdown parser would have paid that price.
 *
 * Import them from "@ladx/documents/lib/render-pdf" and
 * "@ladx/documents/lib/render-docx", and on a client surface do it with a
 * dynamic import at the point somebody actually asks for the format.
 */
export * from "./templates";
export { default as DocumentEditor, type DocFormat } from "./components/document-editor";
