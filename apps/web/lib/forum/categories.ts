/**
 * Forum categories.
 *
 * Configuration rather than table rows. Categories change when the product
 * changes, not when users post, so keeping them here means renaming one is a
 * deploy instead of a migration plus a backfill.
 *
 * The seed questions are real ones, taken from what gets asked repeatedly on
 * the existing automation forums. They are shown as prompts for what belongs in
 * each category, and they are never presented as posts by people who do not
 * exist: a forum that opens with invented threads and fake reply counts reads
 * as a lie, and this audience notices immediately.
 */

export interface ForumCategory {
  slug: string;
  name: string;
  blurb: string;
  /** Prompts, shown when a category is empty. Not fake threads. */
  prompts: string[];
}

export const CATEGORIES: ForumCategory[] = [
  {
    slug: "ladder-logic",
    name: "Ladder logic",
    blurb: "Rungs, timers, counters, seal-ins, and the scan-order problems that look like magic.",
    prompts: [
      "Why does my coil only work on the second scan?",
      "TON vs RTO for a machine hours meter, which and why?",
      "Seal-in versus a latch instruction, is there a real difference?",
      "One-shot rising edge, when do I actually need one?",
    ],
  },
  {
    slug: "platforms",
    name: "Platforms and vendors",
    blurb:
      "Siemens, Rockwell, Beckhoff, CODESYS, Mitsubishi. What differs, and what only appears to.",
    prompts: [
      "TIA Portal equivalent of a Rockwell Add-On Instruction?",
      "Why does my Siemens analog read 27648 instead of a percentage?",
      "Moving from RSLogix 500 to Studio 5000, what breaks?",
      "CODESYS on a Raspberry Pi for a real machine, sensible or not?",
    ],
  },
  {
    slug: "migration",
    name: "Migration and conversion",
    blurb: "Moving a program between platforms, and what does not survive the trip.",
    prompts: [
      "Converting an S7-300 program to S7-1500, what actually needs rewriting?",
      "Is there an honest way to convert ladder to Structured Text?",
      "PLCopen XML export, which vendors implement it properly?",
      "Legacy PLC5 to ControlLogix, how did yours go?",
    ],
  },
  {
    slug: "hmi-scada",
    name: "HMI and SCADA",
    blurb: "Screens, alarms, historians, and the conventions that make a panel readable at 3 am.",
    prompts: [
      "Alarm priorities, how do you decide what is High?",
      "High performance HMI, grey screens, is it worth the argument?",
      "Best practice for a screen hierarchy on a 10 inch panel?",
    ],
  },
  {
    slug: "safety",
    name: "Safety and standards",
    blurb: "ISO 13849, IEC 62061, IEC 61511, and reading a risk assessment honestly.",
    prompts: [
      "Category 3 versus Category 4, what changes in practice?",
      "Do I need a safety PLC or will a safety relay do?",
      "Measuring stopping time for a safety distance calculation",
      "Reset circuit that cannot be defeated by a taped button",
    ],
  },
  {
    slug: "commissioning",
    name: "Commissioning and troubleshooting",
    blurb: "On site, under pressure, with the plant waiting. What went wrong and what fixed it.",
    prompts: [
      "Analog input reads full scale, where do you start?",
      "Intermittent comms dropout on a PROFINET line",
      "The sequence hangs on one step and nobody can say why",
      "Earthing and screening, one end or both?",
    ],
  },
  {
    slug: "ai-and-tooling",
    name: "AI and tooling",
    blurb:
      "Where AI genuinely helps in automation, where it does not, and what you would not trust it with.",
    prompts: [
      "Would you let an LLM write a rung that goes to a real machine?",
      "Using AI for documentation rather than for code",
      "What does validated generation actually need to check?",
      "Version control for PLC projects, what works?",
    ],
  },
];

export function getCategory(slug: string): ForumCategory | undefined {
  return CATEGORIES.find((c) => c.slug === slug);
}

export const CATEGORY_SLUGS = CATEGORIES.map((c) => c.slug);
