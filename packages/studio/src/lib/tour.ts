/**
 * The guided tour.
 *
 * Anchored to elements by a data-tour attribute rather than by position, so
 * moving a button does not silently point the tour at empty space. A step
 * whose anchor is missing is skipped at runtime instead of leaving a bubble
 * floating in a corner: and the test asserts every anchor exists in the
 * studio, so that skip should never actually fire.
 *
 * It can be left at any point. A tour that traps somebody is worse than no
 * tour, because the person came here to draw a rung.
 */

export type TourStep = {
  id: string;
  /** data-tour value of the element to point at. Empty = centred, no anchor. */
  anchor: string;
  title: string;
  text: string;
  /** Which side of the anchor the bubble sits on. */
  place?: "top" | "bottom" | "left" | "right";
  /** Read more, into the manual. */
  topic?: string;
};

export const TOUR: [TourStep, ...TourStep[]] = [
  {
    id: "welcome",
    anchor: "",
    title: "Welcome to LADX Mini",
    text: "This is a ladder logic editor and a simulated PLC. Two minutes here and you will know where everything is. You can leave at any point, the Skip button is always there, and the tour is on the toolbar whenever you want it back.",
    topic: "start",
  },
  {
    id: "tree",
    anchor: "panel-tree",
    title: "Your project",
    text: "Routines, the tag table and the simulator. Main is the routine the controller runs; others run only when a JSR calls them. Right-click anything here for what you can do with it.",
    place: "right",
    topic: "project-tree",
  },
  {
    id: "canvas",
    anchor: "canvas",
    title: "The ladder",
    text: "Each network is a rung. Power flows from the left rail through the conditions; if it reaches the right, the outputs come on. Networks run top to bottom, every scan.",
    place: "top",
    topic: "rungs",
  },
  {
    id: "instructions",
    anchor: "panel-instructions",
    title: "Instructions",
    text: "Contacts, coils, timers, compare and maths, grouped as you would find them on a real IDE. Drag one onto a rung, or click a gap in the rung and then click the instruction.",
    place: "top",
    topic: "instructions",
  },
  {
    id: "io",
    anchor: "panel-io",
    title: "Tags and I/O",
    text: "Every instruction reads or writes a named tag. Tick a tag as an input to get a switch you can operate, or as an output to get a lamp that follows your program.",
    place: "left",
    topic: "tags",
  },
  {
    id: "transfer",
    anchor: "transfer-group",
    title: "Compile, download, run",
    text: "Compile checks the program. Download transfers it into the controller, editor to PLC, which is the direction that catches everybody out. Then Simulate runs it.",
    place: "bottom",
    topic: "transfer",
  },
  {
    id: "messages",
    anchor: "panel-messages",
    title: "Messages",
    text: "Every compile result, warning, error and controller fault lands here with a time. When something does not behave, this is the first place to look.",
    place: "top",
    topic: "messages",
  },
  {
    id: "save",
    anchor: "save-group",
    title: "Saving",
    text: "Your work saves itself a moment after you stop typing, this tells you where it has got to. Projects are kept in the portal for three months, so export anything you want to keep for longer.",
    place: "bottom",
    topic: "saving",
  },
  {
    id: "layout",
    anchor: "view-menu",
    title: "Make it yours",
    text: "Every panel can be closed with the × on its title bar, and comes back from the strip along the bottom or from this menu. Drag the edges to resize. Reset layout undoes all of it.",
    place: "bottom",
    topic: "screen",
  },
  {
    id: "help",
    anchor: "help-menu",
    title: "The manual",
    text: "Every instruction, every panel and the mistakes people usually make, all searchable. Hovering anything in the editor tells you what it is and links to the right page. Press F1 at any time.",
    place: "bottom",
    topic: "start",
  },
];

const KEY = "ladx-tour-seen-v1";

/** Has this person already been through it? Used to offer it once, not nag. */
export function tourSeen(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return true; // Cannot tell: assume seen. Better silent than repeating.
  }
}

export function markTourSeen() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, "1");
  } catch {
    // Not worth interrupting anybody over.
  }
}
