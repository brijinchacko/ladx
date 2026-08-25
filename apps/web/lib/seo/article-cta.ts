import type { Topic } from "@/content/posts";

/**
 * Where an article sends the reader.
 *
 * Every article used to end with the same invitation to open the ladder
 * editor, whatever it was about. Somebody who has just read eight minutes on
 * ISA-101 screen design is being offered a rung canvas, and somebody reading
 * about GAMP 5 validation is being offered one too. Both close the tab.
 *
 * Two reasons to fix it, and the second is the one that shows up in a rank
 * report. The obvious one is that a relevant offer converts and an irrelevant
 * one does not. The less obvious one is that internal links from a topic
 * cluster to the page that serves that topic are what tells a search engine
 * the two are about the same thing. A hundred articles all pointing at one
 * page tells it nothing except that the page is linked a lot.
 *
 * The rule for adding to this: the copy has to be true of the tool and true of
 * the article. An invitation that does not follow from what was just read is
 * worse than none, because this audience notices.
 */
export interface ArticleCta {
  heading: string;
  body: string;
  href: string;
  label: string;
}

const LADDER: ArticleCta = {
  heading: "Try it rather than read about it",
  body: "The LADX simulator keeps the output image, remembers edges per instruction and counts timers in milliseconds, so the behaviour described above is the behaviour you get. It runs in the browser with no account.",
  href: "/ladder",
  label: "Open Ladder",
};

const BY_TOPIC: Partial<Record<Topic, ArticleCta>> = {
  Fundamentals: LADDER,
  Instructions: LADDER,
  Languages: LADDER,

  Safety: {
    heading: "The rung, checked the right way round",
    body: "A stop button is wired normally closed, so it reads true when healthy and is examined with a normally open contact. Getting it backwards is a safety defect rather than a style choice, and it is the thing a language model most often writes wrong. LADX refuses it rather than drawing it.",
    href: "/products/chat",
    label: "How the checking works",
  },

  "HMI & SCADA": {
    heading: "Build the screen against the real tags",
    body: "LADX HMI binds to the ladder program's own tag table rather than a second list kept in step by hand, so a screen cannot reference a tag the program renamed. Pick the panel, draw the mimic, define the alarms, and press run against the logic.",
    href: "/products/hmi",
    label: "See the HMI builder",
  },

  Networking: {
    heading: "Record the connection rather than describe it",
    body: "LADX records the driver settings as part of the design: protocol, endpoint, rack and slot, unit id, poll rate and word order. Configured and handed over rather than dialled, because word order discovered on site is a commissioning day nobody enjoys.",
    href: "/products/hmi",
    label: "See how it is recorded",
  },

  "Drives & Motion": {
    heading: "Watch the logic before the panel exists",
    body: "Monitor runs a saved program at scan speed, lets you force the inputs and shows every tag changing. A bench test you can do before anybody books the panel shop, which is where most of what a FAT finds could have been found.",
    href: "/products/monitor",
    label: "See Monitor",
  },

  Instrumentation: {
    heading: "The loop, on the drawing",
    body: "LADX CAD opens on a finished sheet rather than an empty one: eleven templates numbered the way a control package is read, including the PLC analogue card sheet where a loop like this ends up.",
    href: "/products/cad",
    label: "See the drawing templates",
  },

  "Panel & Electrical": {
    heading: "The panel drawings, on the same project",
    body: "Eleven working templates from cover and index through power distribution and the panel general arrangement to the terminal schedule, with typed commands, object snap and dimensions. On the same project as the logic, so the client name is changed once.",
    href: "/products/cad",
    label: "See LADX CAD",
  },

  Compliance: {
    heading: "The documents this asks for, already written",
    body: "Seventeen templates across specification, design, registers, safety, testing and handover, with the tables and sign-off blocks in them. Free to download with no account, and they fill from your project rather than being typed a second time.",
    href: "/documents",
    label: "Browse the templates",
  },

  Migration: {
    heading: "Move it between platforms",
    body: "LADX writes ladder out as IEC 61131-3 Structured Text, Siemens SCL, Rockwell neutral text or PLCopen XML, with a report of what converted cleanly and what did not. It runs in the browser, so the program does not leave your machine.",
    href: "/convert",
    label: "Open Convert",
  },

  Platforms: {
    heading: "One representation, every output",
    body: "Ladder is held in one intermediate representation based on PLCopen TC6 and written out to four formats, which is why adding a vendor gives every other vendor a new destination.",
    href: "/products/convert",
    label: "See Convert",
  },

  AI: {
    heading: "Generated, then refused if it is wrong",
    body: "Every program LADX writes goes through a real IEC 61131-3 compiler and the editor's own validator before it reaches the canvas, and the errors go back to the model rather than to you. That is also why a small free model is good enough to be useful.",
    href: "/products/chat",
    label: "See how it is checked",
  },

  Practice: {
    heading: "The job around the code",
    body: "A LADX project holds the design basis, the drawings, the programs and the documents, and knows which phase it is in. The plan comes from the deliverables the job actually owes rather than from a blank page.",
    href: "/products/projects",
    label: "See Projects",
  },
};

export function ctaFor(topic: Topic): ArticleCta {
  return BY_TOPIC[topic] ?? LADDER;
}
