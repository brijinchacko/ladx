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
  /**
   * The direct answer, in two or three sentences, rendered near the top.
   *
   * Retrieval systems select passages, not pages, and the passage they take is
   * usually the one nearest the top that answers the question outright. A
   * product page whose first three paragraphs are positioning gets summarised
   * from somebody else's page instead.
   */
  answer: string;
  /**
   * The question somebody types before they know this exists.
   *
   * Not the product name. Nobody searches for a tool they have not heard of;
   * they search for the problem.
   */
  intent: string;
  /**
   * Self-contained question and answer pairs, shown on the page and emitted as
   * FAQPage schema. Answers written to stand alone at roughly 40 to 60 words.
   */
  faq: { q: string; a: string }[];
  /** ISO date. Freshness is a measured input to AI citation. */
  updated: string;
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
  | "citation"
  | "tagBinding"
  | "gantt";

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
    intent: "Is there a free online ladder logic editor with a real PLC simulator?",
    answer:
      "LADX Ladder is a browser based ladder logic editor with a scan accurate simulator behind it. It models the output image, holds edge memory per instruction, and runs timers on elapsed milliseconds rather than scan counts, so a rung behaves the way it would on a controller. It needs no account, no licence and no installation.",
    updated: "2026-08-25",
    faq: [
      {
        q: "Is LADX Ladder free to use?",
        a: "Yes. The ladder editor and its simulator run entirely in the browser with no account, no licence and no server. Anything that uses a model needs a provider key you supply yourself, because LADX holds no shared inference key and does no metering.",
      },
      {
        q: "Does the simulator behave like a real PLC?",
        a: "It keeps an output image, so a coil written on rung twelve reaches rung thirteen in the same scan and rung four only on the next one. Edge memory is held per instruction, so a held button counts once. Timers count elapsed milliseconds, not scans. Most teaching simulators do none of these.",
      },
      {
        q: "Which instructions does it support?",
        a: "Twenty three: XIC, XIO, OTE, OTL, OTU, ONS, TON, TOF, CTU, CTD, RES, the six comparisons, MOV and the four arithmetic blocks, and JSR. Timer and counter members are addressable, so a contact can examine T1.DN and a bar can read T1.ACC.",
      },
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
    intent: "Can AI write PLC ladder logic that actually works?",
    answer:
      "It can, if something checks it before you see it. LADX generates ladder from a description and then runs a real IEC 61131-3 compiler and the editor's own validator over the result, sending the errors back to the model rather than to you. What arrives on the canvas has already been refused once if it was wrong.",
    updated: "2026-08-25",
    faq: [
      {
        q: "Why does ChatGPT get ladder logic wrong?",
        a: "Because nothing checks it. A model asked for a seal-in will often write a latch leg containing only the motor contact, which latches the motor on and leaves the stop button doing nothing. It looks right and it is a defect. The fix is not a better prompt, it is a compiler in the loop.",
      },
      {
        q: "Which AI models can LADX use?",
        a: "Any of them, through your own key: OpenRouter, Anthropic, OpenAI, or any OpenAI compatible endpoint. Because generated code is validated before it is shown, a small free model is usually good enough, which is the practical point of validating rather than trusting.",
      },
      {
        q: "Does my code get sent anywhere?",
        a: "The prompt and the program go to the provider whose key you connected, and nowhere else. LADX stores no shared key and trains on nothing. The desktop build makes no outbound call at all and runs its model locally.",
      },
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
      "Take a program you have drawn or saved and write it out as IEC 61131-3 Structured Text, Siemens SCL, Rockwell neutral text or PLCopen XML. Every conversion comes with a report of what moved cleanly and what did not, and it all runs in your browser without uploading anything.",
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
    intent: "How do I convert a PLC program between Siemens, Rockwell and Structured Text?",
    answer:
      "LADX Convert reads a ladder program into one intermediate representation and writes it out as IEC 61131-3 Structured Text, Siemens SCL, Rockwell neutral text or PLCopen XML. Every conversion comes with a report saying what moved cleanly and what did not, and it runs in the browser without uploading anything.",
    updated: "2026-08-25",
    faq: [
      {
        q: "Can you convert Siemens to Allen Bradley automatically?",
        a: "Logic converts; the things around it usually do not. Instruction behaviour, addressing conventions, timer semantics and data types differ enough that a fully automatic conversion is not honest. LADX converts what converts and reports the rest rather than producing something that compiles and behaves differently.",
      },
      {
        q: "What is PLCopen XML and why use it?",
        a: "A vendor neutral XML format defined by PLCopen for exchanging IEC 61131-3 programs. It is the closest thing this industry has to a portable file, and it is the shape of the intermediate representation LADX holds ladder in, so adding an output format is one writer rather than a converter per pair of platforms.",
      },
      {
        q: "Is my program uploaded when I convert it?",
        a: "No. Conversion runs in your browser. The program does not leave the machine, which matters when the program belongs to a client and the site's policy says it does not go to a cloud service.",
      },
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
    intent: "Is there CAD software for control panel and PLC schematic drawings?",
    answer:
      "LADX CAD is a drafting tool that opens on a finished sheet rather than an empty one. Eleven working templates numbered the way a control package is read, from cover and index through power distribution, PLC digital and analogue cards, safety and the panel general arrangement, with typed commands, object snap, dimensions and DXF in both directions.",
    updated: "2026-08-25",
    faq: [
      {
        q: "Can I import and export DXF?",
        a: "Export works today. Import is on the plan, and it matters because it is what lets a panel builder start from the drawing they already have rather than redrawing it.",
      },
      {
        q: "What drawing templates are included?",
        a: "Eleven: cover sheet, drawing index, symbol legend, power distribution, control supply, PLC digital inputs, PLC digital outputs, PLC analogue, safety circuit, panel general arrangement and terminal schedule. They are numbered in the order a control package is read.",
      },
      {
        q: "Does it work with the PLC tag table?",
        a: "Not yet, and it is the single most valuable thing to add. The tags exist, the I/O drawing templates exist, and the line between them is currently drawn by hand.",
      },
    ],
    figure: "wiring",
    figureCaption:
      "Field device, terminal, input card. The chain every I/O sheet in the set is drawing a slice of.",
  },
  {
    slug: "hmi",
    name: "HMI",
    tagline: "The operator screens, on the same tags.",
    state: "live",
    group: "panel",
    menuLine: "SCADA screens bound to the ladder's own tag table",
    open: { href: "/studio/hmi", label: "Open HMI" },
    summary:
      "A SCADA and HMI builder that binds to the ladder program's tag table rather than a second one kept in step by hand. Pick the panel, draw the mimic, define the alarms, and press run: the same scan engine that drives the simulator drives the screen.",
    problem:
      "The HMI is built in a different tool, against a tag list exported the week before, by somebody who cannot run the logic. The screen and the program disagree, and the place that gets found out is site.",
    does: [
      {
        h: "One tag table, not two",
        p: "Screens bind to the controller's tags by name. There is no import step and no second list, so a screen cannot reference a tag the program renamed three weeks ago, and the tools that check the program check the screen too.",
      },
      {
        h: "The panel first, because a panel does not reflow",
        p: "Fourteen real panel sizes, from a 4 inch 480 by 272 up to a 21 inch 1920 by 1080, stated as resolutions rather than model numbers. A graphic drawn for a 15 inch and deployed to a 7 inch is cut off, not scaled, so the glass is the first decision.",
      },
      {
        h: "Alarms to ISA-18.2",
        p: "A real state machine: unacknowledged, acknowledged, returned but unacknowledged, shelved, suppressed, out of service. Deadband and on-delay so a value sitting on a limit does not chatter. Acknowledging never clears an active alarm, which is the rule most implementations get wrong.",
      },
      {
        h: "Bulk alarms, on a tag table you already have",
        p: "Pick forty analogue tags and get hi, hi-hi, lo and lo-lo limits as a percentage of span, with escalating priorities and a preview before anything is written. The alternative is defining them one at a time, which means most of them never get defined.",
      },
      {
        h: "Eighty-seven symbols, and your own artwork",
        p: "Vessels, pumps, valves, conveying, instruments and switchgear, in a flat ISA-101 style or a shaded realistic one. Any symbol can be replaced with your own SVG or photograph, sanitised on the way in, so the screen can show the actual machine.",
      },
      {
        h: "It runs against the program",
        p: "Press run and the ladder solves, the HMI writes land at the top of the scan the way a real controller reads them, the trends fill and the alarms evaluate. A start button on glass starts the motor in the logic. Nothing is mocked.",
      },
      {
        h: "It exports a panel that actually runs",
        p: "One HTML file holding the screens, the ladder program, the scan engine and the renderer. Open it and the screen is running, with no install, no server and no network, so it works from a USB stick on a machine that has never been online. Not a TP1500 or PanelView project, which are closed formats, but a panel for the hardware most new panels actually are. The runtime inside it is the same code the builder runs rather than a port of it, because the value of exporting a screen somebody signed off is that it is the screen they signed off.",
      },
      {
        h: "The run is recorded, and the spike survives",
        p: "Every trend also records, and the recording outlives pressing Stop, because stopping is usually the moment before somebody wants to look at what just happened. Older samples are compacted to a minimum and a maximum per interval rather than an average: an average removes the excursion, and the excursion is the reason the recording was opened. Export is CSV with the low and the high in separate columns.",
      },
      {
        h: "Screens from a description",
        p: "Describe the screen and it is drawn against your real tag table, then checked: every binding resolved against the tags that exist, every rectangle clamped to the glass, and a warning if a stop button was written the wrong way round. Or lay the whole tag table out with no model at all.",
      },
      {
        h: "Drawn for handover",
        p: "The connection is configured and exported rather than dialled: OPC UA, Modbus TCP, EtherNet/IP or S7, with rack, slot, unit id, poll rate and word order recorded. Word order in particular is a commissioning day nobody enjoys.",
      },
    ],
    limits: [
      "It does not talk to plant equipment. The runtime is the simulator, which is what makes a screen testable at a desk; the driver settings are recorded for handover, not dialled.",
      "It does not produce a vendor panel project. There is no download to a TP1500 or a PanelView; those are closed formats. What it exports is one HTML file that runs the screen in a browser, which is what an industrial PC or a thin client is.",
      "It is not a plant historian. A run is recorded, reviewed and exported, but that is a record of a simulated test held in the browser for the session, not months of instrument data.",
      "Scripting is a small expression language over tags, not a programming language. It has no property access, no functions of its own and no way to reach the page, which is deliberate.",
    ],
    intent: "Is there an HMI or SCADA builder that uses the PLC's own tag table?",
    answer:
      "LADX HMI binds screens directly to the ladder program's tag table rather than a second list kept in step by hand, so a screen cannot reference a tag the program renamed. Pick the panel size, draw the mimic from eighty seven symbols, define alarms to ISA-18.2, and press run: the same scan engine that drives the simulator drives the screen.",
    updated: "2026-08-28",
    faq: [
      {
        q: "Can I design an HMI screen without the PLC hardware?",
        a: "Yes, and that is the point of it. The runtime is the ladder simulator, so a start button on glass starts the motor in the logic, the trend fills and the alarms evaluate, all at a desk with no controller and no panel present.",
      },
      {
        q: "Does LADX HMI support ISA-18.2 alarms?",
        a: "It implements the state machine: unacknowledged, acknowledged, returned but unacknowledged, shelved, suppressed and out of service, with deadband, on delay and shelving that expires. Acknowledging never clears an active alarm, which is the rule most implementations get wrong.",
      },
      {
        q: "Can it deploy to a Siemens or Allen Bradley panel?",
        a: "Not as a vendor project file. A TP1500 or PanelView application is a closed format and writing one without their tooling is not something to claim. It does export a panel: one HTML file carrying the screens, the ladder program and the runtime, which opens and runs with no install and no network, on the industrial PCs, thin clients and tablets that most new panels actually are.",
      },
    ],
    figure: "tagBinding",
    figureCaption:
      "The ladder writes a tag, the screen reads the same tag by name. There is no second table between them to fall out of step.",
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
    intent: "How can I test PLC logic before the panel is built?",
    answer:
      "LADX Monitor runs any program you have saved at scan speed, lets you force inputs and watch every tag change, and records what happened. It is a bench test you can do before anybody books the panel shop, using the same scan engine the ladder editor simulates with rather than a separate model of it.",
    updated: "2026-08-25",
    faq: [
      {
        q: "Can I test PLC logic without a PLC?",
        a: "Yes. Monitor runs the program on a scan accurate engine, so timers, edges and the output image behave as they would on a controller. It will not find a wiring fault or a wrong device, and it will find the logic errors, which are most of what gets found at a FAT.",
      },
      {
        q: "Can I force inputs like an online PLC session?",
        a: "Yes. Inputs are forceable and buttons spring back the way a real one does, so a momentary press is momentary. Every force and its effect is recorded in a sequence log, which is what makes a test repeatable rather than a memory.",
      },
      {
        q: "Can the test be saved as a record?",
        a: "Yes. A run can be saved against the project, which turns a bench test into something that can be attached to a factory acceptance test rather than described in a meeting.",
      },
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
      "It is a project workspace. Scheduling lives next door in Planner, which does have a Gantt chart; neither does critical path or resource levelling.",
      "The plan tracks whether a deliverable exists, not whether it is any good. Reviewing is still a person's job.",
    ],
    intent:
      "How do I keep a control system project's design basis, drawings and documents together?",
    answer:
      "A LADX project holds the design basis, the drawings, the programs and the documents, and knows which phase of the job it is in. Twenty two design questions are answered once and flow into every document, and the plan is generated from the deliverables the project actually owes rather than typed into a blank page.",
    updated: "2026-08-25",
    faq: [
      {
        q: "What is a project design basis?",
        a: "The facts a project runs on: goal and scope, control platform, electrical and environmental conditions, safety requirements, operation and performance, compliance, and acceptance criteria. Written once, they stop every document restating them slightly differently.",
      },
      {
        q: "Can I limit a project to programming only?",
        a: "Yes. A project carries the set of deliverables it owes, and the presets run from programming only, three documents, to a full lifecycle of seventeen. Handing somebody writing logic a plan containing a bill of materials is noise they delete seventeen times.",
      },
      {
        q: "Does changing the client name update the documents?",
        a: "Yes. The client and site sit on the project and flow to every letterhead, title block and document number, so it is changed once rather than found in fifteen files.",
      },
    ],
    figure: "lifecycle",
    figureCaption:
      "The eight phases, and the deliverables each one owes. The plan is generated from this rather than typed.",
  },
  {
    slug: "planner",
    name: "Planner",
    tagline: "Every project on one timeline.",
    state: "live",
    group: "project",
    menuLine: "A real Gantt chart across every job you have",
    open: { href: "/studio/planner", label: "Open Planner" },
    summary:
      "A Gantt chart over every project at once, seeded from the deliverables each job actually owes. Drag a bar to move it, drag its edge to change how long it takes, and let a dependency stop a task starting before the one it waits on has finished.",
    problem:
      "The plan lives in a spreadsheet that nobody updates, or in a scheduling tool that knows nothing about the job. Both drift from the work within a fortnight, and the first anybody notices is when a date is missed.",
    does: [
      {
        h: "Seeded from the scope, not from a blank page",
        p: "The tasks come from the deliverables the project owes. Change the scope from programming only to a full lifecycle and the plan grows to match, without disturbing work already under way.",
      },
      {
        h: "A chart you can actually edit",
        p: "Drag a bar to reschedule it, drag either end to change its duration, and zoom between days, weeks and months. Weekends are shaded, today is marked, and dates are stored as dates rather than instants so a plan drafted in London reads the same in Chennai.",
      },
      {
        h: "Dependencies that mean something",
        p: "A task can wait on another. The chart draws the link, refuses a circular one, and flags a task scheduled to start before the thing it depends on has finished, rather than letting the two quietly disagree.",
      },
      {
        h: "Scheduling for the undated",
        p: "A new project has a plan and no dates. One action lays every undated task end to end across working days, which is a starting point to argue with rather than a blank column to fill in by hand.",
      },
      {
        h: "In and out as CSV",
        p: "Export the plan and open it in anything. Import one back, with quoted fields and real date validation, so a plan built in a spreadsheet can come in rather than being retyped.",
      },
      {
        h: "Across every client at once",
        p: "Filter by client or by project, or look at all of them together, which is the view that answers the question a small integrator actually has: what is happening in March.",
      },
    ],
    limits: [
      "No resource levelling and no critical path. It shows what is planned and what depends on what, not who is over-committed.",
      "Duration is in working days, and the working calendar is Monday to Friday. Public holidays are not modelled.",
      "It plans deliverables. Whether a deliverable is any good is still a person's job.",
    ],
    intent: "Is there a Gantt chart that knows what an automation project actually owes?",
    answer:
      "LADX Planner draws every project on one timeline, seeded from the deliverables each job owes rather than from a blank page. Drag a bar to reschedule it, drag an edge to change its duration, and a dependency stops a task starting before the one it waits on has finished. Dates are stored as dates, so a plan drafted in London reads the same in Chennai.",
    updated: "2026-08-25",
    faq: [
      {
        q: "How is this different from a general project planner?",
        a: "The tasks come from the deliverables the project owes, which the system already knows. Widen the scope from programming only to a full lifecycle and the plan grows to match, without disturbing work already under way. A general planner starts empty and stays whatever somebody last typed.",
      },
      {
        q: "Can I import and export the plan?",
        a: "Both, as CSV, with quoted fields and real date validation. A plan built in a spreadsheet can come in rather than being retyped, and the plan can go out to anyone who wants it in Excel.",
      },
      {
        q: "Does it do resource levelling or critical path?",
        a: "No. It shows what is planned and what depends on what. Resource levelling and critical path are not implemented and the page says so rather than implying otherwise.",
      },
    ],
    figure: "gantt",
    figureCaption:
      "Bars against real dates, with the dependency drawn because the chart enforces it, and a rule for today.",
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
    intent: "Where can I get automation project document templates that are already filled in?",
    answer:
      "LADX Documents holds seventeen working templates across specification, design, registers, safety, testing and handover, with the tables and sign-off blocks already in them. They fill from your project, so the client name, the site, the document number and the tag list arrive already correct rather than being typed a second time.",
    updated: "2026-08-25",
    faq: [
      {
        q: "What documents does an automation project need?",
        a: "Commonly seventeen: URS, FDS, control narrative, software design specification, I/O list, bill of materials, cable schedule, cause and effect matrix, alarm and trip schedule, alarm rationalisation record, risk assessment, FAT, commissioning checklist, SAT, handover certificate, O and M manual, and change control.",
      },
      {
        q: "Are the templates free to download?",
        a: "Yes, and without an account. Fill in a few fields and the template downloads with them substituted; leave them blank and it downloads with square bracket placeholders. It is the template library, not a lead capture form.",
      },
      {
        q: "Do the documents update when the project changes?",
        a: "The I/O list comes from the tags, the narrative from the rungs and their comments, and the letterhead from the project and the client, so regenerating produces the current version. Change tracking between regenerations is on the plan.",
      },
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
    intent: "Can I ask questions of my own PLC and drive manuals?",
    answer:
      "LADX Knowledge indexes documents you upload, drive manuals, machine specifications, site standards, and answers questions using only passages from them, with the page each answer came from. Anything not in the documents comes back as not in the documents rather than as a plausible invention.",
    updated: "2026-08-25",
    faq: [
      {
        q: "How is this different from asking ChatGPT about a manual?",
        a: "It answers only from passages retrieved out of your documents, and shows which passages it used. A general model asked about a specific drive parameter will produce a confident number from nowhere in particular, and there is no way to tell from the answer which kind you got.",
      },
      {
        q: "What happens if the answer is not in my documents?",
        a: "It says so. That is the behaviour worth having: a retrieval system that pads a gap with general knowledge is more dangerous than one that refuses, because the refusal is visible and the padding is not.",
      },
      {
        q: "What file types can I upload?",
        a: "Text and PDF today. Extraction from PDFs with heavy tables loses some structure, which matters because tables are where parameter values live, and improving it is on the plan.",
      },
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
