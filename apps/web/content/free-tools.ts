/**
 * Everything that is free and needs no account, in one place.
 *
 * The /free page had its own list and the header menu was about to get a
 * second. That split fails in one specific way, every time: a tool gets added
 * to the page and not to the menu, and the menu quietly becomes a smaller
 * product than the site actually has. Both read this now.
 *
 * Grouped by what somebody is trying to do rather than by what the tools are
 * called. "Ladder, CAD, HMI, Convert" is a list of four names that mean nothing
 * to a person who arrived from a search for free PLC software; "design and
 * prove it, hand it over, learn the thing" is the shape of the actual work, and
 * it can be read in three seconds by somebody who has never heard of LADX.
 *
 * The `query` on each entry is the search phrase it answers. It is on the page
 * on purpose. This audience arrives from exactly those phrases and the honest
 * thing is to say which one this tool is the answer to, rather than making them
 * infer it from a product name.
 */

export type FreeGroupId = "make" | "handover" | "learn";

export interface FreeGroupMeta {
  title: string;
  blurb: string;
}

export const FREE_GROUP_ORDER: FreeGroupId[] = ["make", "handover", "learn"];

export const FREE_GROUP_META: Record<FreeGroupId, FreeGroupMeta> = {
  make: {
    title: "Design and prove it",
    blurb: "Write the logic, draw the panel, build the screens, and run them.",
  },
  handover: {
    title: "Hand it over",
    blurb: "Get it out in the formats and documents a project is handed over in.",
  },
  learn: {
    title: "Learn it",
    blurb: "The reference, the reasoning, and somewhere to ask.",
  },
};

export interface FreeTool {
  href: string;
  /** Short, for the menu. */
  name: string;
  /** Fuller, for the page heading. */
  title: string;
  group: FreeGroupId;
  /** One line under the name in the menu. */
  menuLine: string;
  /** The search phrase this is the answer to. */
  query?: string;
  /** What it is, for the page. */
  what: string;
  /** What costs nothing. Omitted for the reading, where the question does not arise. */
  free?: string;
  /** What an account adds, said next to what it does not. */
  account?: string;
}

export const FREE_TOOLS: FreeTool[] = [
  {
    href: "/ladder",
    name: "Ladder editor",
    title: "Ladder editor and PLC simulator",
    group: "make",
    menuLine: "Draw ladder logic and watch it conduct, scan by scan",
    query: "free PLC programming software, online PLC simulator",
    what: "Draw ladder logic and run it. The simulator keeps a real output image, holds edge memory per instruction and counts timers in milliseconds rather than scans, so a rung behaves the way it would on a controller rather than the way a teaching tool pretends.",
    free: "Everything. Twenty three instructions, the tag table, the simulator, export.",
    account: "Saving to a project rather than to this browser, and AI generation.",
  },
  {
    href: "/hmi",
    name: "HMI and SCADA builder",
    title: "HMI and SCADA builder",
    group: "make",
    menuLine: "Operator screens on the ladder's own tags, with no tag limit",
    query: "free SCADA software, free HMI software",
    what: "Operator screens with eighty seven symbols and alarms following the ISA-18.2 state machine. It binds to the ladder editor's own tag table and runs against the same scan engine, so a start button on the glass starts the motor in the logic. Trends record and export as CSV, and the whole application exports as one HTML file that runs the screen with no install and no network.",
    free: "The builder, the symbols, the alarms, the runtime, the recording, the panel export, and no tag limit.",
    account: "A project to file it against, and drawing a screen from a description.",
  },
  {
    href: "/cad",
    name: "CAD",
    title: "CAD for panels and schematics",
    group: "make",
    menuLine: "Panel layouts and electrical schematics, with real drafting tools",
    query: "free online CAD, free electrical CAD software",
    what: "Two dimensional drafting for the electrical and panel drawings an automation project produces. Eleven templates numbered the way a control package is read, typed commands, object snap, dimensions, named layers, and panels you can move, resize and put away.",
    free: "The whole editor, and DXF and SVG export, so nothing is trapped here.",
    account:
      "Drawings that follow you between machines, filed against a project with its title block filled in.",
  },
  {
    href: "/convert",
    name: "Convert to Structured Text",
    title: "Ladder to Structured Text and SCL",
    group: "handover",
    menuLine: "Ladder out as ST, Siemens SCL, neutral text or PLCopen XML",
    query: "convert ladder to structured text",
    what: "Write a ladder program out as IEC 61131-3 Structured Text, Siemens SCL, Rockwell neutral text or PLCopen XML, with a report of what converted cleanly and what did not.",
    free: "All four outputs and the conversion report. It runs in the browser, so the program does not leave your machine.",
    account: "Nothing. This one is the same either way.",
  },
  {
    href: "/documents",
    name: "Document templates",
    title: "Automation project document templates",
    group: "handover",
    menuLine: "Seventeen project documents, downloadable without an account",
    query: "free automation project document templates",
    what: "The documents a control project is actually handed over with: functional design specifications, I/O schedules, test records, alarm schedules and the rest, as templates you can fill in rather than blank pages.",
    free: "All seventeen, downloadable without an account.",
    account: "Filling them in against a project, so the tags and the title block come from it.",
  },
  {
    href: "/resources",
    name: "The writing",
    title: "A hundred articles on the things that get asked",
    group: "learn",
    menuLine: "Scan cycles, timers, analogue scaling, safety, alarm rationalisation",
    query: "PLC programming explained",
    what: "Around a hundred articles on the questions that come up every week: what a scan cycle actually does, why a timer is not a delay, how analogue scaling goes wrong, what functional safety asks of you, and how alarm rationalisation is supposed to work.",
  },
  {
    href: "/forum",
    name: "Forum",
    title: "Somewhere to ask",
    group: "learn",
    menuLine: "Ask about a rung, a panel, a screen, or a standard",
    what: "Questions about a rung that will not latch, a drawing convention, a screen nobody can read at 3 am, or which standard actually applies.",
  },
  {
    href: "/help",
    name: "Help",
    title: "How the tools work",
    group: "learn",
    menuLine: "What each tool does, and how to get it to do it",
    what: "What each tool does and how to get it to do it, including the parts that are deliberately not obvious.",
  },
];

export function freeToolsIn(group: FreeGroupId): FreeTool[] {
  return FREE_TOOLS.filter((t) => t.group === group);
}

/**
 * The ones with a free-versus-account answer, which is what the page is about.
 *
 * Derived from whether the entry has that answer rather than from a separate
 * flag saying so. A flag would be a second thing to keep in step, and the first
 * time it disagreed the page would show an empty column under a heading.
 */
export const FREE_SOFTWARE = FREE_TOOLS.filter((t) => t.free !== undefined);
