// The tools, in groups, defined once.
//
// This existed twice before in effect: the sidebar held a flat array of ten,
// and the project page linked to three of them by hand. So a tool added to the
// sidebar did not appear on a project, and four tools (Commissioning,
// Schedules, Monitor, Standards) had exactly one inbound link in the whole
// application, which was the sidebar itself. They were reachable only by
// somebody who already knew they were there.
//
// The grouping is the other half. Ten tools in one list is not a list, it is a
// pile: nothing in it says what to do first or which of them relate. The four
// groups here answer "what am I doing", which is the question somebody actually
// has, rather than "what kind of software is this", which they do not.
//
// `scoped` marks the tools that work on one program. Those are the ones worth
// carrying a project into, and the ones a project page should offer.

export type ToolGroup = "build" | "check" | "library";

export interface Tool {
  href: string;
  label: string;
  /** One line, in the words somebody would use for it. */
  about: string;
  group: ToolGroup;
  /** Icon name from lucide-react, resolved by the caller. */
  icon: string;
  /**
   * Whether the tool works on a single program, and so takes `?project=`.
   *
   * An unscoped tool is not lesser; it is about the account rather than about
   * one job. Standards are the company's rules and Knowledge is its reference
   * shelf, and carrying a project into either would suggest they differ per
   * project when they do not.
   */
  scoped: boolean;
}

export const GROUPS: { id: ToolGroup; label: string; about: string }[] = [
  { id: "build", label: "Build", about: "Writing the program and the things around it" },
  { id: "check", label: "Check", about: "Reading it back, and proving it holds up" },
  { id: "library", label: "Library", about: "What is written down" },
];

export const TOOLS: Tool[] = [
  {
    href: "/studio/ladder",
    label: "Ladder",
    about: "Write and edit the logic",
    group: "build",
    icon: "Grid2x2Check",
    scoped: true,
  },
  {
    href: "/studio/convert",
    label: "Convert",
    about: "Bring in an L5X or SCL file, or write one out",
    group: "build",
    icon: "GitCompareArrows",
    scoped: true,
  },
  {
    href: "/studio/hmi",
    label: "HMI/SCADA",
    about: "Operator screens for this program",
    group: "build",
    icon: "MonitorCog",
    scoped: true,
  },
  {
    href: "/studio/cad",
    label: "CAD",
    about: "Panel and wiring drawings",
    group: "build",
    icon: "PencilRuler",
    scoped: true,
  },
  {
    href: "/studio/monitor",
    label: "Monitor",
    about: "Watch the logic run",
    group: "check",
    icon: "Activity",
    scoped: true,
  },
  {
    href: "/studio/schedules",
    label: "Schedules",
    about: "The I/O list and the alarm list, read out of the program",
    group: "check",
    icon: "Cable",
    scoped: true,
  },
  {
    href: "/studio/commission",
    label: "Commissioning",
    about: "Sequence, acceptance tests, tag comparison and the handover pack",
    group: "check",
    icon: "ClipboardCheck",
    scoped: true,
  },
  {
    href: "/studio/standards",
    label: "Standards",
    about: "Your company's rules, and which apply",
    group: "check",
    icon: "Ruler",
    scoped: false,
  },
  {
    href: "/studio/documents",
    label: "Documents",
    about: "Written deliverables",
    group: "library",
    icon: "Library",
    scoped: true,
  },
  {
    href: "/studio/knowledge",
    label: "Knowledge",
    about: "Reference material the assistant can draw on",
    group: "library",
    icon: "FileText",
    scoped: false,
  },
];

/** The tools in one group, in order. */
export function toolsIn(group: ToolGroup): Tool[] {
  return TOOLS.filter((t) => t.group === group);
}

/** The tools that work on one program, which are the ones a project offers. */
export function scopedTools(): Tool[] {
  return TOOLS.filter((t) => t.scoped);
}

/**
 * A tool's link, carrying the project where the tool can use it.
 *
 * Adding `?project=` to a tool that ignores it would be worse than leaving it
 * off: the URL would promise a context the page then fails to honour, and the
 * user would be looking at a different program from the one they clicked from.
 */
export function toolHref(tool: Tool, projectId?: string | null): string {
  if (!projectId || !tool.scoped) return tool.href;
  return `${tool.href}?project=${projectId}`;
}
