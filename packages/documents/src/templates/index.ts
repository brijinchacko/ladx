import { ALARM_LIST, BOM, CABLE_SCHEDULE, CAUSE_EFFECT, IO_LIST, RATS } from "./registers";
import {
  CHANGE_CONTROL,
  HANDOVER,
  OM_MANUAL,
  RISK_ASSESSMENT,
  SOFTWARE_DESIGN,
} from "./safety-handover";
import { CONTROL_NARRATIVE, FDS, URS } from "./specification";
import { COMMISSIONING, FAT, SAT } from "./testing";
import type { DocTemplate, TemplateCategory } from "./types";

export type { DocTemplate, Placeholder, TemplateCategory, TemplateFile } from "./types";
export { PLACEHOLDER_DEFAULTS, PLACEHOLDER_LABELS, fillTemplate } from "./types";

/**
 * The template library, in project order.
 *
 * Deliberately ordered by when a project produces them rather than
 * alphabetically or by category: somebody arriving here at the start of a job
 * wants to know what comes first, and a list that opens with the alarm register
 * answers a question nobody asked yet.
 */
export const TEMPLATES: DocTemplate[] = [
  URS,
  FDS,
  CONTROL_NARRATIVE,
  SOFTWARE_DESIGN,
  IO_LIST,
  BOM,
  CABLE_SCHEDULE,
  CAUSE_EFFECT,
  RATS,
  ALARM_LIST,
  RISK_ASSESSMENT,
  FAT,
  COMMISSIONING,
  SAT,
  HANDOVER,
  OM_MANUAL,
  CHANGE_CONTROL,
];

/** Category order, again following the shape of a project rather than the alphabet. */
export const CATEGORY_ORDER: TemplateCategory[] = [
  "Specification",
  "Design",
  "Registers",
  "Safety",
  "Testing",
  "Handover",
];

export const CATEGORY_BLURB: Record<TemplateCategory, string> = {
  Specification: "What the client wants, and how the system will meet it.",
  Design: "How the software is built, so the next engineer can read it.",
  Registers: "The lists: signals, parts, cables, trips and alarms.",
  Safety: "Hazards, required performance levels, and the evidence.",
  Testing: "Proof that it works, on the bench and then on the plant.",
  Handover: "What the site keeps, and how changes are controlled afterwards.",
};

export function getTemplate(slug: string): DocTemplate | undefined {
  return TEMPLATES.find((t) => t.slug === slug);
}

export function templatesByCategory(category: TemplateCategory): DocTemplate[] {
  return TEMPLATES.filter((t) => t.category === category);
}

/** Total downloadable files, used in copy so the number is never stale. */
export function fileCount(): number {
  return TEMPLATES.reduce((n, t) => n + t.files.length, 0);
}
