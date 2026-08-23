export type ProductState = "live" | "building" | "planned";

export type Product = {
  slug: string;
  name: string;
  tagline: string;
  state: ProductState;
  /** One paragraph for the overview page. */
  summary: string;
  /** The problem, stated as the engineer would state it. */
  problem: string;
  /** What it does, in specifics rather than adjectives. */
  does: { h: string; p: string }[];
  /** Honest limits. Every product has them; hiding them costs more than it saves. */
  limits: string[];
  figure: "sealIn" | "irHub" | "validation" | "scan";
};

export const PRODUCTS: Product[] = [
  {
    slug: "studio",
    name: "Studio",
    tagline: "Draw a rung. Press run. Watch it conduct.",
    state: "live",
    summary:
      "A ladder editor with a scan-accurate simulator behind it. It is the canvas the AI writes onto, and it works entirely on its own with no account and no backend.",
    problem:
      "Learning or checking ladder logic normally means owning a licence and a controller, or using a simulator that solves rungs like equations and quietly teaches you the wrong model of how a PLC behaves.",
    does: [
      {
        h: "A real scan engine",
        p: "Output image, so a coil written after a contact was solved does not reach it until the next sweep. Edge memory per instruction, so a held button counts once. Timers on elapsed milliseconds rather than scan count.",
      },
      {
        h: "The instructions people actually use",
        p: "Contacts and coils, latch and unlatch, one-shots, TON/TOF/RTO, up and down counters, comparisons, move and maths, and JSR for calling another routine.",
      },
      {
        h: "Tags with addresses",
        p: "Every tag gets a plausible address, I0.0, Q0.1: and a device type, so the tag table looks like a tag table and the simulator can show you a panel with switches and lamps on it.",
      },
      {
        h: "It runs in the browser",
        p: "No install, no licence, no account. Projects save to the browser, and export to a file you keep.",
      },
    ],
    limits: [
      "It is a teaching and verification simulator, not a certification tool. It does not replace commissioning.",
      "It never connects to a physical controller, by design, and that will not change.",
      "Ladder only for now. Structured Text is read and written by the rest of the platform but not drawn here.",
    ],
    figure: "sealIn",
  },
  {
    slug: "chat",
    name: "Chat",
    tagline: "Ask for logic. Get logic that compiles.",
    state: "building",
    summary:
      "Describe what the machine should do and watch the rungs appear on the canvas. Every answer passes a real compiler before it reaches you, and failures go back to the model rather than to you.",
    problem:
      "General AI assistants write plausible PLC code. Plausible is not the bar when the code runs a machine, and reading it carefully enough to be sure takes about as long as writing it did.",
    does: [
      {
        h: "It writes onto the canvas, not into a chat bubble",
        p: "Answers arrive as rungs in Studio, editable, runnable, and yours. You can select a rung and ask what it does, or ask for a permissive to be added to it.",
      },
      {
        h: "Validated before display",
        p: "matiec compiles it, iec-checker analyses it, a PLCopen schema pass checks the structure. Anything that fails goes back to the model with the errors attached, and you never see the attempts.",
      },
      {
        h: "Any model, your key",
        p: "OpenRouter by default, including its free models, plus Anthropic, OpenAI, or any OpenAI-compatible endpoint including a local Ollama. LADX holds no shared key and meters nothing.",
      },
      {
        h: "It knows your project",
        p: "Tag names, existing routines, the target platform. Answers use the tags you already have rather than inventing new ones.",
      },
    ],
    limits: [
      "It drafts. Whether the interlock is sufficient for the hazard is an engineering judgement and stays with you.",
      "A compiler proves code is valid, not that it is correct. Simulation helps; it is not a safety case.",
      "Free models are rate-limited by the provider, not by us, the queue you occasionally hit is theirs.",
    ],
    figure: "validation",
  },
  {
    slug: "convert",
    name: "Convert",
    tagline: "Between platforms, and between languages.",
    state: "building",
    summary:
      "Read an L5X and write SCL. Turn ladder into structured text or back. Every conversion comes with a report of what moved cleanly and what did not.",
    problem:
      "Cross-vendor migration has no automated path at all, and same-vendor tools leave markers everywhere. Either way somebody reads every rung, and on a large program that is the whole schedule.",
    does: [
      {
        h: "One representation in the middle",
        p: "Nothing converts brand to brand. Everything is read into a PLCopen-based intermediate form and written out of it, so each new importer gains every existing export target for free.",
      },
      {
        h: "A conversion report, always",
        p: "Every element is marked: converted cleanly, converted with a semantic difference worth reading, or needs a decision. No silent guesses.",
      },
      {
        h: "Verified by simulation",
        p: "Source and target run side by side against generated test vectors. “94 of 96 cases identical, here are the two that differ” is a sentence you can put in front of a customer.",
      },
      {
        h: "Language transforms too",
        p: "Ladder to structured text is largely mechanical. Structured text to ladder needs judgement about how to group rungs, so the AI proposes and the report explains.",
      },
    ],
    limits: [
      "Bridged rungs, where a wire crosses between parallel branches, have no series/parallel form. They are refused and preserved rather than approximated.",
      "Anything unmapped stays as an annotated placeholder. It is never dropped, and never silently reinterpreted.",
      "Whole-project formats like .ACD and .ap1x need the desktop bridge and your own licensed IDE.",
    ],
    figure: "irHub",
  },
  {
    slug: "docs",
    name: "Documents",
    tagline: "The paperwork, from the code you already wrote.",
    state: "planned",
    summary:
      "Functional design specs, I/O schedules, control narratives and test protocols, generated from the project rather than typed a second time.",
    problem:
      "Documentation is the most disliked and most billable part of an integration project, it is written last, and it is out of date the moment somebody edits a rung.",
    does: [
      {
        h: "From the project, not from scratch",
        p: "The I/O list comes from the tags. The narrative comes from the rungs and their comments. Both regenerate when the program changes.",
      },
      {
        h: "Formats people outside engineering can open",
        p: "Word and PDF, laid out for reading rather than exported as a data dump.",
      },
      {
        h: "Templates you control",
        p: "House standards, customer-specific sections, and your own letterhead, not ours.",
      },
    ],
    limits: [
      "Generated documents need reviewing. They are a first draft that is right about the facts, not a finished submission.",
    ],
    figure: "scan",
  },
  {
    slug: "knowledge",
    name: "Knowledge",
    tagline: "Your manuals, answering questions.",
    state: "planned",
    summary:
      "Drop in the drive manual, the machine spec, the site standard. Ask questions against them and get answers with the page they came from.",
    problem:
      "The answer is almost always in a PDF somebody has. Finding which PDF, and which of its four hundred pages, is the actual work.",
    does: [
      {
        h: "Answers with citations",
        p: "Every claim points at the document and page it came from, because an unsourced answer about a torque limit is worse than no answer.",
      },
      {
        h: "Scoped per project",
        p: "One project's manuals never leak into another's answers, and nothing is used to train anything.",
      },
      {
        h: "Works with the rest",
        p: "Chat can search it while writing logic, so a generated rung can respect the limits in the drive manual.",
      },
    ],
    limits: [
      "It retrieves and quotes. It does not verify that the manual is the current revision, that is still on you.",
    ],
    figure: "scan",
  },
];

export function getProduct(slug: string) {
  return PRODUCTS.find((p) => p.slug === slug);
}

export const STATE_META: Record<ProductState, { label: string; cls: string }> = {
  live: { label: "Available now", cls: "border-teal-300 bg-teal-50 text-teal-700" },
  building: { label: "In build", cls: "border-ink-200 bg-ink-50 text-ink-600" },
  planned: { label: "Planned", cls: "border-ink-100 bg-white text-ink-400" },
};
