import { type ElementType, INSTRUCTIONS } from "./types";

/**
 * The manual.
 *
 * Written as data rather than a page of prose so that everything else can
 * point into it: a tooltip names a topic id, the View menu names a topic id,
 * an error message names a topic id. A help system nobody can reach from the
 * thing they are confused about is a help system nobody reads.
 *
 * The instruction reference is generated from INSTRUCTIONS, so an instruction
 * added to the simulator cannot be missing from the manual, the one part of a
 * document like this that always rots first.
 */

export type HelpSection = {
  id: string;
  title: string;
  /** One line, used in search results and as the tooltip's "read more". */
  summary: string;
  body: HelpBlock[];
  keywords?: string[];
};

export type HelpBlock =
  | { kind: "p"; text: string }
  | { kind: "steps"; items: string[] }
  | { kind: "list"; items: string[] }
  | { kind: "keys"; items: [string, string][] }
  | { kind: "note"; text: string }
  | { kind: "instructions"; group: string };

export const HELP: [HelpSection, ...HelpSection[]] = [
  /* ── Getting started ───────────────────────────────────────────── */
  {
    id: "start",
    title: "Getting started",
    summary: "Draw a rung, download it to the controller, and run it.",
    keywords: ["begin", "first", "new", "how"],
    body: [
      {
        kind: "p",
        text: "LADX Mini is a ladder logic editor and a simulated controller. You draw a program, transfer it into the controller, then run it and watch power flow through the rungs exactly as it would on real hardware.",
      },
      {
        kind: "steps",
        items: [
          "Open a worked example, or press New program for an empty one.",
          "Drag an instruction from the Instructions bar onto a rung, or click a gap in the rung first and then click an instruction.",
          "Double-click the instruction and give it a tag name, the name of the signal it reads or drives.",
          "In I/O and tags, tick input or output on that tag so it appears as a switch or a lamp.",
          "Press Compile. Anything wrong is listed in Messages.",
          "Press Download. The program is transferred into the controller.",
          "Press Simulate, then operate the switches and watch the rung go live.",
        ],
      },
      {
        kind: "note",
        text: "Nothing you do to a worked example affects the original, opening one gives you your own copy.",
      },
    ],
  },

  /* ── The screen ────────────────────────────────────────────────── */
  {
    id: "screen",
    title: "The screen",
    summary: "What each panel is for, and how to close, resize and restore them.",
    keywords: ["layout", "panel", "window", "view", "dock", "resize", "close"],
    body: [
      {
        kind: "p",
        text: "The editor is a set of panels around the ladder canvas. Every panel can be closed, resized, and brought back.",
      },
      {
        kind: "list",
        items: [
          "Project, routines, the tag table and the simulator, as a tree.",
          "Instructions, contacts, coils, timers, compare and maths.",
          "Ladder canvas, the networks themselves. This one is always present.",
          "I/O and tags, switches for inputs, lamps for outputs, and the tag table.",
          "Messages, compile results, warnings, errors and runtime faults.",
          "Simulator, the controller, its terminals, and how the field devices are wired to it.",
        ],
      },
      {
        kind: "steps",
        items: [
          "Close a panel with the × on its title bar. It goes to the strip along the bottom rather than disappearing.",
          "Click it on that strip to bring it back where it was.",
          "Drag the edge between two panels to resize. Each has a sensible minimum and maximum, so a panel cannot be made too small to grab.",
          "View → Reset layout puts everything back to how it started.",
        ],
      },
      {
        kind: "note",
        text: "The layout is remembered on this computer, so it is the same next time you open a project.",
      },
    ],
  },
  {
    id: "project-tree",
    title: "The project tree",
    summary: "Routines, tags and the simulator, and what right-clicking gives you.",
    keywords: ["routine", "jsr", "tree", "main"],
    body: [
      {
        kind: "p",
        text: "A program is made of routines, pages of logic. Main is the entry point: it is the one the controller executes, and it cannot be deleted.",
      },
      {
        kind: "p",
        text: "Other routines only run when a JSR instruction calls them by name. That is how a large program is broken into readable pieces rather than one enormous page.",
      },
      {
        kind: "list",
        items: [
          "Right-click a routine to open it, add a network, rename it or delete it.",
          "Right-click the panel itself to add a routine, open the tag table, save or export.",
        ],
      },
    ],
  },

  /* ── Drawing ───────────────────────────────────────────────────── */
  {
    id: "rungs",
    title: "Networks and rungs",
    summary: "How a rung is read, and how to add, reorder and comment one.",
    keywords: ["rung", "network", "order", "scan"],
    body: [
      {
        kind: "p",
        text: "Each network is one rung: conditions on the left, outputs on the right. Power flows from the left rail; if it reaches the right, the outputs are energised.",
      },
      {
        kind: "p",
        text: "Networks execute top to bottom, every scan. That order matters: if network 1 sets a bit and network 2 reads it, network 2 sees the new value in the same scan. Reverse them and it sees the old one, a scan late.",
      },
      {
        kind: "list",
        items: [
          "Drag a network by its title bar to reorder it.",
          "Right-click a network to cut, copy, paste, duplicate, add instructions or delete it.",
          "Click the pencil on a network to give it a comment. Comment your rungs, the person reading them in six months is you.",
        ],
      },
    ],
  },
  {
    id: "branches",
    title: "Branches",
    summary: "Parallel paths, the OR in ladder logic.",
    keywords: ["branch", "parallel", "or", "seal", "latch"],
    body: [
      {
        kind: "p",
        text: "Instructions side by side on one line are an AND: power must pass through all of them. A branch puts instructions on parallel lines, which is an OR: power passes if any leg conducts.",
      },
      {
        kind: "p",
        text: "The classic use is a seal-in. A start button in one leg and the output's own contact in the other means that once the output is on, it holds itself on after the button is released.",
      },
      {
        kind: "steps",
        items: [
          "Click a gap in the rung, then click a second gap. Everything between them is wrapped in a branch.",
          "Or select instructions and press the Branch button.",
          "Use the arrows on a selected branch to move its edges one instruction at a time.",
          "Right-click a branch to remove it but keep its contacts, or delete it with everything inside.",
        ],
      },
      {
        kind: "note",
        text: "Removing a branch and keeping the contacts is usually what you want: a branch is normally drawn around the wrong span first.",
      },
    ],
  },
  {
    id: "editing",
    title: "Moving, copying and selecting",
    summary: "Drag instructions between rungs, multi-select, cut, copy and paste.",
    keywords: ["drag", "move", "copy", "paste", "select", "delete"],
    body: [
      {
        kind: "list",
        items: [
          "Drag any instruction to any gap, on any network. A coil dropped anywhere goes to the output rail.",
          "Ctrl or Cmd-click to select more than one instruction. Delete removes them all together.",
          "Right-click anything for the actions that apply to it.",
        ],
      },
      {
        kind: "keys",
        items: [
          ["Ctrl/Cmd + C", "Copy the selected instruction or network"],
          ["Ctrl/Cmd + X", "Cut"],
          ["Ctrl/Cmd + V", "Paste"],
          ["Ctrl/Cmd + D", "Duplicate the selected network"],
          ["Ctrl/Cmd + Z", "Undo"],
          ["Ctrl/Cmd + Shift + Z", "Redo"],
          ["Delete", "Delete what is selected"],
          ["Escape", "Clear the selection and the insertion point"],
          ["A / S / D", "Insert a contact, a closed contact, a coil"],
          ["B", "Branch around the selection"],
          ["N", "New network"],
        ],
      },
    ],
  },

  /* ── Tags ──────────────────────────────────────────────────────── */
  {
    id: "tags",
    title: "Tags and I/O",
    summary: "Naming signals, and wiring them to switches and lamps.",
    keywords: ["tag", "input", "output", "bool", "int", "timer", "counter", "address"],
    body: [
      {
        kind: "p",
        text: "A tag is a named signal. Every instruction reads or writes one. On a real controller a tag is tied to a physical terminal; here it is tied to a switch or a lamp in the I/O panel.",
      },
      {
        kind: "list",
        items: [
          "BOOL, on or off. Contacts and coils use these.",
          "INT: a whole number. Compare and maths instructions use these.",
          "TIMER, has a preset, an accumulated value, and a done bit.",
          "COUNTER, the same, counting events rather than milliseconds.",
        ],
      },
      {
        kind: "p",
        text: "Tick input to get a switch you can operate, or output to get a lamp that follows the program. Choose the device type so the control behaves like the real thing: a pushbutton is momentary, a selector latches.",
      },
      {
        kind: "note",
        text: "A stop button is wired normally closed on real machinery, so it reads 1 when nobody is pressing it. A broken wire then looks the same as a pressed button and the machine stops either way. The Wiring view in the simulator draws this.",
      },
    ],
  },
  {
    id: "addressing",
    title: "Addresses",
    summary: "I0.0, Q0.1, M0.0, T0, which terminal a signal is actually on.",
    keywords: [
      "address",
      "addressing",
      "terminal",
      "I0.0",
      "Q0.0",
      "byte",
      "bit",
      "M0.0",
      "IW",
      "QW",
      "MW",
    ],
    body: [
      {
        kind: "p",
        text: "A tag name says what a signal means. An address says where it physically is. The panel in front of you does not know your tag is called Start_PB, it knows terminal I0.0, and so does every wiring drawing, every fault code and every engineer you will ever hand the job over to.",
      },
      {
        kind: "list",
        items: [
          "I0.0 to I0.7, the digital inputs, on the top terminal strip.",
          "Q0.0 to Q0.5, the digital outputs, on the bottom strip.",
          "M0.0 upwards, internal bits. Real memory, no terminal, nothing wired to them.",
          "IW64, IW66: analog inputs. QW80, the analog output. Addressed by word, not by bit.",
          "MW0, MW2, MW4, internal numbers.",
          "T0, T1 … and C0, C1 …, timers and counters.",
        ],
      },
      {
        kind: "p",
        text: "The dot is not decoration and it is not a version number. In I0.3 the 0 is the byte and the 3 is the bit inside that byte. Bits run 0 to 7 and then the byte increments, which is why I0.7 is followed by I1.0 and never by I0.8, the single most common thing people get wrong writing addresses by hand.",
      },
      {
        kind: "note",
        text: "Words step by two because a word is two bytes. MW0 occupies bytes 0 and 1, so the next free word is MW2, MW1 would overlap it.",
      },
      {
        kind: "steps",
        items: [
          "Every tag is given a free address automatically when it is created.",
          "Change it in the Address column of the tag table. It is checked as you type, and refused with a reason rather than silently corrected.",
          "Ticking input or output on a tag moves it to the right area: an input terminal cannot drive a lamp.",
          "Open the simulator's Wiring view to see the device wired to that exact terminal.",
        ],
      },
      {
        kind: "note",
        text: "This controller has eight inputs and six outputs. A ninth input would need an expansion module, which is why the editor will not let you address one.",
      },
    ],
  },
  {
    id: "members",
    title: "Timer and counter members",
    summary: "T1.PRE, T1.ACC and T1.DN: addressing the parts of a timer.",
    keywords: ["pre", "acc", "dn", "preset", "accumulated", "done", "member"],
    body: [
      {
        kind: "p",
        text: "A timer or counter is not a single number. Its parts are addressed with a dot.",
      },
      {
        kind: "list",
        items: [
          "T1.PRE, the preset. For a timer this is in milliseconds, so 5000 is five seconds.",
          "T1.ACC, the accumulated value: how far it has got.",
          "T1.DN, the done bit, true once ACC reaches PRE.",
          "T1.TT, timing: true while it is running and not yet done.",
          "T1.EN, enabled: true while the rung feeding it is true.",
        ],
      },
      {
        kind: "p",
        text: "These can be read and written. MOV 5000 into T1.PRE is how a recipe changes a dwell time while the machine is running. T1.DN on a contact is how one timer starts the next step.",
      },
      {
        kind: "note",
        text: "Writing to a bare timer name is refused: say which part you mean. The status bits, DN, TT, EN: are set by the controller and cannot be written to.",
      },
    ],
  },

  /* ── Instruction reference ─────────────────────────────────────── */
  {
    id: "instructions",
    title: "Instruction reference",
    summary: "Every instruction, what it does and when to use it.",
    keywords: ["instruction", "reference", "list"],
    body: [
      {
        kind: "p",
        text: "Instructions are grouped the way they are on the toolbar. Drag one onto a rung, or click a gap and then the instruction.",
      },
      { kind: "instructions", group: "Bit" },
      { kind: "instructions", group: "Timer/Counter" },
      { kind: "instructions", group: "Compare" },
      { kind: "instructions", group: "Move/Math" },
      { kind: "instructions", group: "Program" },
    ],
  },

  /* ── Running ───────────────────────────────────────────────────── */
  {
    id: "transfer",
    title: "Compile, Download and Upload",
    summary: "Getting your program into the controller, and reading it back.",
    keywords: ["compile", "download", "upload", "plc", "transfer", "build"],
    body: [
      {
        kind: "p",
        text: "Compile checks the program without running it. Anything it finds is listed in Messages. Warnings do not stop a download: a half-built program is still worth running to see what the missing piece does.",
      },
      {
        kind: "p",
        text: "Download sends the program from the editor into the controller. That direction catches people out: download means editor to PLC, not the other way round. Upload reads back what the controller is holding, which is how you recover a program you have edited badly on screen.",
      },
      {
        kind: "note",
        text: "What you see on screen and what the controller is running are two different things until you download. The PLC lamp on the toolbar tells you whether the controller holds a program at all.",
      },
    ],
  },
  {
    id: "simulator",
    title: "The simulator",
    summary: "Running the program, operating the I/O, and seeing how it is wired.",
    keywords: ["simulate", "run", "scan", "wiring", "panel", "io"],
    body: [
      {
        kind: "p",
        text: "Press Simulate and the controller scans the program repeatedly, exactly as real hardware does: read the inputs, solve every rung top to bottom, write the outputs, repeat. The scan rate is on the toolbar, slow it down to watch what is happening.",
      },
      { kind: "p", text: "The simulator has two views." },
      {
        kind: "list",
        items: [
          "Panel, the controls as they would sit on an enclosure. Quiet, no animation, for when you know the plant.",
          "Wiring, the whole loop drawn out: +24V, the field device, the wire, the terminal, the controller, and the 0V common, with current animated through the live wires.",
        ],
      },
      {
        kind: "p",
        text: "Every device is operable while the program is running. A pushbutton is momentary, it releases when you let go. A selector latches. A sensor toggles.",
      },
    ],
  },
  {
    id: "messages",
    title: "The Messages panel",
    summary: "Compile results, warnings, errors and runtime faults, with history.",
    keywords: ["message", "error", "warning", "output", "log", "compile"],
    body: [
      {
        kind: "p",
        text: "Everything the editor and the controller report is logged here with a time, so what happened two minutes ago is still there when it turns out to explain what is happening now.",
      },
      {
        kind: "list",
        items: [
          "Errors, something is wrong and will not work.",
          "Warnings, it will run, but it is probably not what you meant. A rung with no output, or two coils driving one tag.",
          "Info, compiles, downloads, uploads, saves.",
        ],
      },
      {
        kind: "note",
        text: "A repeated message collapses into one row with a count. A scanning simulator can raise the same fault ten times a second, and without that the log would be one line repeated.",
      },
    ],
  },

  /* ── Keeping your work ─────────────────────────────────────────── */
  {
    id: "saving",
    title: "Saving, retention, export and import",
    summary: "Autosave, how long projects are kept, and how to keep one for longer.",
    keywords: ["save", "autosave", "export", "import", "backup", "retention", "delete"],
    body: [
      {
        kind: "p",
        text: "Your work saves itself a moment after you stop editing. The indicator beside the project name says which of three things is true: Saving, Unsaved changes, or Saved.",
      },
      {
        kind: "p",
        text: "Projects stay in the portal for three months after you last open them. That is deliberate: an account fills with afternoon experiments, and keeping every one forever buries the few that matter.",
      },
      {
        kind: "steps",
        items: [
          "File → Export project writes a .json file to your computer. Anything you want to keep past three months should be exported.",
          "File → Import project reads one back, as a new project.",
          "File → Export as PDF produces a document with a cover sheet, the I/O schedule and the ladder, for a portfolio, an assessment or an interview.",
        ],
      },
      {
        kind: "note",
        text: "An exported file is yours. It does not expire, and it opens on any account.",
      },
    ],
  },

  /* ── When it does not work ─────────────────────────────────────── */
  {
    id: "troubleshooting",
    title: "When something does not work",
    summary: "The handful of things that catch nearly everybody.",
    keywords: ["problem", "help", "stuck", "not working", "broken", "why"],
    body: [
      {
        kind: "list",
        items: [
          "The rung does nothing when I run it, check the PLC lamp. If it says PLC EMPTY you have not downloaded since your last edit.",
          "My output never comes on, is the tag ticked as an output? An untagged coil drives nothing.",
          "My stop button stops everything immediately: a stop button is normally closed, so the contact reading it should be XIC, and the tag should sit at 1 when it is not pressed.",
          "The timer never finishes: a timer preset is in milliseconds. 5 is five thousandths of a second; you probably meant 5000.",
          "Two coils with the same tag, the last rung wins, every scan. Compile warns about this; it is almost never what was meant.",
          "The motor turns on and straight off, you probably have no seal-in. A momentary button only makes the rung true while it is held.",
        ],
      },
    ],
  },
];

