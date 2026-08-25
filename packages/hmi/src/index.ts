/**
 * The HMI builder, as a package.
 *
 * Lifted out of apps/web so the desktop build can use it. Nothing in here
 * reaches for the network or for a route: persistence and navigation arrive as
 * props, because the two surfaces store an application in completely different
 * places. The web PUTs it at an API route; the desktop writes it to local
 * SQLite through Tauri and is forbidden from making an HTTP call at all.
 */

/* the model */
export * from "./lib/types";
export * from "./lib/panels";
export * from "./lib/panels-layout";
export * from "./lib/history";

/* the engines */
export * from "./lib/alarms";
export * from "./lib/alarm-bulk";
export * from "./lib/expression";
export * from "./lib/runtime";
export * from "./lib/svg-import";
export * from "./lib/generate";

/* the drawings */
export * from "./lib/symbols";
export { EXTRA_SYMBOLS } from "./lib/symbols-extra";
export { hasRealistic, drawRealistic, shade, REALISTIC_IDS } from "./lib/symbols-realistic";

/* the editor */
export { default as HmiAi } from "./components/hmi-ai";
export { default as HmiEditor } from "./components/hmi-editor";
export type { HmiEditorProps, SaveApplication } from "./components/hmi-editor";
export { default as HmiHome } from "./components/hmi-home";
export type { HmiRow, CreateApplication } from "./components/hmi-home";
export { default as WidgetView } from "./components/widget-view";
export { default as AlarmPopup } from "./components/alarm-popup";
