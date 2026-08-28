/**
 * @ladx/studio, the LADX ladder workbench.
 *
 * Formerly "LADX Mini", built inside the Edwartens India CRM. Lifted out whole:
 * the scan engine, the series/parallel program model, the rung editor, the
 * simulator, and the PDF export. Nothing about it was CRM-specific except the
 * PDF's letterhead and one floating-window import, both of which are now
 * parameters rather than imports.
 *
 * Two audiences, one package. A student opens `LadxHome` and works through
 * exercises; the LADX web app mounts `LadxStudio` as the canvas an AI writes
 * rungs onto. The teaching surfaces (`LadxExercises`, `LadxMarking`) are
 * optional, import them or don't.
 *
 * The engine is deliberately pure: `scan()` takes state and returns state, with
 * no React, no DOM, and no clock of its own. That is what lets the same code run
 * the browser canvas today and verify a conversion inside the Rust core later.
 */

/* ── Program model ──────────────────────────────────────────────────── */
export type {
  Element,
  ElementType,
  Rung,
  Routine,
  LadxProgram,
  Tag,
  TagType,
  DeviceKind,
} from "./lib/types";
export {
  DEVICE_LABEL,
  INPUT_DEVICES,
  OUTPUT_DEVICES,
  defaultDevice,
  INSTRUCTION_BY_TYPE,
  INSTRUCTIONS,
  programRoutines,
} from "./lib/types";

/* ── Scan engine ────────────────────────────────────────────────────── */
export { scan, resetTags, seedPresets, validate } from "./lib/engine";
export type { ScanResult, ElementResult } from "./lib/engine";

/* ── Series/parallel tree ───────────────────────────────────────────── */
export * from "./lib/tree";

/* ── Supporting libs ────────────────────────────────────────────────── */
export * from "./lib/addressing";
export * from "./lib/portable";
export { emptyProgram, STARTER_PROGRAMS, STARTER_BY_KEY } from "./lib/starters";
export { localStorageStorage, httpStorage, KEY_PREFIX as PROJECT_KEY_PREFIX } from "./lib/storage";
export { useFocusMode, focusModeLabel } from "./lib/focus-mode";
export type { FocusMode, FocusModeApi } from "./lib/focus-mode";
export * from "./lib/dock";
export { parseL5X, parseNeutralRung, resetImportIds } from "./lib/import-l5x";
export { parsePlcopenXml } from "./lib/import-plcopen";
export { readProgramFile, refusalFor, READABLE_ACCEPT } from "./lib/import-any";
export type { ReadResult, ReadFailure } from "./lib/import-any";
export type { ImportedProgram, ImportNote, ImportSeverity } from "./lib/import-l5x";
export { DockPanel, DockStrip } from "./components/DockPanel";
export type { StudioStorage, StudioProject } from "./lib/storage";
export { LADX_BRANDING } from "./lib/branding";
export type { Branding } from "./lib/branding";

/* ── Surfaces ───────────────────────────────────────────────────────── */
export { default as LadxStudio } from "./components/LadxStudio";
export { default as LadxHome } from "./components/LadxHome";
export { default as LadxWindow } from "./components/LadxWindow";

/*
 * The chrome, shared.
 *
 * The menu bar and the context menu are not ladder-specific: they are the
 * arrangement every PLC IDE uses, and CAD is another tool in the same
 * workbench. A second implementation would drift, and a drawing tool whose File
 * menu sits in a different order from the ladder editor's teaches nothing.
 */
export { default as MenuBar, type Menu, type MenuItem } from "./components/MenuBar";
export { default as LadxLogo } from "./components/LadxLogo";
export { default as LadderPreview } from "./components/LadderPreview";

/* ── Teaching surfaces (optional) ───────────────────────────────────── */
export { default as LadxExercises } from "./components/LadxExercises";
export { default as LadxMarking } from "./components/LadxMarking";

/* ── Conversion ─────────────────────────────────────────────────────── */
//
// Taking a program out to another platform. Every target reports what did not
// survive the trip, because ladder carries geometry that text cannot.
export {
  TARGETS,
  convert,
  summarise,
  toNeutralText,
  toPlcopenXml,
  toStructuredText,
} from "./lib/convert";
export type { ConversionNote, ConversionResult, Severity, Target } from "./lib/convert";

// Studio tools. Both are presentational given their data, so the web reads it
// from Postgres and the desktop from its local SQLite, and neither the scan
// engine nor the converter is implemented twice.
export { default as Monitor, type ProgramSource, type SaveRecord } from "./components/Monitor";
export { default as ConvertWorkbench, type ConvertSource } from "./components/ConvertWorkbench";