export const HELP_BY_ID = new Map(HELP.map((h) => [h.id, h]));

/** Instructions in one toolbar group, for the reference section. */
export function instructionsInGroup(group: string) {
  return INSTRUCTIONS.filter((i) => i.group === group);
}

/** The help topic for one instruction type, used by tooltips. */
export function topicForInstruction(type: ElementType): string {
  const meta = INSTRUCTIONS.find((i) => i.type === type);
  if (!meta) return "instructions";
  if (meta.group === "Timer/Counter") return "members";
  return "instructions";
}

/**
 * Free-text search across titles, summaries, keywords and body text.
 *
 * Matches on the whole phrase and on each word, because somebody types "timer
 * preset" and somebody else types "how long does a timer run": and a search
 * that only handles the first is a search that sends the second away.
 */
export function searchHelp(query: string): HelpSection[] {
  const q = query.trim().toLowerCase();
  if (!q) return HELP;
  const words = q.split(/\s+/).filter(Boolean);

  const score = (h: HelpSection): number => {
    const hay = [
      h.title,
      h.summary,
      ...(h.keywords ?? []),
      ...h.body.flatMap((b) =>
        b.kind === "p" || b.kind === "note"
          ? [b.text]
          : b.kind === "steps" || b.kind === "list"
            ? b.items
            : b.kind === "keys"
              ? b.items.flat()
              : [],
      ),
    ]
      .join(" ")
      .toLowerCase();

    let n = 0;
    if (hay.includes(q)) n += 10;
    if (h.title.toLowerCase().includes(q)) n += 20;
    for (const w of words) if (hay.includes(w)) n += 2;
    return n;
  };

  return HELP.map((h) => ({ h, n: score(h) }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n)
    .map((x) => x.h);
}

/* ── Per-instruction detail ────────────────────────────────────────
 *
 * INSTRUCTIONS carries one line, which is right for a tooltip and far too
 * little for somebody trying to work out why their timer never finishes.
 * This is the long form: what the operands are, how it behaves, and the
 * mistake people actually make with it.
 */

export type InstructionDoc = {
  /** Operand name and what goes in it. */
  operands: [string, string][];
  /** How it behaves, in full. */
  detail: string;
  /** A worked line of use. */
  example?: string;
  /** The mistake people actually make. */
  gotcha?: string;
};

export const INSTRUCTION_DOCS: Record<string, InstructionDoc> = {
  XIC: {
    operands: [["Tag", "A BOOL to examine"]],
    detail:
      "Examine If Closed. Passes power when the bit is 1, blocks it when the bit is 0. Drawn as a normally-open contact, but the drawing describes the instruction, not the switch in the field. It does not care what kind of device set the bit.",
    example: "A start pushbutton wired normally open: XIC Start passes while the button is held.",
    gotcha:
      "For a stop button, which is wired normally closed and therefore reads 1 when nobody is touching it, XIC is still the instruction you want. Pressing it drops the bit to 0 and the rung opens.",
  },
  XIO: {
    operands: [["Tag", "A BOOL to examine"]],
    detail:
      "Examine If Open. The inverse of XIC: passes power when the bit is 0. Drawn as a normally-closed contact.",
    example: "XIO Fault keeps a motor running only while no fault is present.",
    gotcha:
      "Using XIO on a normally-closed stop button gives you a machine that runs only while the stop button is pressed. Check the device wiring before choosing the contact.",
  },
  ONS: {
    operands: [["Tag", "A BOOL to hold the previous state"]],
    detail:
      "One Shot. Passes power for exactly one scan on the rung's transition from false to true, then blocks until the rung goes false and true again. The tag it is given is scratch storage remembering last scan's state, it is not a signal you read anywhere else.",
    example: "A button that should advance a counter by one, however long it is held.",
    gotcha:
      "Every ONS needs its own tag. Two sharing one tag interfere, and the symptom is an event that fires sometimes.",
  },
  OTE: {
    operands: [["Tag", "The BOOL to drive"]],
    detail:
      "Output Energise. Follows the rung: 1 while power reaches it, 0 the moment power stops. It is rewritten every scan, so it holds no memory of its own.",
    example: "OTE Lamp lights a lamp for exactly as long as its conditions are true.",
    gotcha:
      "Two OTEs on the same tag is nearly always a bug: the lower rung overwrites the upper one every scan, so the upper appears to do nothing. Compile warns about this.",
  },
  OTL: {
    operands: [["Tag", "The BOOL to latch"]],
    detail:
      "Output Latch. Sets the bit to 1 and leaves it there. The rung going false does not reset it, only an OTU on the same tag will.",
    example: "Latching a fault so it stays visible after the condition that caused it has cleared.",
    gotcha:
      "A latched bit survives a stop. If it holds a motor on, that motor restarts when the controller goes back to run. Safety interlocks should not be latched.",
  },
  OTU: {
    operands: [["Tag", "The BOOL to unlatch"]],
    detail: "Output Unlatch. Clears the bit to 0 and leaves it there. The partner to OTL.",
    example: "A reset button that clears a latched fault.",
    gotcha:
      "If the OTL rung is above the OTU rung and both are true in the same scan, the unlatch wins, because it runs last.",
  },
  TON: {
    operands: [
      ["Timer", "A TIMER tag"],
      ["Preset", "Milliseconds to run for"],
    ],
    detail:
      "Timer On Delay. While the rung is true, ACC counts up in milliseconds. When ACC reaches PRE, the DN bit goes true and stays true while the rung stays true. The rung going false resets ACC to zero immediately.",
    example:
      "TON T1, 5000 with XIC T1.DN on a later rung starts a fan five seconds after the request.",
    gotcha:
      "The preset is in milliseconds. A preset of 5 is five thousandths of a second, and the timer appears to do nothing at all.",
  },
  TOF: {
    operands: [
      ["Timer", "A TIMER tag"],
      ["Preset", "Milliseconds to run for"],
    ],
    detail:
      "Timer Off Delay. The mirror of TON: DN is true as soon as the rung goes true, and the timing starts when the rung goes false. DN drops only once ACC reaches PRE.",
    example: "Keeping an extract fan running for thirty seconds after the process stops.",
    gotcha:
      "TOF times on the falling edge. If the rung goes true again before it finishes, it resets and DN never drops.",
  },
  CTU: {
    operands: [
      ["Counter", "A COUNTER tag"],
      ["Preset", "The count to reach"],
    ],
    detail:
      "Count Up. Adds one to ACC on each false-to-true transition of the rung, not once per scan while it is true. DN goes true when ACC reaches PRE, and ACC keeps counting past it.",
    example: "Counting parts past a sensor, with DN signalling a full box.",
    gotcha:
      "A counter is not reset by its rung going false. It needs a RES, or it counts from where it left off forever.",
  },
  CTD: {
    operands: [
      ["Counter", "A COUNTER tag"],
      ["Preset", "The count to reach"],
    ],
    detail:
      "Count Down. Subtracts one from ACC on each false-to-true transition. Used with CTU on the same tag to track a level that goes both ways.",
    example: "CTU on parts in and CTD on parts out gives the number currently inside the machine.",
  },
  RES: {
    operands: [["Tag", "The TIMER or COUNTER to reset"]],
    detail:
      "Reset. Clears ACC to zero and drops the status bits. Works on timers and counters alike.",
    gotcha:
      "RES is unconditional while its rung is true. If the rung holding it stays true, the timer it points at can never accumulate anything.",
  },
  EQU: {
    operands: [
      ["A", "First value"],
      ["B", "Second value"],
    ],
    detail:
      "Passes power when the two values are equal. Either side can be a tag or a typed number.",
  },
  NEQ: {
    operands: [
      ["A", "First value"],
      ["B", "Second value"],
    ],
    detail: "Passes power when the two values are not equal.",
  },
  GRT: {
    operands: [
      ["A", "First value"],
      ["B", "Second value"],
    ],
    detail:
      "Passes power when A is strictly greater than B. Equal values do not pass, use GEQ if the boundary should count.",
    example: "GRT Level, 80 raises a high-level alarm once the tank passes eighty.",
  },
  LES: {
    operands: [
      ["A", "First value"],
      ["B", "Second value"],
    ],
    detail:
      "Passes power when A is strictly less than B. Equal values do not pass, use LEQ if the boundary should count.",
    example: "LES Level, 10 starts the fill pump once the tank drops below ten.",
    gotcha:
      "A GRT and a LES sharing a boundary leave a gap. GRT Level, 80 and LES Level, 80 both fail at exactly 80, so a rung relying on one or the other being true goes dead at that value.",
  },
  GEQ: {
    operands: [
      ["A", "First value"],
      ["B", "Second value"],
    ],
    detail: "Passes power when A is greater than or equal to B.",
  },
  LEQ: {
    operands: [
      ["A", "First value"],
      ["B", "Second value"],
    ],
    detail: "Passes power when A is less than or equal to B.",
    gotcha:
      "Comparing against a timer's ACC is a common way to build a sequence, but compare against T1.ACC, not T1. A bare timer name is not a number.",
  },
  MOV: {
    operands: [
      ["Source", "A tag or a number"],
      ["Destination", "The tag to write"],
    ],
    detail:
      "Move. Copies the source into the destination once per scan while the rung is true. The source is unchanged.",
    example: "MOV 5000 into T1.PRE changes a dwell time while the machine is running.",
    gotcha:
      "The destination must be writable. A timer's DN, TT and EN bits are set by the controller, so moving into them is refused, write to PRE or ACC instead.",
  },
  ADD: {
    operands: [
      ["A", "First value"],
      ["B", "Second value"],
      ["Destination", "The tag to write"],
    ],
    detail: "Adds A and B and writes the result to the destination, every scan the rung is true.",
    gotcha:
      "This runs every scan, not once. ADD Total, 1, Total on a plain rung adds thousands per second, put a ONS in front of it if you meant to count.",
  },
  SUB: {
    operands: [
      ["A", "First value"],
      ["B", "Second value"],
      ["Destination", "The tag to write"],
    ],
    detail: "Subtracts B from A and writes the result.",
  },
  MUL: {
    operands: [
      ["A", "First value"],
      ["B", "Second value"],
      ["Destination", "The tag to write"],
    ],
    detail: "Multiplies A by B and writes the result.",
  },
  DIV: {
    operands: [
      ["A", "First value"],
      ["B", "Second value"],
      ["Destination", "The tag to write"],
    ],
    detail:
      "Divides A by B and writes the result. Integer division: the remainder is discarded, so 7 divided by 2 is 3.",
    gotcha:
      "Dividing by zero raises a fault in Messages and leaves the destination untouched rather than stopping the controller.",
  },
  JSR: {
    operands: [["Routine", "The routine to run"]],
    detail:
      "Jump To Subroutine. Runs the named routine to completion, then carries on with the next network here. This is how a program is split into readable pages.",
    gotcha:
      "A routine nothing calls never runs. If a page of logic seems to be ignored, check that Main has a JSR pointing at it.",
  },
};
