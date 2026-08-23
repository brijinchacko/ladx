/**
 * Articles.
 *
 * Two kinds, deliberately mixed. The evergreen ones — scan cycle, timers,
 * analog scaling — are what automation engineers actually search for, every
 * week, forever; they are the traffic. The AI ones are what the industry is
 * arguing about right now; they are the reason somebody who arrived for a timer
 * question stays and reads a second thing.
 *
 * Written to be useful on their own. An article that is really a product pitch
 * gets closed, and this audience is better than most at spotting one.
 */

export type Post = {
  slug: string;
  title: string;
  /** Shown in listings and as the meta description. One sentence. */
  summary: string;
  /** The question the reader typed into a search box. */
  intent: string;
  topic: "Fundamentals" | "AI" | "Migration" | "Practice";
  minutes: number;
  /** ISO date. */
  published: string;
  figure: "scan" | "outputImage" | "timers" | "analog" | "migration" | "aiLoop";
  /** Body paragraphs. `##` starts a section, `> ` a pull-out, "- " a list item. */
  body: string[];
};

export const POSTS: Post[] = [
  {
    slug: "plc-scan-cycle-explained",
    title: "What actually happens in one PLC scan",
    summary:
      "Read inputs, solve logic, write outputs, repeat — and the three details in that sentence that cause most of the bugs beginners write.",
    intent: "How does the PLC scan cycle work?",
    topic: "Fundamentals",
    minutes: 7,
    published: "2026-08-12",
    figure: "scan",
    body: [
      "A PLC does the same four things forever: it reads its inputs, solves the program top to bottom, writes its outputs, and does its housekeeping. Then it starts again. On a modern controller that whole loop takes somewhere between one and twenty milliseconds.",
      "That description is in every textbook, and it is correct. It is also where most beginner bugs come from, because three details inside it are easy to skim past and impossible to work around once you have.",
      "## Inputs are a photograph, not a window",
      "At the start of the scan, the controller copies the state of every physical input into memory — the input image. Your program reads that copy, not the terminal.",
      "So if a proximity sensor pulses high and low again in the middle of your scan, your program never sees it. Not 'might miss it': cannot see it. The photograph was taken before the pulse and will not be retaken until the next scan.",
      "> This is why a fast pulse needs a high-speed counter input rather than a contact in your ladder. The counter has its own hardware that does not wait for your scan.",
      "## Outputs are written at the end",
      "The same thing happens in reverse. When your coil energises, it sets a bit in the output image. The physical terminal does not change until the end of the scan, when the whole image is written out at once.",
      "For internal bits this rarely matters. For a rung that reads an output written by a *later* rung, it matters enormously — which brings us to the third detail.",
      "## Rung order is real",
      "The program is solved top to bottom. A coil on rung 12 that sets `Motor_Run` is visible to a contact on rung 13 in the same scan, because rung 13 has not been solved yet.",
      "A contact on rung 4 reading that same bit sees the value from the *previous* scan, because rung 4 was already solved before rung 12 wrote anything.",
      "This is the single most common source of 'but it should work'. The logic is right. The order is wrong. Moving one rung above another fixes it, and nothing about the rung itself changed.",
      "## How to see it happen",
      "Reading about a one-scan delay is not the same as watching one. Most teaching simulators solve rungs like a system of equations, so this behaviour never appears and students arrive at a real controller with a mental model that has never been contradicted.",
      "The simulator in LADX Studio keeps the output image, so a backward reference lags by exactly one scan the way it does on a real PLC. Build the two-rung case above, press Run, and watch the second rung catch up one sweep late.",
    ],
  },

  {
    slug: "why-chatgpt-ladder-logic-fails",
    title: "Why ChatGPT writes ladder logic that doesn't run",
    summary:
      "General models are good at the shape of PLC code and bad at the parts that matter. Here is what they get wrong, and what has to sit around them.",
    intent: "Can ChatGPT write PLC code?",
    topic: "AI",
    minutes: 8,
    published: "2026-08-06",
    figure: "aiLoop",
    body: [
      "Ask a general-purpose model for a motor start/stop circuit and you will get something that looks entirely correct: a start contact, a seal-in branch, a stop contact in series, a coil. Tag names that make sense. Comments that read well.",
      "Paste it into Studio 5000 and there is a reasonable chance it does not compile. Paste it into a running line and there is a smaller but non-zero chance of something worse.",
      "The gap is not that models are stupid about PLCs. It is that the things they are weak at happen to be exactly the things that decide whether PLC code works.",
      "## What they get right",
      "Structure, mostly. The overall shape of a rung, the idea of a seal-in, the convention that stop buttons are wired normally closed. There is a great deal of automation writing on the internet and models have read it.",
      "## What they get wrong",
      "- **Dialect drift.** Rockwell's `XIC` and Siemens' normally-open contact do the same job, and a model will happily mix the two vocabularies inside one answer because both appeared in its training data.",
      "- **Timer semantics.** `TON`, `TOF` and `RTO` differ in when they reset, and a retentive timer used where a non-retentive one belongs produces a machine that behaves correctly for exactly one cycle.",
      "- **Scan order.** Models write ladder as though it were a list of statements evaluated instantly. The one-scan lag on a backward reference is invisible in text and only appears when the thing runs.",
      "- **Confident addressing.** `%I0.0`, `I:1/0` and `Local:1:I.Data[0]` are three different platforms' ways of saying roughly the same thing, and a model asked for one will sometimes produce another.",
      "> None of these are visible by reading. All of them are visible to a compiler.",
      "## The fix is not a better prompt",
      "It is a loop. Generate, then compile the result with a real IEC 61131-3 compiler, then run a static checker over it, and if either complains, hand the errors back to the model and ask again.",
      "This is not a new idea — the research literature has converged on it, with published work showing that feedback-driven pipelines dramatically outperform single-shot generation for structured text. It is just rarely built, because it needs actual compiler infrastructure rather than an API key.",
      "The useful side effect: once the loop exists, a small free model becomes genuinely useful, because it is allowed to be wrong on the first attempt. Most of the quality comes from the checking rather than from the model.",
      "## What still needs you",
      "A compiler proves the code is valid. It does not prove the code is *right*. Whether the guard should break the seal-in or only stop the motor, whether that timer should be five seconds or fifty, whether this interlock is sufficient for the hazard — none of that is a syntax question, and none of it should be delegated.",
      "The honest description of what a tool like this does is: it removes the typing and the syntax errors, and leaves the engineering.",
    ],
  },

  {
    slug: "analog-scaling-4-20ma",
    title: "Analog scaling: turning 4–20 mA into something you can read",
    summary:
      "The arithmetic is two lines. The part that catches people is what the raw counts actually are on your controller, and what happens below 4 mA.",
    intent: "How do I scale a 4-20mA input in a PLC?",
    topic: "Fundamentals",
    minutes: 6,
    published: "2026-07-29",
    figure: "analog",
    body: [
      "A pressure transmitter sends 4 mA at zero bar and 20 mA at ten bar. Your analog card turns that current into an integer. Your program needs bar. That conversion is the most common piece of arithmetic in industrial automation, and it goes wrong in the same three ways every time.",
      "## The arithmetic",
      "It is a straight-line map from one range to another:",
      "- `scaled = (raw − raw_min) × (eng_max − eng_min) / (raw_max − raw_min) + eng_min`",
      "That is all. Everything difficult is in the four numbers you feed it.",
      "## Know your raw range",
      "This is where most of the errors live, because it is different on every platform and nobody tells you.",
      "- Allen-Bradley 1769-IF4 in 4–20 mA mode: 4 mA is **3277**, 20 mA is **16384**.",
      "- Siemens S7 analog input: 4 mA is **5530**, 20 mA is **27648**.",
      "- Many third-party cards: **0** to **4095** for a 12-bit converter, with 4 mA landing at 819.",
      "Using 0 as your `raw_min` on a 4–20 mA loop is the classic mistake. It puts zero bar at 0 mA, which the transmitter never sends, so every reading is offset by a fifth of full scale and the error is largest at the bottom of the range — where you are least likely to notice it and most likely to care.",
      "## Use the platform's instruction where there is one",
      "Rockwell has `SCP` (Scale with Parameters). Siemens has `NORM_X` followed by `SCALE_X`. Both do exactly the arithmetic above, and both are better than writing it yourself because the intermediate maths happens in a wide enough type.",
      "If you do write it by hand, do the multiply before the divide. `(raw − 3277) / 13107 × 10` in integer maths gives you zero for almost every input.",
      "## Decide what a broken wire means",
      "A 4–20 mA loop has one genuinely useful property: zero is not a valid reading. A healthy transmitter at the bottom of its range still sends 4 mA, so a reading below about 3.5 mA means the loop is broken, not that the pressure is low.",
      "That distinction is worth an explicit branch. A scaled value that quietly reports −2.5 bar because the wire fell off is worse than an alarm, because somebody will believe it.",
      "> Underrange should raise a fault. It should not clamp silently to zero, and it should certainly not be fed to a PID loop that will then open a valve.",
    ],
  },

  {
    slug: "ton-tof-rto-timers",
    title: "TON, TOF and RTO: which timer, and why it matters",
    summary:
      "Three timers that look interchangeable and are not. The differences show up in exactly one place: what happens when the rung goes false.",
    intent: "What is the difference between TON TOF and RTO?",
    topic: "Fundamentals",
    minutes: 5,
    published: "2026-07-18",
    figure: "timers",
    body: [
      "Every platform gives you at least three timers, and beginners reasonably assume the differences are cosmetic. They are not. All three behave identically while the rung is true, and differ entirely in what happens when it goes false — which is the interesting half.",
      "## TON — on-delay",
      "The rung goes true, the timer starts counting, and after the preset the done bit sets. The rung goes false and everything resets: accumulated value back to zero, done bit off.",
      "This is the one you want most of the time. 'Run the fan for three seconds after the heater starts' is a TON.",
      "## TOF — off-delay",
      "Reversed. The done bit is on while the rung is true. When the rung goes false the timer starts, and the done bit stays on until the preset expires.",
      "This is how you keep an extractor running for a minute after the machine stops, or hold a lamp lit briefly after a signal clears. The mistake is trying to build it out of a TON and a latch, which works until the rung chatters.",
      "## RTO — retentive",
      "Counts like a TON, but does not reset when the rung goes false. The accumulated value stays where it was, and counting resumes from there next time the rung goes true.",
      "It only resets when you explicitly reset it. That is the whole point, and also the trap.",
      "> An RTO with no reset instruction anywhere in the program is one of the few bugs that works perfectly during commissioning and fails weeks later, because it takes that long for the accumulator to creep up to the preset.",
      "Use RTO for genuine running totals: motor hours before service, cumulative time above a temperature. Do not use it for sequencing.",
      "## The detail nobody mentions",
      "Timers count elapsed time, not scans. A ten second preset takes ten seconds whether your scan is 2 ms or 200 ms.",
      "This sounds obvious and matters because it is the opposite of how a counter behaves, and because a simulator that advances timers once per scan will teach you something false. If your simulated ten-second timer finishes faster when the simulation runs faster, the simulator is lying to you.",
    ],
  },

  {
    slug: "plc5-to-controllogix-migration",
    title: "PLC-5 to ControlLogix: what the converter won't do for you",
    summary:
      "Rockwell's migration tool handles the mechanical part and leaves markers everywhere else. Here is what those markers actually mean.",
    intent: "How do I convert a PLC-5 program to ControlLogix?",
    topic: "Migration",
    minutes: 9,
    published: "2026-07-04",
    figure: "migration",
    body: [
      "There is a conversion tool built into Studio 5000, and it does real work. It will take an RSLogix 5 program and produce something that opens. What it will not do is finish the job, and the gap between those two things is where migration projects lose their schedule.",
      "## What converts cleanly",
      "Bit logic, mostly. Contacts, coils, latches, the ordinary timers and counters, straightforward maths. If your program is largely relay logic, a large fraction of it comes through intact.",
      "## What comes through with a marker",
      "The tool leaves comments where it could not decide. They are easy to skim past and each one is a decision somebody has to make:",
      "- **Addressing.** PLC-5 is file-and-element: `N7:0` is word zero of integer file seven. ControlLogix is tag-based. There is no automatic mapping that preserves meaning, only one that preserves data, so you end up with tags called `N7_0` and a program nobody can read.",
      "- **Block transfers.** BTR and BTW have no equivalent. Remote I/O worked differently enough that these need rewriting around the new I/O model rather than translating.",
      "- **Indexed and indirect addressing.** `#N7:[N7:10]` has a ControlLogix equivalent, but the bounds behaviour differs, and a program that relied on wrapping will not.",
      "- **PID.** The instruction exists on both platforms and the tuning constants do not mean the same thing. Copying them across gives you a loop that is stable in a different way than you intended.",
      "## The part that costs the most",
      "Not the conversion. The verification.",
      "You now have two programs that are supposed to behave identically and no way to prove it beyond reading both. On a large migration this is where the weeks go, and it is why experienced integrators often quote a rewrite instead — not because rewriting is faster, but because the verification burden is the same either way and at least a rewrite produces readable tags.",
      "## What would actually help",
      "Running both versions against the same inputs and comparing outputs. Not by hand: generate test vectors that exercise every rung's transitions, run the source and the target, and diff the results.",
      "That is what LADX Convert does with its conversion report — every element marked as converted cleanly, converted with a semantic difference worth reading, or needing a decision. Plus the simulation check, so 'these two programs agree on 94 of 96 test cases, and here are the two that differ' is a sentence you can say to a customer.",
      "> Nothing removes the engineering judgement. But 'read all forty thousand rungs carefully' is not judgement, it is a bottleneck, and it is the wrong thing for a person to spend a month on.",
    ],
  },

  {
    slug: "agentic-ai-plant-floor-2026",
    title: "Agentic AI on the plant floor: what's actually running in 2026",
    summary:
      "Every vendor has announced one. A smaller number have deployed. Here is what is genuinely in production, and what the word 'agentic' is doing in those sentences.",
    intent: "Is agentic AI real in manufacturing yet?",
    topic: "AI",
    minutes: 10,
    published: "2026-06-20",
    figure: "aiLoop",
    body: [
      "The word moved fast. Two years ago the pitch was a copilot that suggests code. Now every major automation vendor describes something 'agentic' — systems that pursue an outcome rather than answer a question. It is worth separating what has shipped from what has been announced.",
      "## What is genuinely deployed",
      "Engineering assistance is real and in use. Siemens' Industrial Copilot generates structured text inside TIA Portal and has been taken up at scale by industrial customers. Rockwell's FactoryTalk Design Studio has a code assistant built on a purpose-trained small model rather than a general one. Beckhoff's TwinCAT assistant reports productivity gains in the twenty to thirty percent range, concentrated in onboarding and documentation.",
      "Notice what those have in common: they all sit in the *engineering* environment, not the *runtime*. They help you write the program. None of them touches a running controller.",
      "## What 'agentic' currently means in practice",
      "Mostly: multi-step, with tools, and allowed to retry. An agent that reads a fault code, searches the manual, checks the last three work orders and proposes a cause is doing something meaningfully more than autocomplete. It is also not making decisions about the machine — it is assembling context faster than a person could.",
      "That is a real and useful capability, and the honest framing of it is 'a very fast technician who has read everything', not autonomy.",
      "## What is not happening, and probably should not",
      "Closed-loop control by a language model. Nobody serious is proposing that a probabilistic system should write directly to a controller running a machine that can hurt somebody, and the regulatory picture would not permit it even if they were.",
      "The interesting constraint is not technical. It is that safety cases are built on determinism and traceability, and 'the model decided' is not an answer that survives an audit.",
      "> The useful question for 2026 is not whether AI can drive a plant. It is which parts of an engineer's week are not engineering — documentation, translation between dialects, searching manuals, writing the same interlock for the ninth time — and how much of that can be given away safely.",
      "## The constraint most vendors do not talk about",
      "Most OT networks do not have internet access, and that is not an oversight. A cloud assistant is unavailable in exactly the environment where the work happens, which is why the deployments you read about are usually in the engineering office rather than on the line.",
      "This is the strongest argument for local models in industry, and the reason it matters more here than in most software: air-gapped is not a paranoid preference, it is the default condition of the network.",
    ],
  },

  {
    slug: "siemens-vs-allen-bradley-thinking",
    title: "Siemens and Allen-Bradley don't just differ in syntax",
    summary:
      "Moving between the two platforms is less about learning new mnemonics and more about two genuinely different mental models of what a program is.",
    intent: "What is the difference between Siemens and Allen-Bradley PLCs?",
    topic: "Practice",
    minutes: 8,
    published: "2026-06-08",
    figure: "migration",
    body: [
      "Engineers who work across both platforms will tell you the hard part is not remembering that `XIC` is a normally-open contact. It is that the two systems disagree about what a program *is*, and the disagreement shows up everywhere once you notice it.",
      "## Memory: tags versus areas",
      "ControlLogix gives you tags. You declare `Conveyor_Run` as a BOOL and the controller decides where it lives. Structure is expressed in the type system — arrays, user-defined types, nesting.",
      "Siemens gives you memory areas with symbolic names layered over them. `%M0.0` is a real address, and `Conveyor_Run` is a name for it. Data blocks are more like structs you allocate explicitly.",
      "Neither is wrong. But a Rockwell engineer's instinct is to define a type, and a Siemens engineer's is to lay out a data block — and code written with the wrong instinct works while reading badly to everyone who maintains it.",
      "## Program organisation",
      "Rockwell has programs containing routines, with a main routine calling subroutines via `JSR`. Tasks are configured separately, and periodic tasks are common but not the default habit.",
      "Siemens leans harder on organisation blocks. `OB1` is cyclic, and there are specific OBs for startup, for time interrupts, for hardware interrupts, for errors. The structure is more prescribed and, once learned, more predictable.",
      "## Where the differences actually bite",
      "- **Timers.** Rockwell timers are structures with `.ACC`, `.PRE` and `.DN`. Siemens IEC timers are function blocks with their own instance data. Converting one to the other is not a rename.",
      "- **Analog handling.** Different raw ranges, different scaling instructions, different conventions about where scaling happens.",
      "- **Rung comments.** Rockwell attaches them to rungs; Siemens attaches them to networks with a title as well. The information is the same and the export formats disagree, which is why comments are so often the first casualty of a conversion.",
      "## Practical advice for working across both",
      "Keep one vocabulary in your head and translate at the edges, rather than trying to think natively in whichever platform you happen to have open. Most people find neutral terms easier: 'normally open contact' rather than `XIC` or `-| |-`.",
      "That is the same reason LADX stores logic in a vendor-neutral form internally and renders it in whichever dialect you asked for. The concept is the stable thing; the spelling is not.",
    ],
  },
];

export const TOPICS = ["All", "Fundamentals", "AI", "Migration", "Practice"] as const;

export function getPost(slug: string): Post | undefined {
  return POSTS.find((p) => p.slug === slug);
}

export function sortedPosts(): Post[] {
  return [...POSTS].sort((a, b) => b.published.localeCompare(a.published));
}
