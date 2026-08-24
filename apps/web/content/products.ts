export type ProductState = "live" | "building" | "planned";

/**
 * The three things a job is made of, in the order it is made.
 *
 * The grouping exists for the mega menu, where eight flat entries would be a
 * list to read rather than a shape to recognise. It follows the working day:
 * you write the logic, you draw and prove the panel, then you ship the project
 * and the paperwork that goes with it.
 */
export type ProductGroup = "logic" | "panel" | "project";

export type Product = {
  slug: string;
  name: string;
  tagline: string;
  state: ProductState;
  group: ProductGroup;
  /** One line for the menu, where there is room for about ten words and no more. */
  menuLine: string;
  /** One paragraph for the overview page. */
  summary: string;
  /** The problem, stated as the engineer would state it. */
  problem: string;
  /** What it does, in specifics rather than adjectives. */
  does: { h: string; p: string }[];
  /** Honest limits. Every product has them; hiding them costs more than it saves. */
  limits: string[];
  figure: FigureKey;
  /** Why that figure is on that page. Without this a schematic is decoration. */
  figureCaption: string;
  /**
   * Where "open it" goes, for anything a person can actually use today.
   *
   * Absent on a product that is still planned, which is what keeps the page
   * from offering a button that leads nowhere.
   */
  open?: { href: string; label: string };
};

export type FigureKey =
  | "sealIn"
  | "irHub"
  | "validation"
  | "scan"
  | "wiring"
  | "aiLoop"
  | "addressing"
  | "lifecycle"
  | "citation";

export const GROUP_META: Record<ProductGroup, { title: string; blurb: string }> = {
  logic: { title: "Write the logic", blurb: "Draw it, ask for it, move it between platforms." },
  panel: { title: "Draw it and prove it", blurb: "The panel drawings, and the logic running." },
  project: { title: "Ship the project", blurb: "The job around the code, and its paperwork." },
};

