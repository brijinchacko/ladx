/**
 * @ladx/studio — the LADX ladder workbench.
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
 * optional — import them or don't.
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
export { LADX_BRANDING } from "./lib/branding";
export type { Branding } from "./lib/branding";

/* ── Surfaces ───────────────────────────────────────────────────────── */
export { default as LadxStudio } from "./components/LadxStudio";
export { default as LadxHome } from "./components/LadxHome";
export { default as LadxWindow } from "./components/LadxWindow";
export { default as LadxLogo } from "./components/LadxLogo";
export { default as LadderPreview } from "./components/LadderPreview";

/* ── Teaching surfaces (optional) ───────────────────────────────────── */
export { default as LadxExercises } from "./components/LadxExercises";
export { default as LadxMarking } from "./components/LadxMarking";
