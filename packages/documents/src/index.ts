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
export * from "./lib/render-docx";
export * from "./lib/render-pdf";
export * from "./templates";
export { default as DocumentEditor } from "./components/document-editor";