export const PRODUCTS: Product[] = [
  {
    slug: "studio",
    name: "Ladder",
    tagline: "Draw a rung. Press run. Watch it conduct.",
    state: "live",
    group: "logic",
    menuLine: "Ladder editor with a scan-accurate simulator",
    open: { href: "/ladder", label: "Open Ladder" },
    summary:
      "A ladder editor with a real scan engine behind it. It is the canvas the AI writes onto, it opens on your own programs rather than an empty grid, and it works entirely in the browser with no account and no backend.",
    problem:
      "Learning or checking ladder logic normally means owning a licence and a controller, or using a simulator that solves rungs like equations and quietly teaches you the wrong model of how a PLC behaves.",
    does: [
      {
        h: "A real scan engine",
        p: "An output image, so a coil written after a contact was solved does not reach it until the next sweep. Edge memory held per instruction, so a button held down counts once. Timers on elapsed milliseconds rather than on scan count.",
      },
      {
        h: "Twenty-three instructions, the ones people actually use",
        p: "XIC, XIO, OTE, OTL, OTU, ONS, TON, TOF, CTU, CTD, RES, the six comparisons, MOV and the four arithmetic blocks, and JSR to call another routine. Timer and counter members are addressable: .DN, .TT, .EN, .ACC, .PRE.",
      },
      {
        h: "It opens on your work",
        p: "Recent programs first, then four complete starter programs that run as they are: seal-in motor start, a ten-second conveyor, and two more. Each is copied on open, so taking one apart cannot spoil it for the next person.",
      },
      {
        h: "Describe a rung and it writes one",
        p: "The AI box takes plain language and returns rungs on the canvas, using the tags already in your tag table. It flags a seal-in leg missing its stop condition, which is the mistake generated ladder makes most often.",
      },
      {
        h: "Tags with addresses, and a focus mode",
        p: "Every tag gets a plausible address and a device type, so the simulator can show a panel with real switches and lamps. Full-screen when the rung is the only thing that matters.",
      },
    ],
    limits: [
      "It is a teaching and verification simulator, not a certification tool. It does not replace commissioning.",
      "It never connects to a physical controller, by design, and that will not change.",
      "There is no retentive timer. TON and TOF only; an RTO has to be built from a counter or a latch.",
      "Ladder only. Structured Text is read and written by Convert but not drawn here.",
    ],
    figure: "sealIn",
    figureCaption:
      "A seal-in rung. The pattern every start/stop circuit is built from, and the one the simulator is easiest to check against.",
  },
  {
    slug: "chat",
    name: "Chat",
    tagline: "Ask for logic. Get logic that compiles.",
    state: "live",
    group: "logic",
    menuLine: "Generated code, validated before you see it",
    open: { href: "/studio", label: "Open Chat" },
    summary:
      "Describe what the machine should do and watch the rungs appear on the canvas. Every answer passes a real compiler before it reaches you, and the failures go back to the model rather than to you.",
    problem:
      "General AI assistants write plausible PLC code. Plausible is not the bar when the code runs a machine, and reading it carefully enough to be sure takes about as long as writing it would have.",
    does: [
      {
        h: "It writes onto the canvas, not into a chat bubble",
        p: "Answers arrive as rungs in the Ladder editor: editable, runnable, and yours. Select a rung and ask what it does, or ask for a permissive to be added to it.",
      },
      {
        h: "Validated before display",
        p: "matiec compiles it, iec-checker analyses it, a PLCopen schema pass checks the structure. Anything that fails goes back to the model with the errors attached, and you never see the attempts.",
      },
      {
        h: "Any model, your key",
        p: "OpenRouter by default, including its free models, plus Anthropic, OpenAI, or any OpenAI-compatible endpoint including a local Ollama. Pick a model per conversation or leave it on Auto.",
      },
      {
        h: "It knows the project it is in",
        p: "Tag names, existing routines, the target platform, and the design basis you filled in. Answers use the tags you already have rather than inventing new ones.",
      },
    ],
    limits: [
      "It drafts. Whether the interlock is sufficient for the hazard is an engineering judgement and stays with you.",
      "A compiler proves code is valid, not that it is correct. Simulation helps; it is not a safety case.",
      "Free models are rate-limited by the provider, not by us. The queue you occasionally hit is theirs.",
    ],
    figure: "aiLoop",
    figureCaption:
      "Generation is a loop rather than a single shot. That is what makes a small free model good enough to be useful.",
  },
  {
    slug: "convert",
    name: "Convert",
    tagline: "Between platforms, and between languages.",
    state: "live",
    group: "logic",
    menuLine: "Ladder to ST, SCL, neutral text or PLCopen XML",
    open: { href: "/convert", label: "Open Convert" },
    summary:
      "Read a program in, write it out as Structured Text, Siemens SCL, Rockwell neutral text or PLCopen XML. Every conversion comes with a report of what moved cleanly and what did not, and it all runs in your browser.",
    problem:
      "Cross-vendor migration has no automated path at all, and same-vendor tools leave markers everywhere. Either way somebody reads every rung, and on a large program that is the whole schedule.",
    does: [
      {
        h: "One representation in the middle",
        p: "Nothing converts brand to brand. Everything is read into a PLCopen-based intermediate form and written out of it, so each new importer gains every existing export target for free.",
      },
      {
        h: "Four targets today",
        p: "IEC 61131-3 Structured Text, Siemens SCL, Rockwell neutral text, and PLCopen XML. Each is written from the same source, so they cannot drift apart.",
      },
      {
        h: "A conversion report, always",
        p: "Every element is marked: converted cleanly, converted with a semantic difference worth reading, or needs a decision. No silent guesses.",
      },
      {
        h: "Your program never leaves the machine",
        p: "The conversion runs in the browser. Nothing is uploaded, which is usually the blocker on customer code.",
      },
    ],
    limits: [
      "Bridged rungs, where a wire crosses between parallel branches, have no series/parallel form. They are refused and preserved rather than approximated.",
      "Anything unmapped stays as an annotated placeholder. It is never dropped, and never silently reinterpreted.",
      "Whole-project formats like .ACD and .ap1x need the desktop bridge and your own licensed IDE.",
    ],
    figure: "irHub",
    figureCaption:
      "Every format is read into one representation and written back out of it, which is why adding a vendor gives every other vendor a new destination.",
  },
  {
    slug: "cad",
    name: "CAD",
    tagline: "The panel drawings, on the same project.",
    state: "live",
    group: "panel",
    menuLine: "Schematics and panel layouts, DXF in and out",
    open: { href: "/studio/cad", label: "Open CAD" },
    summary:
      "A drafting tool that opens on a finished sheet rather than an empty one. Eleven working templates numbered the way a control package is read, thirty-four typed commands, object snap, dimensions, and DXF both ways.",
    problem:
      "The schematic set is half the deliverable and it lives in a different application from the code, on a different machine, with the project number typed into the title block by hand on every sheet.",
    does: [
      {
        h: "It opens on a drawing set, not a blank sheet",
        p: "Cover, index, legend, power distribution, 24 V control supply, PLC digital in, digital out, analogue I/O, safety circuit, panel general arrangement and termination schedule. Each is a working sheet with the rails and conventions already drawn.",
      },
      {
        h: "Typed commands, the way drafting is actually done",
        p: "L, REC, C, TR, EX, O, F, CO, M, H and the rest, thirty-four in all, with aliases. Coordinates take the usual forms: absolute, relative, and distance with an angle.",
      },
      {
        h: "The editing tools that carry the work",
        p: "Trim, extend, offset, fillet, rectangular and polar array, mirror, rotate, scale, hatch. Dimensions, leaders, and a measure tool that works from the pointer or from typed coordinates.",
      },
      {
        h: "The title block fills itself",
        p: "Project name, number, client and date come from the project the drawing is filed against. Change the project and every sheet on it follows.",
      },
      {
        h: "Your background, your drawing",
        p: "Black, slate, grey, paper, cream, or a colour you pick. Entities drawn in white flip to black on a light ground the way AutoCAD does it, so a sheet stays readable either way.",
      },
    ],
    limits: [
      "DXF R12 ASCII is the interchange format. A DWG has to be exported to DXF from whatever wrote it.",
      "Two-dimensional only. There is no 3D modelling and none is planned.",
      "It draws what you tell it. It does not check that a breaker is rated for the load.",
    ],
    figure: "wiring",
    figureCaption:
      "Field device, terminal, input card. The chain every I/O sheet in the set is drawing a slice of.",
  },
  {
    slug: "monitor",
    name: "Monitor",
    tagline: "Run the logic and watch it move.",
    state: "live",
    group: "panel",
    menuLine: "Run a saved program, force inputs, watch tags",
    open: { href: "/studio/monitor", label: "Open Monitor" },
    summary:
      "Take any program you have saved, run it at scan speed, force the inputs and watch the tags change. A bench test you can do before anybody books the panel shop.",
    problem:
      "Between writing the logic and standing at the panel there is nothing. The first time most programs run is the first time they run on real hardware, in front of the customer.",
    does: [
      {
        h: "It runs the same engine the editor does",
        p: "The same output image, the same edge memory, the same millisecond timers. What you see here is what the simulator in Ladder does, not a second implementation that can disagree with it.",
      },
      {
        h: "Force an input and watch the consequence",
        p: "Toggle a digital input, drive an analogue value, and follow the outputs. Outputs are listed first, because they are what a test is judged on.",
      },
      {
        h: "A log of what changed",
        p: "Every transition is timestamped as it happens, so a sequence can be read back afterwards rather than watched once and remembered.",
      },
      {
        h: "Any program on any project",
        p: "The list comes from your saved programs rather than from browser storage, so something written on one machine runs on another and stays attached to the job it belongs to.",
      },
    ],
    limits: [
      "It never connects to a controller. It is a simulation of your logic, not a view of a running plant.",
      "It proves the logic does what the logic says. It cannot know the encoder is wired backwards.",
      "A passing run here is evidence for a FAT, not a substitute for one.",
    ],
    figure: "scan",
    figureCaption:
      "One scan: inputs sampled, logic solved, outputs written. Monitor runs this loop at speed and shows you the middle of it.",
  },
  {
    slug: "projects",
    name: "Projects",
    tagline: "The job around the code.",
    state: "live",
    group: "project",
    menuLine: "Lifecycle, design basis, plan and clients",
    open: { href: "/studio/projects", label: "Open Projects" },
    summary:
      "A project holds the design basis, the drawings, the programs and the documents, and it knows which phase of the job it is in. The plan comes from the lifecycle rather than from a blank page.",
    problem:
      "The facts a project runs on live in an email, a kick-off meeting nobody minuted, and one engineer's head. Every document then restates them slightly differently.",
    does: [
      {
        h: "A design basis worth writing once",
        p: "Twenty-two questions in seven groups: goal and scope, control platform, electrical and environment, safety, operation and performance, compliance and security, acceptance and dates. Every document is written from these rather than from memory.",
      },
      {
        h: "Filled from documents you already have",
        p: "Point the onboarding wizard at a URS or a scope of work and it reads the answers out, with the section each one came from. Skip it and come back to it whenever you like.",
      },
      {
        h: "The lifecycle, pinned to the top",
        p: "Summary, requirements, design, development, factory test, commissioning, handover, support. Every phase is reachable at any time, and looking at one is separate from moving the project into it.",
      },
      {
        h: "A plan seeded from the work",
        p: "One task per deliverable the lifecycle already defines, with an owner, a date, and a status. Each task knows whether the document behind it has been written yet.",
      },
      {
        h: "Clients, and everything they touch",
        p: "The client and site sit on the project and flow to every letterhead, title block and document number. Change them once.",
      },
    ],
    limits: [
      "It is a project workspace, not a scheduler. There is no Gantt chart, no critical path and no resource levelling.",
      "The plan tracks whether a deliverable exists, not whether it is any good. Reviewing is still a person's job.",
    ],
    figure: "lifecycle",
    figureCaption:
      "The eight phases, and the deliverables each one owes. The plan is generated from this rather than typed.",
  },
  {
    slug: "docs",
    name: "Documents",
    tagline: "The paperwork a project actually produces.",
    state: "live",
    group: "project",
    menuLine: "Seventeen templates, filled from the project",
    open: { href: "/documents", label: "Browse the templates" },
    summary:
      "Seventeen working templates across specification, design, registers, safety, testing and handover, with the tables and sign-off blocks already in them, filled from your project rather than typed a second time.",
    problem:
      "Documentation is the most disliked and most billable part of an integration project. It is written last, and it is out of date the moment somebody edits a rung.",
    does: [
      {
        h: "The documents a job really owes",
        p: "URS, FDS, control narrative, software design, I/O list, BOM, cable schedule, cause and effect, RATS, alarm list, risk assessment, FAT, commissioning, SAT, handover, O&M manual, change control.",
      },
      {
        h: "From the project, not from scratch",
        p: "The I/O list comes from the tags. The narrative comes from the rungs and their comments. The letterhead comes from the project and the client. All of it regenerates when they change.",
      },
      {
        h: "Editable in place",
        p: "Open a document in Studio and fill it in there. It asks for what it still needs rather than leaving you to find the gaps.",
      },
      {
        h: "Formats people outside engineering can open",
        p: "Word and PDF, laid out for reading rather than exported as a data dump.",
      },
    ],
    limits: [
      "Generated documents need reviewing. They are a first draft that is right about the facts, not a finished submission.",
      "The templates follow common practice, not any one client's house standard. Expect to adapt sections.",
    ],
    figure: "addressing",
    figureCaption:
      "An I/O schedule is generated from addresses like this one. That is why it does not need typing a second time.",
  },
  {
    slug: "knowledge",
    name: "Knowledge",
    tagline: "Your manuals, answering questions.",
    state: "live",
    group: "project",
    menuLine: "Ask your manuals, get the page back",
    open: { href: "/studio/knowledge", label: "Open Knowledge" },
    summary:
      "Drop in the drive manual, the machine spec, the site standard. Ask questions against them and get answers with the page they came from.",
    problem:
      "The answer is almost always in a PDF somebody has. Finding which PDF, and which of its four hundred pages, is the actual work.",
    does: [
      {
        h: "Answers with citations",
        p: "Every claim points at the document and the page it came from, because an unsourced answer about a torque limit is worse than no answer at all.",
      },
      {
        h: "Scoped per project",
        p: "One project's manuals never leak into another's answers, and nothing is used to train anything.",
      },
      {
        h: "It works with the rest",
        p: "Chat can search it while writing logic, so a generated rung can respect the limits stated in the drive manual.",
      },
    ],
    limits: [
      "It retrieves and quotes. It does not verify that the manual is the current revision; that is still on you.",
      "A scanned manual with no text layer is a picture. It needs a PDF with real text in it.",
    ],
    figure: "citation",
    figureCaption:
      "An answer is only useful if you can check it. Every one arrives with the document and page behind it.",
  },
];

export function getProduct(slug: string) {
  return PRODUCTS.find((p) => p.slug === slug);
}

/** The products of one group, in the order they are declared above. */
export function productsIn(group: ProductGroup) {
  return PRODUCTS.filter((p) => p.group === group);
}

export const GROUP_ORDER: ProductGroup[] = ["logic", "panel", "project"];

export const STATE_META: Record<ProductState, { label: string; cls: string }> = {
  live: { label: "Available now", cls: "border-teal-300 bg-teal-50 text-teal-700" },
  building: { label: "In build", cls: "border-ink-200 bg-ink-50 text-ink-600" },
  planned: { label: "Planned", cls: "border-ink-100 bg-white text-ink-400" },
};
