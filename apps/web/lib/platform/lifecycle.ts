import { getTemplate } from "@/content/templates";

/**
 * The automation project lifecycle.
 *
 * This is the standard control system integrator path, confirmed against how
 * projects actually run: capture what the client needs, design how it works,
 * build it, prove it on the bench, prove it on site, hand it over, then support
 * it. Each phase carries deliverables, and every deliverable is one of the
 * document templates the platform already has, so a project is not an abstract
 * status field: it is a checklist of real documents to produce, each of which
 * generates itself from the project, the client and the company.
 *
 * The order matters and is enforced in the UI: you cannot sensibly write a FAT
 * protocol before the FDS it tests against exists. The phases are a guide rather
 * than a lock, though, because real projects overlap and double back.
 */

export type PhaseId =
  | "requirements"
  | "design"
  | "development"
  | "factory_test"
  | "commissioning"
  | "handover"
  | "support"
  | "closed";

export interface Phase {
  id: PhaseId;
  /** The number shown to the user, 1-based. `closed` has none. */
  step: number | null;
  name: string;
  /** One line on what happens in this phase. */
  purpose: string;
  /** Template slugs produced in this phase, in the order you would write them. */
  deliverables: string[];
  /** Which of the five tools this phase leans on. */
  tools: ("ladder" | "chat" | "convert" | "knowledge" | "documents")[];
}

export const PHASES: Phase[] = [
  {
    id: "requirements",
    step: 1,
    name: "Requirements",
    purpose: "Capture what the client needs, in plant terms, before deciding how to build it.",
    deliverables: ["urs-user-requirement-specification"],
    tools: ["documents", "knowledge"],
  },
  {
    id: "design",
    step: 2,
    name: "Design",
    purpose: "Decide how the system works and what it is made of. The bulk of the paperwork.",
    deliverables: [
      "fds-functional-design-specification",
      "control-narrative",
      "io-list",
      "bom-bill-of-materials",
      "cable-schedule",
      "cause-and-effect-matrix",
      "rats-range-alarm-trip-schedule",
      "machinery-risk-assessment",
    ],
    tools: ["documents", "chat"],
  },
  {
    id: "development",
    step: 3,
    name: "Development",
    purpose: "Write the logic and the HMI. Draw rungs, generate them, convert an existing program.",
    deliverables: ["software-design-specification", "alarm-rationalisation"],
    tools: ["ladder", "chat", "convert", "documents"],
  },
  {
    id: "factory_test",
    step: 4,
    name: "Factory test",
    purpose: "Prove it on the bench with simulated I/O, before anything ships. This is the FAT.",
    deliverables: ["fat-factory-acceptance-test"],
    tools: ["documents"],
  },
  {
    id: "commissioning",
    step: 5,
    name: "Commissioning",
    purpose: "Install and prove it on site with real equipment. Commissioning checklist, then SAT.",
    deliverables: ["commissioning-checklist", "sat-site-acceptance-test"],
    tools: ["documents"],
  },
  {
    id: "handover",
    step: 6,
    name: "Handover",
    purpose: "The client takes it on. As-built pack, operating manual, training, sign-off.",
    deliverables: ["handover-pack", "om-manual"],
    tools: ["documents"],
  },
  {
    id: "support",
    step: 7,
    name: "Support",
    purpose: "The system is in service. Every change now runs through change control.",
    deliverables: ["change-control-record"],
    tools: ["documents", "knowledge"],
  },
  {
    id: "closed",
    step: null,
    name: "Closed",
    purpose: "The project is complete and archived.",
    deliverables: [],
    tools: [],
  },
];

export const ACTIVE_PHASES = PHASES.filter((p) => p.id !== "closed");

export function getPhase(id: PhaseId): Phase {
  return PHASES.find((p) => p.id === id) ?? (PHASES[0] as Phase);
}

/** Index of a phase in the ordered list, for "is this before that" comparisons. */
export function phaseIndex(id: PhaseId): number {
  return PHASES.findIndex((p) => p.id === id);
}

/** The phase after this one, or null at the end. */
export function nextPhase(id: PhaseId): Phase | null {
  const i = phaseIndex(id);
  return i >= 0 && i < PHASES.length - 1 ? (PHASES[i + 1] as Phase) : null;
}

export interface DeliverableView {
  slug: string;
  title: string;
  abbr: string;
  summary: string;
}

/** Resolve a phase's deliverable slugs to the template metadata behind them. */
export function deliverablesFor(phase: PhaseId): DeliverableView[] {
  return getPhase(phase)
    .deliverables.map((slug) => {
      const t = getTemplate(slug);
      return t ? { slug: t.slug, title: t.title, abbr: t.abbr, summary: t.summary } : null;
    })
    .filter((d): d is DeliverableView => d !== null);
}

/** Every deliverable across the whole lifecycle, for a project overview. */
export function allDeliverables(): { phase: Phase; items: DeliverableView[] }[] {
  return ACTIVE_PHASES.map((phase) => ({ phase, items: deliverablesFor(phase.id) }));
}
