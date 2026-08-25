import type { FigureKey } from "@/components/site/figures";
import { MORE_POSTS } from "@/content/posts-more";

/**
 * Articles.
 *
 * Two kinds, deliberately mixed. The evergreen ones (scan cycle, timers,
 * analog scaling) are what automation engineers actually search for, every
 * week, forever; they are the traffic. The AI ones are what the industry is
 * arguing about right now; they are the reason somebody who arrived for a timer
 * question stays and reads a second thing.
 *
 * Written to be useful on their own. An article that is really a product pitch
 * gets closed, and this audience is better than most at spotting one.
 */

export type Topic =
  | "Fundamentals"
  | "Instructions"
  | "Analog & I/O"
  | "Platforms"
  | "Migration"
  | "Languages"
  | "Networking"
  | "AI"
  | "Practice"
  | "Safety"
  | "HMI & SCADA"
  | "Drives & Motion"
  | "Instrumentation"
  | "Panel & Electrical"
  | "Compliance";

export type Post = {
  slug: string;
  title: string;
  /** Shown in listings and as the meta description. One sentence. */
  summary: string;
  /** The question the reader typed into a search box. */
  intent: string;
  /**
   * The direct answer, in two or three sentences, rendered before the body.
   *
   * Retrieval systems select passages, not pages, and the passage they take is
   * usually the one nearest the top that answers the question outright. Burying
   * the answer under six paragraphs of preamble is the single most common way a
   * genuinely good article fails to get quoted.
   */
  answer: string;
  topic: Topic;
  minutes: number;
  /** ISO date. */
  published: string;
  /** ISO date. Freshness is a measured input to AI citation. */
  updated?: string;
  figure: FigureKey;
  /** Entities the article genuinely covers, for `about` in the schema. */
  about?: string[];
  /**
   * Self-contained question and answer pairs, emitted as FAQPage schema.
   *
   * The highest-leverage structure for answer engines, because it hands them
   * exactly the shape they are assembling. Answers are written to stand alone
   * at roughly 40 to 60 words.
   */
  faq?: { q: string; a: string }[];
  /** Body paragraphs. `##` starts a section, `> ` a pull-out, "- " a list item. */
  body: string[];
};

/**
 * The first set: fundamentals, instructions, platforms and the AI argument.
 *
 * Split from the second set only because one file of a hundred articles is a
 * file nobody opens. `POSTS` below is what everything else reads.
 */
const CORE_POSTS: Post[] = [
  {
    slug: "plc-scan-cycle-explained",
    title: "What actually happens in one PLC scan",
    summary:
      "Read inputs, solve logic, write outputs, repeat. Plus the three details in that sentence that cause most of the bugs beginners write.",
    intent: "How does the PLC scan cycle work?",
    answer:
      "A PLC repeats four steps forever: it copies every physical input into memory, solves the program top to bottom, writes the output image to the terminals, then does housekeeping. On a modern controller that loop takes one to twenty milliseconds. Three consequences follow: a pulse shorter than one scan is invisible, outputs do not change mid-scan, and rung order decides what sees what.",
    topic: "Fundamentals",
    minutes: 7,
    published: "2026-08-12",
    figure: "scan",
    about: ["PLC scan cycle", "input image", "output image", "IEC 61131-3"],
    faq: [
      {
        q: "How long is a typical PLC scan?",
        a: "One to twenty milliseconds on a modern controller, depending on program size and processor. Small programs on fast CPUs run under a millisecond. The figure that matters is not the average but the worst case, because that sets the shortest signal your program can reliably see.",
      },
      {
        q: "Why does my PLC miss a fast input pulse?",
        a: "Inputs are sampled once per scan into the input image. A pulse that goes high and low again between two samples never appears in memory, so the program cannot see it. Signals shorter than one scan need a high-speed counter or an interrupt input, not ladder logic.",
      },
      {
        q: "Does rung order matter in ladder logic?",
        a: "Yes. The program solves top to bottom, so a coil on rung 12 is visible to a contact on rung 13 in the same scan, but a contact on rung 4 reads the value from the previous scan. Moving a rung can fix logic that looked correct.",
      },
    ],
    body: [
      "A PLC does the same four things forever: it reads its inputs, solves the program top to bottom, writes its outputs, and does its housekeeping. Then it starts again.",
      "That description is in every textbook, and it is correct. It is also where most beginner bugs come from, because three details inside it are easy to skim past and impossible to work around once you have.",
      "## Inputs are a photograph, not a window",
      "At the start of the scan, the controller copies the state of every physical input into memory. That copy is the input image, and your program reads it rather than the terminal.",
      "So if a proximity sensor pulses high and low again in the middle of your scan, your program never sees it. Not 'might miss it': cannot see it. The photograph was taken before the pulse and will not be retaken until the next scan.",
      "> This is why a fast pulse needs a high-speed counter input rather than a contact in your ladder. The counter has its own hardware that does not wait for your scan.",
      "## Outputs are written at the end",
      "The same thing happens in reverse. When your coil energises, it sets a bit in the output image. The physical terminal does not change until the end of the scan, when the whole image is written out at once.",
      "For internal bits this rarely matters. For a rung that reads an output written by a *later* rung, it matters enormously, which brings us to the third detail.",
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
    slug: "output-image-explained",
    title: "The output image: why your coil did not work",
    summary:
      "A coil sets a bit in memory, not a terminal. Understanding when that memory reaches the real world explains a whole class of bugs.",
    intent: "Why does my PLC coil not turn on immediately?",
    answer:
      "A coil writes to the output image in memory, not directly to the terminal. The whole image is copied to the physical outputs once, at the end of the scan. Within the program, a coil is visible immediately to any rung solved after it, and only on the next scan to any rung solved before it.",
    topic: "Fundamentals",
    minutes: 6,
    published: "2026-08-10",
    figure: "outputImage",
    about: ["output image", "PLC scan", "ladder logic"],
    faq: [
      {
        q: "What is the output image table?",
        a: "A block of memory holding the intended state of every physical output. Coils write to it during the scan, and the controller copies the whole block to the terminals once the program has finished solving. It exists so that outputs change together rather than flickering as rungs execute.",
      },
      {
        q: "Can a coil be read by another rung in the same scan?",
        a: "Yes, if that rung comes after it. Rungs solve in order against the same memory, so a later rung sees what an earlier coil just wrote. An earlier rung sees the previous scan's value, because it had already been solved.",
      },
    ],
    body: [
      "A coil in ladder logic looks like it energises a terminal. It does not. It sets a bit in a block of memory called the output image, and the controller copies that whole block to the physical terminals once, after the entire program has been solved.",
      "## Why it works that way",
      "Consistency. If outputs changed the instant each coil solved, a machine would see them arrive in program order, staggered across the scan. Writing them together means every output changes at the same instant, which is what the wiring diagram implies and what the machine expects.",
      "## The consequence people trip over",
      "Inside the program, the output image is just memory, and memory is readable immediately. A rung solved after your coil sees the new value. A rung solved before it sees the old one.",
      "That asymmetry is the whole bug class. Two rungs that look independent behave differently depending on which is first, and nothing in the rung itself tells you so.",
      "> If a rung works only every other scan, or takes two presses to respond, look at the order before you look at the logic.",
      "## How to check it",
      "Put the suspect bit in a trend or a watch table and step the program one scan at a time. A one-scan lag is obvious when you can see individual sweeps and invisible at full speed.",
    ],
  },
  {
    slug: "normally-open-vs-normally-closed",
    title: "Normally open and normally closed, in the field and in the code",
    summary:
      "The most common wiring mistake in automation comes from a contact meaning one thing on a drawing and another in a rung.",
    intent: "What is the difference between normally open and normally closed contacts?",
    answer:
      "A normally open contact passes power when its bit is 1; a normally closed one passes power when its bit is 0. The confusion is that the same words describe the physical switch, and a normally closed stop button sends 1 when healthy. So a healthy stop button is read with a normally open instruction, which looks backwards until you separate the device from the instruction.",
    topic: "Fundamentals",
    minutes: 6,
    published: "2026-08-08",
    figure: "outputImage",
    about: ["normally open", "normally closed", "XIC", "XIO", "fail safe wiring"],
    faq: [
      {
        q: "Should a stop button be normally open or normally closed?",
        a: "Normally closed, always. A normally closed stop button passes current when healthy, so a broken wire or a failed contact stops the machine rather than leaving it running. This is fail-safe wiring and it is the reason the instruction in the rung looks inverted.",
      },
      {
        q: "Why does my stop button use an XIC instruction?",
        a: "Because the button is wired normally closed, so the input is 1 when the button is not pressed. Examining for 1 means the rung conducts while the button is healthy. Using XIO there would run the machine only while somebody held the stop button down.",
      },
    ],
    body: [
      "Two things share the same two words, and mixing them up is the most common wiring error in the trade.",
      "## The device",
      "A normally open pushbutton has no continuity until you press it. A normally closed one has continuity until you press it. That is a fact about the switch on the panel and it has nothing to do with your program.",
      "## The instruction",
      "In ladder logic, an examine-if-closed instruction passes rung power when the bit it reads is 1. An examine-if-open instruction passes power when the bit is 0. That is a fact about the code.",
      "## Where they collide",
      "A stop button should be wired normally closed, so that a cut wire stops the machine instead of leaving it running. Wired that way, the input is 1 when everything is healthy and 0 when somebody presses stop.",
      "Which means the rung reads it with an examine-if-closed instruction, and to a beginner the ladder appears to say 'run while stop is true'. It does. Stop being true means the stop circuit is intact.",
      "> Write the meaning in the tag name. `Stop_PB_NC` or `Stop_Healthy` costs nothing and answers the question before it is asked.",
      "## The rule worth memorising",
      "Anything whose failure should stop the machine gets wired normally closed: stop buttons, e-stops, guard switches, thermal overloads. Anything whose failure should do nothing gets wired normally open: start buttons, jog, reset.",
    ],
  },
  {
    slug: "latching-vs-seal-in",
    title: "Seal-in or latch: two ways to hold a motor on",
    summary:
      "Both keep an output energised after the button is released. They fail differently, and that difference is the whole reason to choose.",
    intent: "What is the difference between a seal-in and a latch instruction?",
    answer:
      "A seal-in holds an output on by routing the output's own contact in parallel with the start button, so the rung keeps conducting. A latch instruction sets a bit that stays set until explicitly unlatched. The critical difference is power loss: a seal-in drops out and does not restart, while a latched bit in retentive memory can come back on.",
    topic: "Fundamentals",
    minutes: 7,
    published: "2026-08-05",
    figure: "outputImage",
    about: ["seal-in circuit", "latch", "OTL", "OTU", "motor starter"],
    faq: [
      {
        q: "Is a seal-in safer than a latch?",
        a: "Usually, yes. A seal-in depends on the rung conducting, so losing power drops the output and it does not restart when power returns. A latched bit stored in retentive memory can survive a power cycle and re-energise a motor nobody is expecting to move.",
      },
      {
        q: "How does a seal-in circuit work?",
        a: "The output's own contact is placed in parallel with the momentary start button. Pressing start energises the output, and the output's contact then holds the rung true after the button is released. A normally closed stop contact in series breaks the path.",
      },
    ],
    body: [
      "Both patterns solve the same problem: a momentary button, and an output that must stay on after you let go.",
      "## The seal-in",
      "Put the output's own contact in parallel with the start button, and a stop contact in series after them. Press start, the coil energises, and its own contact now holds the rung true. Release start and nothing changes. Press stop and the path breaks.",
      "The behaviour is a property of the circuit. Nothing remembers anything; the rung is simply still conducting.",
      "## The latch",
      "An output latch instruction sets a bit. An unlatch instruction clears it. Between the two, the bit stays set whether or not the rung that set it is still true.",
      "## Where they part company",
      "Power loss. A seal-in is holding because the rung conducts, so when power goes the output drops and, on return, the rung is false and the motor stays off. Somebody has to press start.",
      "A latched bit in retentive memory survives. Power returns, the bit is still set, and the motor starts on its own.",
      "> That is not a bug in the latch instruction. It is the behaviour it exists to provide, and it is exactly wrong for a motor somebody might be standing next to.",
      "## Choosing",
      "Use a seal-in for anything that moves. Use a latch for state that should survive a restart on purpose: a fault that must stay recorded, a mode selection, a batch step you do not want to lose.",
    ],
  },
  {
    slug: "ton-tof-rto-timers",
    title: "TON, TOF and RTO: which timer, and why it matters",
    summary:
      "Three timers that look interchangeable and are not. The differences show up in exactly one place: what happens when the rung goes false.",
    intent: "What is the difference between TON TOF and RTO?",
    answer:
      "All three count while their rung is true and differ entirely in what happens when it goes false. A TON resets to zero. A TOF starts counting down and holds its output on until the preset expires. An RTO keeps its accumulated value and resumes from there, and only clears when explicitly reset.",
    topic: "Instructions",
    minutes: 5,
    published: "2026-07-18",
    figure: "timers",
    about: ["TON", "TOF", "RTO", "PLC timers", "IEC timers"],
    faq: [
      {
        q: "When should I use an RTO instead of a TON?",
        a: "Use RTO for genuine running totals, such as motor hours before service or cumulative time above a temperature. Never use it for sequencing. An RTO with no reset instruction anywhere works perfectly during commissioning and fails weeks later when the accumulator finally reaches the preset.",
      },
      {
        q: "Do PLC timers count scans or milliseconds?",
        a: "Milliseconds of elapsed time. A ten second preset takes ten seconds whether the scan is 2 ms or 200 ms. Any simulator whose timers finish faster when it runs faster is counting scans, and is teaching you something that is not true of real hardware.",
      },
    ],
    body: [
      "Every platform gives you at least three timers, and beginners reasonably assume the differences are cosmetic. They are not. All three behave identically while the rung is true, and differ entirely in what happens when it goes false, which is the interesting half.",
      "## TON, on-delay",
      "The rung goes true, the timer starts counting, and after the preset the done bit sets. The rung goes false and everything resets: accumulated value back to zero, done bit off.",
      "This is the one you want most of the time. 'Run the fan for three seconds after the heater starts' is a TON.",
      "## TOF, off-delay",
      "Reversed. The done bit is on while the rung is true. When the rung goes false the timer starts, and the done bit stays on until the preset expires.",
      "This is how you keep an extractor running for a minute after the machine stops, or hold a lamp lit briefly after a signal clears. The mistake is trying to build it out of a TON and a latch, which works until the rung chatters.",
      "## RTO, retentive",
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
    slug: "ctu-ctd-counters",
    title: "Counters: CTU, CTD, and the reset everyone forgets",
    summary:
      "Counters look simpler than timers and cause more field problems, almost all of them traceable to the same two mistakes.",
    intent: "How do PLC counters work?",
    answer:
      "A count-up instruction increments its accumulator once per false-to-true transition of its rung, not once per scan, and sets its done bit when the accumulator reaches the preset. It keeps counting past the preset and never clears itself. Every counter needs an explicit reset, and forgetting one is the most common counter fault in the field.",
    topic: "Instructions",
    minutes: 6,
    published: "2026-07-15",
    figure: "counters",
    about: ["CTU", "CTD", "PLC counter", "reset instruction"],
    faq: [
      {
        q: "Why does my counter increment more than once per press?",
        a: "It is almost certainly counting scans rather than transitions, which happens when the counting instruction is fed by a level rather than an edge. A correctly implemented count-up counts one per false-to-true transition, so a held button counts once regardless of how many scans it is held for.",
      },
      {
        q: "Does a counter stop at its preset?",
        a: "No. The done bit sets when the accumulator reaches the preset, but the accumulator keeps incrementing past it until it overflows or is reset. If your logic assumes the count equals the preset, it will be wrong the moment an extra part goes past the sensor.",
      },
    ],
    body: [
      "A counter increments once per false-to-true transition of its rung and sets a done bit when it reaches a preset. That is the whole instruction, and two details in it cause almost every counter problem in the field.",
      "## It counts edges, not scans",
      "Hold the input on for a second at a 10 ms scan and a correctly implemented counter counts one, not a hundred. The instruction remembers the previous state of its own rung and only increments on the transition.",
      "This matters because it is the opposite of how a timer behaves, and because it is easy to build something that looks like a counter and counts scans instead.",
      "## It does not stop, and it does not clear",
      "The done bit sets when the accumulator reaches the preset. The accumulator carries on. It will keep going until it overflows or somebody resets it.",
      "> If your logic tests for accumulator equals preset rather than for the done bit, it works exactly once and then never again.",
      "## The reset is not optional",
      "Every counter needs a reset path, and it needs to be reachable. The usual failures are a reset conditioned on something that never becomes true, and a reset that clears the counter on the same scan it reaches the preset, so the done bit is never seen by anything downstream.",
      "## Counting parts on a fast line",
      "If parts pass faster than the scan, ladder cannot count them. The sensor pulse has to be longer than the worst-case scan or the count is wrong in a way that looks like a sensor fault. Use a high-speed counter input.",
    ],
  },
  {
    slug: "one-shot-instructions",
    title: "One shots: doing something exactly once",
    summary:
      "The instruction that turns a held button into a single event, and the three places it is genuinely required.",
    intent: "What is a one shot in PLC programming?",
    answer:
      "A one shot, also written ONS or OSR, passes rung power for exactly one scan on each false-to-true transition of its input. It exists because most inputs are levels held for hundreds of scans, while most actions should happen once. It remembers the previous state of its own rung, which is why two one shots on the same tag behave independently.",
    topic: "Instructions",
    minutes: 5,
    published: "2026-07-11",
    figure: "oneShot",
    about: ["one shot", "ONS", "OSR", "edge detection", "R_TRIG"],
    faq: [
      {
        q: "When do I need a one shot?",
        a: "Whenever an action must happen once per event rather than continuously: incrementing a counter, capturing a value at the moment of a trigger, starting a sequence, or sending a message. Without one, a button held for one second at a 10 ms scan fires the action a hundred times.",
      },
      {
        q: "What is the Structured Text equivalent of a one shot?",
        a: "An R_TRIG function block for a rising edge or F_TRIG for a falling edge, each needing its own instance variable. There is no expression for 'was false last scan', so the state has to be stored somewhere, which is exactly what the instance provides.",
      },
    ],
    body: [
      "A one shot passes rung power for a single scan each time its input goes from false to true. Hold the input for a thousand scans and it fires once.",
      "## Why it is needed so often",
      "Inputs are levels. A button is held for a few hundred milliseconds, which at a 10 ms scan is dozens of scans. Actions are usually events. Incrementing a count, capturing a reading, advancing a step: all of these should happen once per press.",
      "Without a one shot, a single press increments a counter forty times and nobody can work out why.",
      "## Each instance has its own memory",
      "A one shot remembers the previous state of its own rung, not of the tag it reads. Two one shots watching the same bit in different rungs behave independently, which is what you want and occasionally surprising.",
      "> This is also why a one shot cannot be shared. Copying a rung that contains one and forgetting to give the copy its own storage bit produces two instructions fighting over one memory location.",
      "## The three places it is genuinely required",
      "- **Counting.** Any count driven by a level rather than an edge.",
      "- **Capture.** Latching a measurement at the moment a trigger occurs, before it changes.",
      "- **Sequencing.** Advancing a step exactly once when a condition becomes true, rather than racing through every step in a single scan.",
    ],
  },
  {
    slug: "move-and-math-instructions",
    title: "MOV, ADD and the rest: maths in ladder logic",
    summary: "Arithmetic in a rung is conditional, which changes how you have to think about it.",
    intent: "How do you do math in ladder logic?",
    answer:
      "Maths instructions in ladder sit on the output side, so they execute only while the rung is true. A MOV copies a source to a destination; ADD, SUB, MUL and DIV take two operands and a destination. Because they are conditional, an unconditional calculation needs an always-true rung, and integer division truncates rather than rounding.",
    topic: "Instructions",
    minutes: 6,
    published: "2026-07-08",
    figure: "dataTypes",
    about: ["MOV", "ADD", "integer math", "PLC arithmetic"],
    faq: [
      {
        q: "Why is my PLC division returning zero?",
        a: "Integer division truncates. Dividing 5 by 10 in integer maths gives 0, not 0.5. Either multiply before you divide, so the intermediate value stays large, or use a REAL data type for the calculation and convert at the end.",
      },
      {
        q: "Does a MOV instruction run every scan?",
        a: "Only while its rung is true. A MOV on an unconditional rung runs every scan, which is usually what you want for continuous calculations. A MOV behind a condition runs only when that condition holds, which is what you want for latching a value.",
      },
    ],
    body: [
      "Maths instructions live on the output side of a rung, which means they are conditional. That single fact accounts for most of the surprises.",
      "## Conditional by default",
      "`MOV(Setpoint, Target)` behind a contact copies only while the contact conducts. Behind nothing, on an unconditional rung, it copies every scan.",
      "Both are useful. Continuous scaling wants every scan. Capturing a value at a moment wants a condition and usually a one shot.",
      "## Integer division truncates",
      "This catches everyone once. `5 / 10` in integer maths is `0`. Scaling code written as `(raw - offset) / span * range` produces zero for almost every input, because the division happens first and throws away everything.",
      "> Multiply before you divide, or do the calculation in a REAL and convert at the end. The instruction order is the fix, not the data type alone.",
      "## Overflow is silent",
      "An INT holds up to 32,767. Multiply two values that each look reasonable and the result wraps into a negative number with no error and no indication. If the operands can be large, use a DINT for the destination and the intermediate.",
      "## Where ladder stops being the right tool",
      "Three nested calculations across six rungs is harder to read than four lines of Structured Text. Most platforms let you call an ST routine from ladder, and a calculation is exactly the thing worth moving.",
    ],
  },
  {
    slug: "comparison-instructions",
    title: "Comparison instructions and the analog value that is never equal",
    summary: "EQU, GRT, LES and the reason comparing analog values for equality does not work.",
    intent: "How do comparison instructions work in ladder logic?",
    answer:
      "Comparison instructions sit on the condition side and pass rung power when the comparison is true. EQU tests equality, NEQ inequality, GRT and LES magnitude, GEQ and LEQ inclusive magnitude. Testing an analog value for exact equality almost never works, because a measured value passes through the target between scans rather than landing on it.",
    topic: "Instructions",
    minutes: 5,
    published: "2026-07-04",
    figure: "analog",
    about: ["EQU", "GRT", "LES", "comparison instructions", "deadband"],
    faq: [
      {
        q: "Why does my equality comparison on an analog value never trigger?",
        a: "Because the value is sampled once per scan and rarely lands exactly on the target. A temperature rising through 80 degrees might read 79.6 on one scan and 80.4 on the next, never 80. Use a greater-than comparison, and add a deadband so the result does not chatter at the threshold.",
      },
      {
        q: "What is a deadband and why do I need one?",
        a: "A deadband is a gap between the point where a condition turns on and the point where it turns off. Without one, a value hovering at the threshold toggles the output every scan. Turning on at 80 and off at 78 gives two degrees of hysteresis and a stable output.",
      },
    ],
    body: [
      "Comparison instructions go on the condition side of a rung and pass power when the comparison holds. The instructions themselves are simple. Applying them to measured values is where the problems live.",
      "## Never compare an analog value for equality",
      "A temperature rising through 80 degrees is sampled once per scan. It might read 79.6, then 80.4. It never reads exactly 80, so an equality test never fires and the machine waits forever.",
      "Use greater-than or less-than for anything measured. Reserve equality for values your own program set, such as a step number or a mode.",
      "## Add a deadband",
      "A value sitting near the threshold crosses it repeatedly, and an output driven directly from the comparison chatters at scan rate. Contactors do not enjoy this.",
      "> Turn on above 80 and off below 78. The two degrees of hysteresis costs nothing and turns a chattering output into a stable one.",
      "## Watch the data types",
      "Comparing a REAL against an INT works on most platforms and quietly converts one of them first. Comparing a scaled REAL against a raw count compiles fine and is meaningless. Name the tags so the mismatch is visible in the rung.",
    ],
  },
  {
    slug: "analog-scaling-4-20ma",
    title: "Analog scaling: turning 4-20 mA into something you can read",
    summary:
      "The arithmetic is two lines. The part that catches people is what the raw counts actually are on your controller, and what happens below 4 mA.",
    intent: "How do I scale a 4-20mA input in a PLC?",
    answer:
      "Scaling is a straight-line map: subtract the raw minimum, multiply by the engineering span, divide by the raw span, then add the engineering minimum. The part that goes wrong is the raw range, which differs by platform: 4 mA is 3277 counts on a 1769-IF4 and 5530 on a Siemens analog input, not zero.",
    topic: "Analog & I/O",
    minutes: 6,
    published: "2026-07-29",
    figure: "analog",
    about: ["4-20mA", "analog scaling", "SCP", "NORM_X", "SCALE_X"],
    faq: [
      {
        q: "What raw value does 4 mA give on an Allen-Bradley analog card?",
        a: "On a 1769-IF4 in 4-20 mA mode, 4 mA reads 3277 counts and 20 mA reads 16384. Using zero as the raw minimum is the classic error: it places zero engineering units at 0 mA, which the transmitter never sends, so every reading is offset.",
      },
      {
        q: "What should happen when a 4-20mA loop breaks?",
        a: "It should raise a fault. A healthy transmitter at the bottom of its range still sends 4 mA, so a reading below about 3.5 mA means the loop is broken rather than the process being low. Clamping silently to zero produces a plausible reading that somebody will believe.",
      },
    ],
    body: [
      "A pressure transmitter sends 4 mA at zero bar and 20 mA at ten bar. Your analog card turns that current into an integer. Your program needs bar. That conversion is the most common piece of arithmetic in industrial automation, and it goes wrong in the same three ways every time.",
      "## The arithmetic",
      "It is a straight-line map from one range to another:",
      "- `scaled = (raw - raw_min) * (eng_max - eng_min) / (raw_max - raw_min) + eng_min`",
      "That is all. Everything difficult is in the four numbers you feed it.",
      "## Know your raw range",
      "This is where most of the errors live, because it is different on every platform and nobody tells you.",
      "- Allen-Bradley 1769-IF4 in 4-20 mA mode: 4 mA is **3277**, 20 mA is **16384**.",
      "- Siemens S7 analog input: 4 mA is **5530**, 20 mA is **27648**.",
      "- Many third-party cards: **0** to **4095** for a 12-bit converter, with 4 mA landing at 819.",
      "Using 0 as your `raw_min` on a 4-20 mA loop is the classic mistake. It puts zero bar at 0 mA, which the transmitter never sends, so every reading is offset by a fifth of full scale and the error is largest at the bottom of the range, where you are least likely to notice it and most likely to care.",
      "## Use the platform's instruction where there is one",
      "Rockwell has `SCP`, Scale with Parameters. Siemens has `NORM_X` followed by `SCALE_X`. Both do exactly the arithmetic above, and both are better than writing it yourself because the intermediate maths happens in a wide enough type.",
      "If you do write it by hand, do the multiply before the divide. `(raw - 3277) / 13107 * 10` in integer maths gives you zero for almost every input.",
      "## Decide what a broken wire means",
      "A 4-20 mA loop has one genuinely useful property: zero is not a valid reading. A healthy transmitter at the bottom of its range still sends 4 mA, so a reading below about 3.5 mA means the loop is broken, not that the pressure is low.",
      "That distinction is worth an explicit branch. A scaled value that quietly reports -2.5 bar because the wire fell off is worse than an alarm, because somebody will believe it.",
      "> Underrange should raise a fault. It should not clamp silently to zero, and it should certainly not be fed to a PID loop that will then open a valve.",
    ],
  },
  {
    slug: "sinking-vs-sourcing",
    title: "Sinking and sourcing, settled",
    summary:
      "Two words that describe which way current flows, and a reliable way to stop guessing which one you need.",
    intent: "What is the difference between sinking and sourcing inputs?",
    answer:
      "Sourcing supplies current, sinking accepts it. A sourcing output pushes current into a sinking input, and a sinking output pulls current from a sourcing input. The pairing rule is the only thing you have to remember: a sourcing device must connect to a sinking one, never to another sourcing device.",
    topic: "Analog & I/O",
    minutes: 6,
    published: "2026-06-30",
    figure: "wiring",
    about: ["sinking", "sourcing", "PNP", "NPN", "24VDC wiring"],
    faq: [
      {
        q: "Is PNP sinking or sourcing?",
        a: "A PNP sensor is sourcing: it supplies positive current to the input when it activates. An NPN sensor is sinking: it pulls the input down to common. PNP is the European convention and dominates on Siemens systems; NPN is more common on Japanese equipment.",
      },
      {
        q: "Can I connect a sourcing sensor to a sourcing input?",
        a: "No. Both would be trying to supply current and neither would accept it, so the circuit never completes and the input never turns on. A sourcing device must pair with a sinking one. If a sensor and a card do not match, you need an interposing relay or a different card.",
      },
    ],
    body: [
      "Sourcing supplies current. Sinking accepts it. Everything else follows from that sentence, including which sensor works with which card.",
      "## The pairing rule",
      "A sourcing device must connect to a sinking device. A sourcing sensor pushes current, so it needs an input that will accept it. A sinking sensor pulls current, so it needs an input that will supply it.",
      "Two sourcing devices connected together do nothing at all, because nothing completes the circuit.",
      "## Which is which",
      "PNP is sourcing. NPN is sinking. That is the pairing most people memorise, and it is enough for the majority of sensor selections.",
      "> A useful check with no jargon in it: with the sensor active, does the signal wire sit near 24 V or near 0 V? Near 24 V means it is sourcing. Near 0 V means it is sinking.",
      "## Why both exist",
      "Convention, mostly regional. PNP dominates in Europe and on Siemens equipment; NPN is more common on Japanese machinery. Neither is safer or faster.",
      "There is one practical argument for PNP: with a sinking input card, a short to ground on the signal wire looks exactly like a switched-on sensor. With sourcing, it looks like nothing.",
      "## When they do not match",
      "An interposing relay solves it for a handful of points. For more than a few, change the card. Wiring around a mismatch with pull-up resistors works on a bench and fails in a cabinet at 40 degrees.",
    ],
  },
  {
    slug: "plc-data-types",
    title: "BOOL, INT, DINT, REAL: choosing the right type",
    summary:
      "Picking a type is a decision about range, memory and precision, and getting it wrong shows up as an overflow nobody sees.",
    intent: "What data types are used in PLC programming?",
    answer:
      "The four that cover most work are BOOL for a single bit, INT for whole numbers from -32,768 to 32,767, DINT for a 32-bit integer up to about 2.1 billion, and REAL for a 32-bit floating point value. The common failure is INT overflow, which wraps silently to a negative number with no error and no warning.",
    topic: "Fundamentals",
    minutes: 6,
    published: "2026-06-26",
    figure: "dataTypes",
    about: ["BOOL", "INT", "DINT", "REAL", "data types", "overflow"],
    faq: [
      {
        q: "What happens when an INT overflows in a PLC?",
        a: "It wraps. Adding one to 32,767 gives -32,768, silently, with no fault and no indication. Any calculation whose intermediate result can exceed 32,767 needs a DINT for the destination, and often for the intermediate as well.",
      },
      {
        q: "Should I use REAL for everything to be safe?",
        a: "No. REAL cannot represent most decimal values exactly, so equality comparisons are unreliable and repeated arithmetic accumulates error. Use integers for counting and REAL for measured quantities and calculations that genuinely need fractions.",
      },
    ],
    body: [
      "Four types cover most industrial work, and the choice between them is about range, memory and precision.",
      "## The four",
      "- **BOOL**: one bit. On or off.",
      "- **INT**: 16 bits, -32,768 to 32,767.",
      "- **DINT**: 32 bits, roughly plus or minus 2.1 billion.",
      "- **REAL**: 32 bits of floating point, about seven significant digits.",
      "## The failure that costs the most",
      "INT overflow. Multiply 1,000 by 100 in INTs and the answer is not 100,000; it is a negative number, arrived at silently.",
      "This bites in scaling code, in totalisers, and in anything counting parts over a shift. The fix is to use a DINT for the destination and for the intermediate, not only the final result.",
      "> If a value can grow over time, it is a DINT. Shift totals, motor hours, part counts.",
      "## REAL is not a safe default",
      "Floating point cannot represent 0.1 exactly. Two REALs that should be equal frequently are not, which makes equality comparisons unreliable, and repeated addition accumulates error.",
      "Use REAL where you are representing a measured physical quantity. Use integers where you are counting.",
    ],
  },
  {
    slug: "siemens-vs-allen-bradley-thinking",
    title: "Siemens and Allen-Bradley do not just differ in syntax",
    summary:
      "Moving between the two platforms is less about learning new mnemonics and more about two genuinely different mental models of what a program is.",
    intent: "What is the difference between Siemens and Allen-Bradley PLCs?",
    answer:
      "The syntax difference is trivial; the model difference is not. ControlLogix gives you tags and expresses structure in a type system. Siemens gives you memory areas with symbolic names layered over them, and organises code into specific organisation blocks. Timers differ most: Rockwell timers are structures with .ACC and .DN, Siemens IEC timers are function blocks with instance data.",
    topic: "Platforms",
    minutes: 8,
    published: "2026-06-08",
    figure: "addressing",
    about: ["Siemens", "Allen-Bradley", "TIA Portal", "Studio 5000", "ControlLogix"],
    faq: [
      {
        q: "Is Siemens or Allen-Bradley better for a new project?",
        a: "Neither is technically better; the deciding factors are usually local support, the skills of the people who will maintain it, and what else is already on site. Allen-Bradley dominates North America and Siemens dominates Europe, and matching the local ecosystem matters more than any feature comparison.",
      },
      {
        q: "Can I convert a Siemens program to Allen-Bradley automatically?",
        a: "Not reliably. No automated cross-vendor converter exists, because the platforms disagree about memory, program organisation, timers and addressing. Bit logic translates mechanically; addressing, timer semantics and anything platform-specific need a person.",
      },
    ],
    body: [
      "Engineers who work across both platforms will tell you the hard part is not remembering that `XIC` is a normally-open contact. It is that the two systems disagree about what a program *is*, and the disagreement shows up everywhere once you notice it.",
      "## Memory: tags versus areas",
      "ControlLogix gives you tags. You declare `Conveyor_Run` as a BOOL and the controller decides where it lives. Structure is expressed in the type system: arrays, user-defined types, nesting.",
      "Siemens gives you memory areas with symbolic names layered over them. `%M0.0` is a real address, and `Conveyor_Run` is a name for it. Data blocks are more like structs you allocate explicitly.",
      "Neither is wrong. But a Rockwell engineer's instinct is to define a type, and a Siemens engineer's is to lay out a data block, and code written with the wrong instinct works while reading badly to everyone who maintains it.",
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
  {
    slug: "codesys-explained",
    title: "CODESYS: the PLC platform you are probably already using",
    summary:
      "Hundreds of hardware brands run the same runtime underneath, which matters more than most engineers realise.",
    intent: "What is CODESYS and who uses it?",
    answer:
      "CODESYS is an IEC 61131-3 development environment and runtime licensed by manufacturers rather than sold to end users, which is why it appears under other brand names. Roughly 500 hardware makers ship it, including ABB, WAGO, Festo, Lenze and Eaton, so a program written for one CODESYS device often ports to another with modest effort.",
    topic: "Platforms",
    minutes: 7,
    published: "2026-06-22",
    figure: "languages",
    about: ["CODESYS", "IEC 61131-3", "soft PLC", "ABB", "WAGO"],
    faq: [
      {
        q: "Is CODESYS free?",
        a: "The development environment is free to download and use. The runtime is licensed by the hardware manufacturer and is included in the price of the device, which is why you rarely buy CODESYS directly. Running the runtime on your own hardware, such as a Raspberry Pi, requires a separate licence.",
      },
      {
        q: "Can I move a CODESYS program between brands?",
        a: "Often, with work. The logic and the language are portable because they are standard, but I/O configuration, hardware-specific function blocks and motion libraries are not. Expect the program to move and the configuration to be redone.",
      },
    ],
    body: [
      "CODESYS is a development environment and a runtime for IEC 61131-3 programs. What makes it unusual is the business model: it is licensed to hardware manufacturers, who ship it under their own branding.",
      "## Why that matters",
      "Around 500 manufacturers ship devices running the CODESYS runtime. ABB, WAGO, Festo, Lenze, Eaton, Beckhoff historically, and a long tail of smaller makers.",
      "So an engineer who learns CODESYS has learned a substantial fraction of the non-Siemens, non-Rockwell market at once, and a program written for one device is closer to portable than it would be between the big two.",
      "## What actually ports",
      "The language ports, because it is standard. Function blocks you wrote port. Structure ports.",
      "What does not port is anything touching hardware: I/O configuration, vendor motion libraries, communication blocks, and the fieldbus setup. That is usually the majority of the commissioning time.",
      "> The phrase to be careful with is 'IEC 61131-3 compliant'. It means the language is standard. It does not mean two vendors' projects open in each other's tools.",
      "## PLCopen XML",
      "CODESYS exports and imports PLCopen XML, which is the closest thing to a neutral interchange format the industry has. It carries a subset of what any given tool supports, so a round trip loses vendor-specific detail, but it carries the logic.",
      "That subset is precisely why an interchange format is useful and why it is never a complete answer.",
    ],
  },
  {
    slug: "twincat-explained",
    title: "TwinCAT: a PLC that is really a PC",
    summary:
      "Beckhoff's approach puts the controller inside Windows, which changes what is easy and what is worrying.",
    intent: "What is Beckhoff TwinCAT?",
    answer:
      "TwinCAT is Beckhoff's automation platform, running the PLC as a real-time task on a standard industrial PC alongside Windows rather than on dedicated controller hardware. Programs are written in Visual Studio using IEC 61131-3 languages plus object-oriented extensions, and the source files are plain XML, which makes version control genuinely workable.",
    topic: "Platforms",
    minutes: 7,
    published: "2026-06-18",
    figure: "languages",
    about: ["TwinCAT", "Beckhoff", "soft PLC", "EtherCAT", "TcPOU"],
    faq: [
      {
        q: "Is TwinCAT a real-time system if it runs on Windows?",
        a: "Yes. TwinCAT installs a real-time kernel that takes dedicated CPU cores and runs the PLC task deterministically, with Windows running on the remaining cores. A Windows crash does not stop the PLC task, though it does take the HMI with it.",
      },
      {
        q: "Why is TwinCAT good for version control?",
        a: "Its project files are plain text XML: .TcPOU for program units, .TcDUT for data types, .TcGVL for global variables. That means Git can diff and merge them meaningfully, which is not true of the binary project formats most PLC platforms use.",
      },
    ],
    body: [
      "Beckhoff took a different route to everyone else: instead of designing controller hardware and putting a runtime on it, they put a real-time runtime alongside Windows on an industrial PC.",
      "## What that buys",
      "The PLC task runs on dedicated CPU cores under a real-time kernel, deterministically. Windows runs on the others, doing the things Windows is good at: HMI, databases, file handling, networking.",
      "One box, one operating system to patch, and no serial link between the controller and the visualisation.",
      "## Object-oriented extensions",
      "TwinCAT 3 adds classes, inheritance and interfaces to Structured Text. For a machine builder repeating the same station twenty times with variations, this is genuinely useful and closer to how software engineers think.",
      "It also produces code that a maintenance technician trained on ladder cannot read at three in the morning, which is a real cost and worth deciding deliberately.",
      "## The version control story",
      "TwinCAT source files are XML. `.TcPOU`, `.TcDUT`, `.TcGVL` are all text, so Git diffs them, merges them and reviews them.",
      "> This is rarer than it should be. Most PLC platforms store projects in binary formats where version control degrades to keeping dated copies of a file.",
      "## What to watch",
      "The PC is now a machine component. It needs the same lifecycle thinking as any other part: spares, image backups, and a policy about Windows updates that does not involve a reboot during production.",
    ],
  },
  {
    slug: "open-source-plc-options",
    title: "Open source PLC software: what actually exists",
    summary:
      "OpenPLC, Beremiz and matiec are real and usable. Knowing what each one is for saves a lot of time.",
    intent: "Is there open source PLC software?",
    answer:
      "Yes, and it is more capable than most engineers expect. OpenPLC provides an IEC 61131-3 editor and runtime that targets Arduino, ESP32, Raspberry Pi and Linux. Beremiz is a full open IDE built on the same toolchain, and matiec is the compiler underneath both, translating IEC languages into C.",
    topic: "Platforms",
    minutes: 7,
    published: "2026-06-14",
    figure: "languages",
    about: ["OpenPLC", "Beremiz", "matiec", "open source PLC", "IEC 61131-3"],
    faq: [
      {
        q: "Can OpenPLC be used in production?",
        a: "For non-critical applications, yes, and it is used that way in research and small installations. It is not certified for safety functions and carries no vendor support contract, so the calculus is different from a commercial controller. For teaching, prototyping and lab work it is excellent.",
      },
      {
        q: "What is matiec?",
        a: "An open-source compiler that translates IEC 61131-3 source into C, which is then compiled for the target. It is the compiler underneath OpenPLC and Beremiz, and it is the practical way to check whether a piece of Structured Text is actually valid rather than merely plausible.",
      },
    ],
    body: [
      "The open-source corner of automation is small but real, and the pieces fit together.",
      "## OpenPLC",
      "An editor, a runtime and a builder. It implements the five IEC 61131-3 languages, exports PLCopen XML, and runs on eighteen platforms including Arduino, ESP32, Raspberry Pi, Windows and Linux.",
      "Its distinguishing feature is that the runtime is open, which CODESYS is not. That matters for research, for teaching and for anyone who needs to know exactly what the scan is doing.",
      "## Beremiz",
      "A full IDE on the same toolchain, aimed at people who want an open development environment rather than a free one attached to hardware.",
      "## matiec",
      "The compiler underneath. It takes IEC 61131-3 source and emits C.",
      "> This is the piece that matters most outside its own ecosystem. If you want to know whether a piece of Structured Text is valid, matiec will tell you, and it is the only widely available way to check without a vendor licence.",
      "## Where they fit",
      "Teaching, prototyping, research, and hardware too small to justify a commercial controller. Not safety functions, and not where a support contract is part of the deliverable.",
    ],
  },
  {
    slug: "plc5-to-controllogix-migration",
    title: "PLC-5 to ControlLogix: what the converter will not do for you",
    summary:
      "Rockwell's migration tool handles the mechanical part and leaves markers everywhere else. Here is what those markers actually mean.",
    intent: "How do I convert a PLC-5 program to ControlLogix?",
    answer:
      "Studio 5000 includes a conversion tool that produces a project which opens, and that is where the automation stops. Bit logic, ordinary timers and straightforward maths come through largely intact. Addressing, block transfers, indexed addressing and PID tuning constants all need human decisions, and the verification burden usually dominates the schedule.",
    topic: "Migration",
    minutes: 9,
    published: "2026-07-04",
    figure: "migration",
    about: ["PLC-5", "ControlLogix", "RSLogix", "migration", "Studio 5000"],
    faq: [
      {
        q: "Does Rockwell's PLC-5 conversion tool work?",
        a: "Partly. It converts bit logic, timers, counters and simple maths, and leaves comment markers wherever it could not decide. Addressing is the biggest gap: PLC-5 used file-and-element addresses and ControlLogix uses tags, so you get tags named N7_0 and a program nobody can read.",
      },
      {
        q: "Should I convert or rewrite a PLC-5 program?",
        a: "Many experienced integrators rewrite, not because it is faster but because the verification burden is the same either way and a rewrite produces readable tags. If the program is largely relay logic and well documented, conversion is worth trying; if it leans on indirect addressing and block transfers, rewriting is usually cleaner.",
      },
    ],
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
      "You now have two programs that are supposed to behave identically and no way to prove it beyond reading both. On a large migration this is where the weeks go, and it is why experienced integrators often quote a rewrite instead: not because rewriting is faster, but because the verification burden is the same either way and at least a rewrite produces readable tags.",
      "## What would actually help",
      "Running both versions against the same inputs and comparing outputs. Not by hand: generate test vectors that exercise every rung's transitions, run the source and the target, and diff the results.",
      "That is what LADX Convert does with its conversion report: every element marked as converted cleanly, converted with a semantic difference worth reading, or needing a decision. Plus the simulation check, so 'these two programs agree on 94 of 96 test cases, and here are the two that differ' is a sentence you can say to a customer.",
      "> Nothing removes the engineering judgement. But 'read all forty thousand rungs carefully' is not judgement, it is a bottleneck, and it is the wrong thing for a person to spend a month on.",
    ],
  },
  {
    slug: "slc500-migration",
    title: "SLC 500 to CompactLogix: the smaller migration nobody plans for",
    summary:
      "Less famous than the PLC-5 route and more common, with its own set of things that do not carry across.",
    intent: "How do I migrate an SLC 500 to CompactLogix?",
    answer:
      "The path mirrors PLC-5 migration but at smaller scale: convert with the Studio 5000 tool, then fix addressing by hand. SLC 500 used file-based addressing such as B3:0/1 and N7:0, which converts to tags with mechanical names. Expect to rename everything, and expect analog scaling to need rechecking because the raw ranges differ between card families.",
    topic: "Migration",
    minutes: 7,
    published: "2026-06-10",
    figure: "migration",
    about: ["SLC 500", "CompactLogix", "migration", "RSLogix 500"],
    faq: [
      {
        q: "Is SLC 500 still supported?",
        a: "It reached end of life and is no longer manufactured, though spares remain available through third parties. The practical driver for migration is usually a failure with no replacement part rather than a feature need, which is why these projects tend to be urgent rather than planned.",
      },
      {
        q: "Do SLC 500 analog scaling values carry over?",
        a: "Not reliably. Raw count ranges differ between SLC analog cards and their CompactLogix equivalents, so scaling constants copied across produce readings that are plausible and wrong. Recheck every analog point against the new card's documentation.",
      },
    ],
    body: [
      "The PLC-5 migration gets written about. The SLC 500 one happens more often, usually because a card failed and there is no spare.",
      "## What is the same",
      "The conversion tool, the addressing problem, and the verification burden. Everything in the PLC-5 article applies at smaller scale.",
      "## What is different",
      "SLC programs are usually smaller, which means rewriting is far more often the right answer. A two thousand rung program with meaningful tag names is a week of work and leaves you with something maintainable.",
      "Analog is the sharpest edge. SLC analog cards and their CompactLogix equivalents do not share raw ranges, so scaling constants that carry across produce readings that look reasonable and are wrong by a fixed offset.",
      "> Recheck every analog point against the new card's own documentation. Do not trust a converted scaling block.",
      "## The opportunity",
      "These migrations are usually the first time in twenty years anybody has looked at the logic. Budget a little time to delete what is dead. There is always something switched off in 2009 that nobody removed.",
    ],
  },
  {
    slug: "cross-vendor-plc-migration",
    title: "Moving a program between vendors, honestly",
    summary:
      "There is no automated path from Siemens to Rockwell, and understanding why explains what to plan for instead.",
    intent: "Can you convert a Siemens PLC program to Allen-Bradley?",
    answer:
      "Not automatically, and no commercial tool claims otherwise. The platforms disagree about memory addressing, program organisation, timer semantics and data types, so a converter would have to make engineering decisions rather than translations. Bit logic maps mechanically; everything structural needs a person, which is why cross-vendor moves are usually scoped as rewrites informed by the original.",
    topic: "Migration",
    minutes: 8,
    published: "2026-06-06",
    figure: "migration",
    about: ["cross-vendor migration", "Siemens to Rockwell", "PLCopen XML"],
    faq: [
      {
        q: "Is there a tool that converts Siemens to Allen-Bradley?",
        a: "No general-purpose one exists, because the differences are semantic rather than syntactic. Timers, addressing and program organisation have no one-to-one mapping, so any tool would be guessing at intent. Some consultancies offer assisted conversion, which is a person using tooling rather than an automated pipeline.",
      },
      {
        q: "Does PLCopen XML solve cross-vendor migration?",
        a: "It helps and does not solve it. PLCopen XML carries logic in a neutral form, which is genuinely useful, but every vendor implements a subset and vendor-specific blocks fall outside it. It moves the bit logic and leaves the platform-dependent parts to you.",
      },
    ],
    body: [
      "The question comes up on every plant with mixed equipment, and the honest answer is unsatisfying: there is no automated path, and the reason is not that nobody has tried.",
      "## Why it is hard",
      "The platforms disagree at a level below syntax.",
      "- **Memory.** Tags versus addressed areas. There is no mechanical mapping that preserves meaning.",
      "- **Timers.** Rockwell timer structures and IEC timer function blocks behave differently on reset and hold different state.",
      "- **Organisation.** Routines called by JSR versus organisation blocks invoked by the runtime.",
      "- **Data types.** Similar names, different widths and different overflow behaviour.",
      "A converter facing these has to decide what the engineer meant, which is engineering, not translation.",
      "## What actually helps",
      "A neutral intermediate form gets you the bit logic. PLCopen XML is the standard one, and it carries contacts, coils, and structure across faithfully enough to be worth using.",
      "What it cannot carry is anything vendor-specific, which in a real project is most of the interesting part.",
      "> The realistic plan is: extract the logic mechanically, rebuild the structure deliberately, and verify by comparing behaviour rather than by comparing code.",
      "## Verification is the deliverable",
      "Whatever route you take, the thing the customer is buying is confidence that the new program behaves like the old one. Test vectors that exercise every transition, run against both, are worth more than any amount of careful reading.",
    ],
  },
  {
    slug: "iec-61131-3-languages",
    title: "The five IEC 61131-3 languages, and when each is right",
    summary:
      "One standard, five notations. Most projects use two, and choosing badly makes a program nobody wants to maintain.",
    intent: "What are the five IEC 61131-3 languages?",
    answer:
      "IEC 61131-3 defines Ladder Diagram, Function Block Diagram, Sequential Function Chart, Structured Text and Instruction List. Ladder dominates discrete machine control because maintenance staff read it; Structured Text suits calculation and data handling; SFC suits sequences with clear steps; FBD suits process and signal flow; Instruction List is deprecated and should not be used for new work.",
    topic: "Languages",
    minutes: 7,
    published: "2026-06-02",
    figure: "languages",
    about: ["IEC 61131-3", "ladder diagram", "structured text", "SFC", "FBD"],
    faq: [
      {
        q: "Which IEC 61131-3 language should I learn first?",
        a: "Ladder, because it is what you will meet most and what maintenance staff can read. Learn Structured Text second: it handles calculation, string work and data manipulation far better than ladder, and most platforms let you call an ST routine from a ladder rung.",
      },
      {
        q: "Is Instruction List still used?",
        a: "It is deprecated in the third edition of the standard and should not be used for new work. You will still meet it in older Siemens programs as STL, where it survives because it can express things the graphical languages cannot, but there is no reason to start a new project in it.",
      },
    ],
    body: [
      "One standard, five notations, and a lot of arguments about which to use.",
      "## Ladder Diagram",
      "Graphical, descended from relay schematics. It dominates discrete machine control for one reason that has nothing to do with expressiveness: a maintenance technician can read it at three in the morning without being a programmer.",
      "That is a genuine engineering property and it is why ladder outlives every prediction of its death.",
      "## Structured Text",
      "Textual, Pascal-like. Far better than ladder at calculation, string handling, arrays and loops. Most platforms let you call an ST routine from a ladder rung, which is usually the right structure: ladder for the machine logic, ST for the maths.",
      "## Sequential Function Chart",
      "Steps and transitions. Genuinely good for anything with a clear sequence: batch, start-up, complicated machine cycles. It makes 'which step are we on' a first-class question rather than something you infer from a set of bits.",
      "## Function Block Diagram",
      "Graphical, signal flow. Common in process industries and in anything descended from a control-loop drawing.",
      "## Instruction List",
      "Deprecated. You will meet it as Siemens STL in older programs. Do not start new work in it.",
      "> The practical rule: ladder for what maintenance must read, Structured Text for what maths must be right, SFC for what has steps. Mixing deliberately beats picking one and forcing everything into it.",
    ],
  },
  {
    slug: "structured-text-for-ladder-programmers",
    title: "Structured Text for people who think in ladder",
    summary:
      "The translation is mostly mechanical, and four constructs cover the majority of real code.",
    intent: "How do I learn Structured Text if I know ladder?",
    answer:
      "Map the concepts directly: a rung becomes an assignment guarded by a boolean expression, a series of contacts becomes AND, a parallel branch becomes OR in brackets, and a latch becomes an IF block rather than an assignment. Timers become function block instances that must be declared, which is the one genuinely new idea.",
    topic: "Languages",
    minutes: 7,
    published: "2026-05-29",
    figure: "languages",
    about: ["structured text", "ST", "ladder to ST", "IEC 61131-3"],
    faq: [
      {
        q: "What is the Structured Text equivalent of a seal-in circuit?",
        a: "Motor := (Start OR Motor) AND NOT Stop; The brackets are essential. Without them, AND binds tighter than OR, so the expression becomes Start OR (Motor AND NOT Stop), which latches on and never releases.",
      },
      {
        q: "How do timers work in Structured Text?",
        a: "As function block instances. You declare an instance, for example MyTimer : TON;, then call it with MyTimer(IN := Condition, PT := T#5s); and read MyTimer.Q for the done bit. The declaration is the part ladder programmers forget, because ladder created the instance implicitly.",
      },
    ],
    body: [
      "If you can read a rung, you can read Structured Text after about an hour. The mapping is close to mechanical.",
      "## A rung is an assignment",
      "`XIC(Start) XIO(Stop) OTE(Motor)` becomes `Motor := Start AND NOT Stop;`.",
      "Series is AND. A normally-closed contact is NOT. The coil is the assignment target.",
      "## A branch is OR, and the brackets matter",
      "A seal-in becomes `Motor := (Start OR Motor) AND NOT Stop;`.",
      "> Leave the brackets out and AND binds tighter, producing `Start OR (Motor AND NOT Stop)`, which latches on and never releases. This is the single most common ST bug written by ladder programmers.",
      "## A latch is an IF, not an assignment",
      "`OTL(Motor)` becomes `IF Condition THEN Motor := TRUE; END_IF;`.",
      "Writing `Motor := Condition;` instead clears the bit whenever the condition goes false, which is the opposite of a latch.",
      "## Timers need declaring",
      "This is the genuinely new idea. In ladder the timer instance was created for you. In ST you declare `Warmup : TON;` and then call `Warmup(IN := Heater_On, PT := T#5s);`, reading `Warmup.Q` for the done bit.",
      "Forgetting the declaration is the first compile error every ladder programmer meets.",
    ],
  },
  {
    slug: "sfc-sequential-function-chart",
    title: "Sequential Function Chart: when your machine has steps",
    summary:
      "SFC makes 'which step are we on' a first-class question instead of something you infer from a pile of bits.",
    intent: "When should I use Sequential Function Chart?",
    answer:
      "Use SFC when the process has distinct steps with clear transitions between them: batch processes, machine start-up sequences, and any cycle where 'where are we' is a question operators ask. It replaces the step-counter-and-comparison pattern that ladder forces, making the current state explicit and the transitions visible.",
    topic: "Languages",
    minutes: 6,
    published: "2026-05-25",
    figure: "languages",
    about: ["SFC", "sequential function chart", "batch control", "state machine"],
    faq: [
      {
        q: "Is SFC better than a step counter in ladder?",
        a: "For genuine sequences, yes. A ladder step counter scatters the sequence across dozens of comparison rungs, so the order only exists in the programmer's head. SFC puts the steps and transitions in one diagram, which means a reader can see the sequence without reconstructing it.",
      },
      {
        q: "Can I mix SFC with ladder?",
        a: "Yes, and that is the usual arrangement. The SFC holds the sequence, and each step's actions are written in ladder or Structured Text. Most platforms support this directly, so the sequence is visible and the actions stay in whichever language suits them.",
      },
    ],
    body: [
      "Most machines have a sequence. Ladder does not have a way to express one, so programmers build a step counter and a stack of comparison rungs, and the sequence exists only in the programmer's head.",
      "## What SFC gives you",
      "Steps and transitions, drawn. The current step is a real thing you can see, not a number you compare against.",
      "Each step holds actions, written in whichever language suits: ladder for interlocks, Structured Text for calculation.",
      "## Where it earns its place",
      "- **Batch.** Charge, heat, hold, discharge, clean. Steps with conditions between them.",
      "- **Start-up sequences.** Anything where order matters and skipping a step is dangerous.",
      "- **Complex machine cycles.** Where the step count is high enough that the comparison rungs become unreadable.",
      "> The test: if somebody asks 'what is the machine doing right now' and the honest answer requires reading six rungs, SFC would have answered it in one glance.",
      "## Where it does not help",
      "Continuous logic. Interlocks, alarms and anything that must be evaluated every scan regardless of state belong outside the SFC, in ordinary ladder that runs alongside it.",
    ],
  },
  {
    slug: "why-chatgpt-ladder-logic-fails",
    title: "Why ChatGPT writes ladder logic that does not run",
    summary:
      "General models are good at the shape of PLC code and bad at the parts that matter. Here is what they get wrong, and what has to sit around them.",
    intent: "Can ChatGPT write PLC code?",
    answer:
      "It can write PLC code that looks correct and frequently does not compile. General models are strong on structure and weak on the four things that decide whether PLC code works: dialect consistency, timer semantics, scan order and addressing. None of those are visible by reading, and all of them are visible to a compiler, which is why a validation loop matters more than a better prompt.",
    topic: "AI",
    minutes: 8,
    published: "2026-08-06",
    figure: "aiLoop",
    about: ["ChatGPT PLC", "AI code generation", "LLM4PLC", "structured text"],
    faq: [
      {
        q: "Is it safe to use ChatGPT for PLC programming?",
        a: "For drafting and explanation, yes. For anything that reaches a controller, only with review by a competent engineer. A model cannot verify that an interlock is sufficient for a hazard, and no amount of prompting changes that. Treat generated code as a first draft, not a deliverable.",
      },
      {
        q: "Why does AI-generated ladder logic fail to compile?",
        a: "Most often because the model mixes vendor dialects within one answer, having learned from both. It will use Rockwell mnemonics with Siemens addressing, or invent an instruction that exists on neither platform. A compiler catches this instantly; reading it does not.",
      },
    ],
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
      "This is not a new idea. The research literature has converged on it, with published work showing that feedback-driven pipelines dramatically outperform single-shot generation for structured text. It is just rarely built, because it needs actual compiler infrastructure rather than an API key.",
      "The useful side effect: once the loop exists, a small free model becomes genuinely useful, because it is allowed to be wrong on the first attempt. Most of the quality comes from the checking rather than from the model.",
      "## What still needs you",
      "A compiler proves the code is valid. It does not prove the code is *right*. Whether the guard should break the seal-in or only stop the motor, whether that timer should be five seconds or fifty, whether this interlock is sufficient for the hazard. None of that is a syntax question, and none of it should be delegated.",
      "The honest description of what a tool like this does is: it removes the typing and the syntax errors, and leaves the engineering.",
    ],
  },
  {
    slug: "agentic-ai-plant-floor-2026",
    title: "Agentic AI on the plant floor: what is actually running",
    summary:
      "Every vendor has announced one. A smaller number have deployed. Here is what is genuinely in production, and what the word is doing in those sentences.",
    intent: "Is agentic AI real in manufacturing yet?",
    answer:
      "Engineering assistance is genuinely deployed and runtime autonomy is not. Siemens, Rockwell and Beckhoff all ship code assistants inside their engineering tools, with reported productivity gains of twenty to thirty percent concentrated in onboarding and documentation. None of them writes to a running controller, and the constraint is not technical but regulatory: safety cases are built on determinism and traceability.",
    topic: "AI",
    minutes: 10,
    published: "2026-06-20",
    figure: "aiLoop",
    about: ["agentic AI", "industrial copilot", "Siemens Industrial Copilot", "manufacturing AI"],
    faq: [
      {
        q: "Do industrial AI copilots write directly to PLCs?",
        a: "No. Every shipping vendor assistant sits in the engineering environment and helps write the program; none writes to a running controller. The blocker is not capability but accountability: a safety case requires determinism and traceability, and 'the model decided' does not survive an audit.",
      },
      {
        q: "What productivity gains do industrial AI copilots actually deliver?",
        a: "Vendors report twenty to thirty percent in pilot deployments, concentrated in onboarding to unfamiliar codebases, documentation and maintenance work rather than in writing new logic. The gains are real and they are in the tasks around engineering rather than in engineering itself.",
      },
    ],
    body: [
      "The word moved fast. Two years ago the pitch was a copilot that suggests code. Now every major automation vendor describes something 'agentic', systems that pursue an outcome rather than answer a question. It is worth separating what has shipped from what has been announced.",
      "## What is genuinely deployed",
      "Engineering assistance is real and in use. Siemens' Industrial Copilot generates structured text inside TIA Portal and has been taken up at scale by industrial customers. Rockwell's FactoryTalk Design Studio has a code assistant built on a purpose-trained small model rather than a general one. Beckhoff's TwinCAT assistant reports productivity gains in the twenty to thirty percent range, concentrated in onboarding and documentation.",
      "Notice what those have in common: they all sit in the *engineering* environment, not the *runtime*. They help you write the program. None of them touches a running controller.",
      "## What 'agentic' currently means in practice",
      "Mostly: multi-step, with tools, and allowed to retry. An agent that reads a fault code, searches the manual, checks the last three work orders and proposes a cause is doing something meaningfully more than autocomplete. It is also not making decisions about the machine; it is assembling context faster than a person could.",
      "That is a real and useful capability, and the honest framing of it is 'a very fast technician who has read everything', not autonomy.",
      "## What is not happening, and probably should not",
      "Closed-loop control by a language model. Nobody serious is proposing that a probabilistic system should write directly to a controller running a machine that can hurt somebody, and the regulatory picture would not permit it even if they were.",
      "The interesting constraint is not technical. It is that safety cases are built on determinism and traceability, and 'the model decided' is not an answer that survives an audit.",
      "> The useful question for 2026 is not whether AI can drive a plant. It is which parts of an engineer's week are not engineering, such as documentation, translation between dialects, searching manuals and writing the same interlock for the ninth time, and how much of that can be given away safely.",
      "## The constraint most vendors do not talk about",
      "Most OT networks do not have internet access, and that is not an oversight. A cloud assistant is unavailable in exactly the environment where the work happens, which is why the deployments you read about are usually in the engineering office rather than on the line.",
      "This is the strongest argument for local models in industry, and the reason it matters more here than in most software: air-gapped is not a paranoid preference, it is the default condition of the network.",
    ],
  },
  {
    slug: "local-llm-for-plc-work",
    title: "Running a local model for PLC work",
    summary:
      "Most OT networks have no internet access, which makes local models the only option rather than a preference.",
    intent: "Can I run an AI model locally for PLC programming?",
    answer:
      "Yes, and on an OT network it is often the only permitted option. A machine with 16 GB of RAM runs a capable 7B to 14B parameter model through Ollama or LM Studio, exposing an OpenAI-compatible endpoint that most tools can point at. Smaller models are noticeably weaker at code, which is why a validation loop around the output matters more locally than it does in the cloud.",
    topic: "AI",
    minutes: 8,
    published: "2026-05-21",
    figure: "aiLoop",
    about: ["local LLM", "Ollama", "air-gapped", "OT network", "offline AI"],
    faq: [
      {
        q: "What hardware do I need to run a local model for code work?",
        a: "16 GB of RAM runs a 7B to 14B parameter model acceptably on CPU, slowly. A GPU with 12 GB or more of VRAM makes it comfortable. For a shared engineering workstation, a single mid-range GPU serves a small team through an OpenAI-compatible endpoint.",
      },
      {
        q: "Are local models good enough for PLC code?",
        a: "On their own, weaker than the large hosted models, particularly on less common instructions. With a compile-and-repair loop around them the gap narrows sharply, because most of the quality comes from the checking rather than from the first attempt.",
      },
    ],
    body: [
      "The reason to care about local models in automation is not privacy in the abstract. It is that the network the work happens on frequently has no route to the internet, by design.",
      "## What runs on what",
      "- **16 GB RAM, no GPU.** A 7B model runs, slowly. Usable for explanation and small generations.",
      "- **12 GB VRAM or more.** A 14B model runs comfortably and is genuinely useful for code.",
      "- **24 GB or more.** Larger models, or several people sharing one endpoint.",
      "Ollama and LM Studio both expose an OpenAI-compatible API, which means anything that can point at a base URL can use them, including LADX.",
      "## The honest quality gap",
      "A local 14B model is weaker than a frontier hosted model, especially on instructions it has seen less of. Pretending otherwise wastes people's time.",
      "> What closes most of the gap is not a bigger model but a loop: compile the output, feed the errors back, try again. Quality moves from the model to the checking, and the checking is deterministic.",
      "## The deployment question nobody asks early enough",
      "Who patches it. A model server on an OT network is a service with a lifecycle, and 'the engineer who set it up has left' is the usual failure mode. Treat it like any other machine component: documented, imaged, and owned by somebody.",
    ],
  },
  {
    slug: "ai-generated-code-safety",
    title: "Where AI-written code stops being acceptable",
    summary: "A line worth drawing explicitly, before somebody draws it for you after an incident.",
    intent: "Is it safe to use AI-generated code in a PLC?",
    answer:
      "For non-safety logic reviewed by a competent engineer, it is a drafting tool like any other. For safety functions it is not acceptable, because a safety case requires a documented, deterministic development process and a probabilistic generator cannot provide one. The practical line runs between code that can stop production and code that can hurt somebody.",
    topic: "AI",
    minutes: 7,
    published: "2026-05-17",
    figure: "safety",
    about: ["functional safety", "AI code", "IEC 61508", "safety PLC"],
    faq: [
      {
        q: "Can AI write safety PLC code?",
        a: "It should not, and in a certified environment it cannot be signed off. Functional safety standards require a documented development process with traceable requirements and verification. A generator that produces different output for the same prompt cannot satisfy that, regardless of how good the output is.",
      },
      {
        q: "What is a reasonable policy for AI-assisted PLC work?",
        a: "Allow it for drafting, documentation, explanation and conversion of non-safety logic, with mandatory engineer review before download. Prohibit it in safety functions. Log what was generated and what was accepted, because the audit question is not whether you used AI but whether you can show what it did.",
      },
    ],
    body: [
      "This deserves a clear answer rather than a hedge, because the alternative is that everyone quietly makes their own rule.",
      "## The line",
      "Code that can stop production: AI assistance is fine, with review. It is a drafting tool, and a competent engineer reviewing a draft is a normal working arrangement.",
      "Code that can hurt somebody: no. Not because the output is necessarily worse, but because a safety case is a documented argument about process, and 'a model produced it' cannot be part of that argument.",
      "## Why the standards make this decision for you",
      "Functional safety requires traceability from requirement to implementation to verification. It requires that the same process produces the same result. A generative model is by construction non-deterministic.",
      "> You are not being asked whether the code is good. You are being asked to show how it came to exist, and to whom.",
      "## What a workable policy looks like",
      "- Allowed: drafting non-safety logic, documentation, explanation, conversion, test case generation.",
      "- Required: review by a competent engineer before anything is downloaded.",
      "- Logged: what was generated, by which model, and what was accepted. This is cheap to do and answers the audit question before it is asked.",
      "- Prohibited: anything inside a safety function, and anything that writes to a controller without a human action in between.",
    ],
  },
  {
    slug: "ai-plc-documentation",
    title: "The one AI task in automation with no downside",
    summary:
      "Documentation is the most disliked, most billable and least risky thing to hand to a machine.",
    intent: "Can AI write PLC documentation?",
    answer:
      "Yes, and it is the strongest current use case because the risk is close to zero. A model reading a program can produce an I/O schedule, a control narrative and rung comments faster than a person, and errors are visible on the page rather than in the machine. It cannot decide what the machine should do, so it cannot get that wrong.",
    topic: "AI",
    minutes: 6,
    published: "2026-05-13",
    figure: "aiLoop",
    about: ["PLC documentation", "control narrative", "functional design specification"],
    faq: [
      {
        q: "What PLC documentation can AI reliably produce?",
        a: "I/O schedules from the tag table, rung and network comments from the logic, and a first-draft control narrative describing what each routine does. All three are derived from the program itself, so the model is describing rather than deciding, which is where it is strongest.",
      },
      {
        q: "Should AI-written documentation be reviewed?",
        a: "Yes, but it is a fast review because errors are visible. A wrong sentence in a narrative is obvious to anyone who knows the machine, unlike a wrong rung, which may only appear under a condition nobody tests. This is exactly why documentation is the low-risk starting point.",
      },
    ],
    body: [
      "If you are looking for a place to start with AI in an automation business, it is documentation, and the reasoning is entirely about risk.",
      "## Why it is the safe one",
      "The model is describing something that already exists rather than deciding what should exist. It reads the tag table and writes the I/O schedule. It reads the rungs and describes the sequence.",
      "Errors land on a page where a reviewer sees them, not in a machine where a condition nobody tested reveals them.",
      "## What it produces well",
      "- **I/O schedules.** Directly derived from tags and addresses. Tedious, mechanical, and exactly what a machine is for.",
      "- **Rung comments.** A program with no comments is a program nobody wants to inherit, and a first pass is far better than the nothing that usually exists.",
      "- **Control narratives.** A plain-English description of what each routine does, as a first draft for the engineer to correct.",
      "## What it cannot do",
      "Explain *why*. A narrative can say the interlock exists. It cannot say it was added after an incident in 2019, and that is often the most important sentence in the document.",
      "> Generated documentation is a floor, not a ceiling. It gets you from nothing to something, and the engineer's job becomes editing rather than writing.",
    ],
  },
  {
    slug: "plc-troubleshooting-method",
    title: "A method for troubleshooting a PLC that will not run",
    summary: "An order of checks that finds the fault faster than staring at the ladder.",
    intent: "How do I troubleshoot a PLC problem?",
    answer:
      "Work from the outside in: confirm power and the processor mode, then check the physical input at the terminal, then the input in the program, then the logic, then the output in the program, then the output at the terminal. Most faults are found in the first three steps, and starting at the ladder wastes the most time because the ladder is usually right.",
    topic: "Practice",
    minutes: 8,
    published: "2026-05-09",
    figure: "wiring",
    about: ["PLC troubleshooting", "fault finding", "commissioning"],
    faq: [
      {
        q: "Where should I start troubleshooting a PLC fault?",
        a: "At the field device, not the program. Confirm the input LED changes when the device actuates. If the LED does not change, the problem is wiring, power or the device, and no amount of reading the ladder will find it. If the LED changes but the program bit does not, the problem is the card or the addressing.",
      },
      {
        q: "Why does the input LED light but the program not see it?",
        a: "Usually an addressing mismatch: the program is reading a different point than the one wired. Occasionally a failed input card that lights its LED from the field side while failing to update the backplane. Check the address against the wiring drawing before suspecting the logic.",
      },
    ],
    body: [
      "The instinct is to open the program. The program is usually right, and it is the slowest place to look.",
      "## Work from the outside in",
      "1. **Power and mode.** Is the processor in RUN? Is there a fault light? A surprising number of calls end here.",
      "2. **The field device.** Does the input LED change when you actuate it? If not, the fault is wiring, power or the device.",
      "3. **The program's view of the input.** Does the bit change in a watch table? If the LED changes and the bit does not, suspect addressing or a failed card.",
      "4. **The logic.** Now, and only now, read the rungs.",
      "5. **The program's output.** Does the coil energise?",
      "6. **The field output.** Does the terminal follow the coil? If not, the fault is the card, the wiring or the load.",
      "> Each step is a bisection. Every check either eliminates the field or eliminates the program, which is why the order matters more than the individual tests.",
      "## The traps",
      "- **Forcing left on.** Somebody forced a bit last month and did not remove it. Check the force table before anything else on a machine that has been worked on.",
      "- **The wrong rung is running.** A JSR that is not being called looks exactly like logic that does not work.",
      "- **A one-scan event you cannot see.** If the bit changes for one scan, a watch table will not show it. Latch it into a spare bit to catch it.",
      "## Write down what you find",
      "Not for process reasons. Because the same fault recurs in eighteen months and the person looking at it will be you, with no memory of this afternoon.",
    ],
  },
  {
    slug: "plc-documentation-that-helps",
    title: "Documentation people actually read",
    summary:
      "Four documents carry almost all the value, and most projects produce them in the wrong order.",
    intent: "What documentation does a PLC project need?",
    answer:
      "Four documents carry most of the value: an I/O schedule, a control narrative, the tag list with comments, and a record of what changed and why. The I/O schedule and tag list are mechanical and should be generated. The narrative and the change record are where the engineering judgement lives and cannot be automated.",
    topic: "Practice",
    minutes: 7,
    published: "2026-05-05",
    figure: "aiLoop",
    about: ["PLC documentation", "control narrative", "IO schedule", "handover"],
    faq: [
      {
        q: "What is a control narrative?",
        a: "A plain-English description of what the machine does and under what conditions, written for someone who cannot read ladder. It bridges the gap between the specification and the code, and it is the document maintenance staff actually open when something behaves unexpectedly.",
      },
      {
        q: "How detailed should PLC comments be?",
        a: "Comment the intent, not the mechanism. 'XIC Start_PB' needs no comment. 'Guard must stay closed for two seconds after the cycle ends, added after the 2019 incident' is the comment that matters, because the code cannot express why.",
      },
    ],
    body: [
      "Most projects produce documentation because the contract requires it, which is why most of it is never opened again.",
      "## The four that matter",
      "- **I/O schedule.** Every point, its address, its device and where it is. Mechanical, generatable, and the first thing anybody wants at three in the morning.",
      "- **Control narrative.** What the machine does, in sentences, for somebody who cannot read ladder.",
      "- **Tag list with comments.** The names, and what they mean.",
      "- **Change record.** What was altered, when, and why.",
      "## Comment the why, never the what",
      "`XIC Start_PB` does not need a comment saying it examines the start button. It needs one only if there is something surprising about it.",
      "> The comment worth writing is the one the code cannot express: 'guard must remain closed two seconds after cycle end, added after the 2019 incident'. Nobody can recover that from the logic.",
      "## Generate the mechanical parts",
      "The I/O schedule and the tag list are derived from the program. Writing them by hand guarantees they drift out of date the first time somebody adds a point.",
      "The narrative and the change record are the ones worth a person's time, because they hold information that exists nowhere else.",
    ],
  },
  {
    slug: "plc-version-control",
    title: "Version control for PLC code, realistically",
    summary:
      "Git works better than most engineers expect on some platforms and barely at all on others, and knowing which is which saves an argument.",
    intent: "Can you use Git for PLC programs?",
    answer:
      "It depends entirely on whether the platform stores projects as text. Beckhoff TwinCAT files are XML and diff meaningfully. Rockwell L5X exports are XML and work if you export deliberately. Siemens and most others store binary projects, where Git can store versions but cannot show you what changed, which is most of the value.",
    topic: "Practice",
    minutes: 7,
    published: "2026-05-01",
    figure: "migration",
    about: ["version control", "Git", "PLC source control", "L5X", "TcPOU"],
    faq: [
      {
        q: "Which PLC platforms work well with Git?",
        a: "Beckhoff TwinCAT works best, because .TcPOU, .TcDUT and .TcGVL files are plain XML that diffs and merges. Rockwell works if you export to L5X as part of your workflow. Siemens TIA Portal stores binary projects, so Git holds versions but cannot show meaningful differences.",
      },
      {
        q: "How do I version control a binary PLC project?",
        a: "Store the binary in Git for history, and alongside it store a text export that a human can diff. For Rockwell that is an L5X; for Siemens, SimaticML block exports. The binary is the artefact, the export is the record, and the discipline is exporting on every commit.",
      },
    ],
    body: [
      "The honest answer is 'it depends on your platform', and the dependency is simple: does it store text?",
      "## Where it works properly",
      "**TwinCAT.** Project files are XML. `.TcPOU`, `.TcDUT` and `.TcGVL` diff line by line, merge, and can be reviewed in a pull request like any other code.",
      "**Rockwell, with discipline.** The `.ACD` is binary, but `.L5X` exports are XML. If exporting is part of the commit ritual, the history is readable.",
      "## Where it does not",
      "Most others store binary project files. Git will happily version them and can tell you that something changed, but not what, which removes most of the reason to use Git rather than dated folders.",
      "## The workable compromise",
      "Commit the binary as the artefact and a text export beside it as the record.",
      "> The discipline is the hard part, not the tooling. An export that happens only when somebody remembers is a history with holes exactly where the interesting changes are.",
      "## Why it is worth the effort",
      "Not for merging. Almost nobody merges PLC code. For answering 'what changed between the version that worked and the version that does not', which is a question every commissioning engineer asks eventually.",
    ],
  },
  {
    slug: "alarm-design",
    title: "Alarms people act on rather than silence",
    summary:
      "An alarm system that cries wolf is worse than none, and the failure is almost always in the design rather than the operator.",
    intent: "How should PLC alarms be designed?",
    answer:
      "An alarm should require an operator action, and anything that does not should be an event or a log entry instead. The standard failure is alarm flood: hundreds of alarms from one root cause, which trains operators to acknowledge everything without reading. Deadbands, delays and suppression of consequential alarms fix most of it.",
    topic: "Practice",
    minutes: 7,
    published: "2026-04-27",
    figure: "alarm",
    about: ["alarm management", "ISA 18.2", "alarm flood", "HMI"],
    faq: [
      {
        q: "What makes a good alarm?",
        a: "It requires an operator response, it arrives in time for that response to matter, and it identifies a root cause rather than a consequence. If an operator can do nothing about it, or if it always arrives with fifty others, it is not an alarm; it is noise wearing an alarm's colours.",
      },
      {
        q: "What is alarm flood and how do you prevent it?",
        a: "Alarm flood is many alarms arriving from one root cause, faster than an operator can read. Prevent it by suppressing consequential alarms when their cause is already alarming, adding on-delays so transients do not annunciate, and using deadbands so values hovering at a threshold do not chatter.",
      },
    ],
    body: [
      "The test for an alarm is whether an operator can and should do something about it. Almost every bad alarm system fails that test in the same way.",
      "## The three faults",
      "- **Chatter.** A value hovering at a threshold with no deadband annunciates every scan. Two percent of hysteresis fixes it.",
      "- **Transients.** A pressure dip during a valve change is not a fault. An on-delay of a few seconds removes most of these.",
      "- **Flood.** One root cause produces fifty alarms. The operator acknowledges all fifty without reading any, which is the behaviour the design taught them.",
      "## Suppression is not hiding",
      "If a pump has tripped, its low-flow alarm is a consequence, not information. Suppressing consequential alarms while their cause is active is the single highest-value change in most systems.",
      "> The measure that matters is alarms per operator per hour during an upset. If it exceeds what one person can read, the system is not communicating, it is broadcasting.",
      "## Priority means something or nothing",
      "Three levels, used honestly. If everything is high priority then nothing is, and operators learn to treat the colour as decoration.",
    ],
  },
  {
    slug: "hmi-design-for-plc",
    title: "HMI screens that help at three in the morning",
    summary:
      "The design question is not how it looks on the handover day but whether it helps somebody tired and under pressure.",
    intent: "How should an industrial HMI be designed?",
    answer:
      "Design for the abnormal case, not the demonstration. High-performance HMI practice uses a grey background with colour reserved for abnormal conditions, so anything coloured means something. An overview screen should let an operator see whether the plant is healthy in one glance, with detail one level down.",
    topic: "Practice",
    minutes: 7,
    published: "2026-04-23",
    figure: "alarm",
    about: ["HMI design", "high performance HMI", "SCADA", "operator interface"],
    faq: [
      {
        q: "Why do modern HMI screens use grey backgrounds?",
        a: "So that colour carries meaning. If the normal state is grey and colour appears only for abnormal conditions, an operator can spot a problem without reading anything. On a screen where everything is already coloured, an alarm colour is just one more thing competing for attention.",
      },
      {
        q: "What belongs on an HMI overview screen?",
        a: "Enough to answer 'is the plant healthy' in one glance, and nothing else. Key process values, equipment states, and active alarms. Detail belongs one navigation level down, because an overview crowded with detail is an overview nobody can read quickly.",
      },
    ],
    body: [
      "The screens that get praised at handover and the screens that help during an upset are usually not the same screens.",
      "## Colour is a scarce resource",
      "High-performance HMI practice puts everything normal in grey and reserves colour for the abnormal. It looks austere and it works, because a coloured thing on a grey screen is visible from across a room.",
      "The opposite, a mimic in full plant colours, means an alarm has to compete with a green pipe and a blue tank for attention.",
      "## Layers, not one big screen",
      "- **Overview.** Is the plant healthy? One glance, no reading.",
      "- **Unit.** What is this section doing?",
      "- **Detail.** Individual values, trends, and controls.",
      "Most operators live on the overview and descend only when something needs attention.",
      "## Trends beat numbers",
      "A number tells you where a value is. A trend tells you where it is going, which is what an operator actually needs to decide anything.",
      "> A tank level shown as 62 percent is less useful than the same value shown falling steadily for ten minutes.",
      "## Design for the tired",
      "The person using this at four in the morning has been woken up. Everything that requires interpretation is a place where a mistake will happen.",
    ],
  },
  {
    slug: "modbus-explained",
    title: "Modbus, still everywhere after forty years",
    summary:
      "The simplest industrial protocol, why it survives, and the three things that catch people out.",
    intent: "What is Modbus and how does it work?",
    answer:
      "Modbus is a request-response protocol where a client asks a server for register values and the server replies. It defines four data areas: coils and discrete inputs for bits, holding and input registers for 16-bit words. It survives because it is trivial to implement, and it catches people out on register numbering, which is offset by one between documentation and the wire.",
    topic: "Networking",
    minutes: 7,
    published: "2026-04-19",
    figure: "network",
    about: ["Modbus", "Modbus TCP", "Modbus RTU", "register addressing"],
    faq: [
      {
        q: "What is the difference between Modbus RTU and Modbus TCP?",
        a: "The same data model over different transport. RTU runs over serial, typically RS-485, with a CRC and strict timing between frames. TCP runs over Ethernet and drops the CRC because TCP already guarantees delivery. The register model and function codes are identical.",
      },
      {
        q: "Why is my Modbus register off by one?",
        a: "Because documentation traditionally numbers registers from one while the protocol addresses them from zero. Holding register 40001 in a manual is address 0 on the wire. Most masters expose one convention and most device manuals use the other, which is why the first value you read is almost always one register out.",
      },
    ],
    body: [
      "Modbus was published in 1979 and is still the most widely implemented industrial protocol, which says more about the value of simplicity than about the protocol.",
      "## The data model",
      "Four areas, and everything is one of them:",
      "- **Coils.** Single bits, readable and writable.",
      "- **Discrete inputs.** Single bits, read only.",
      "- **Input registers.** 16-bit words, read only.",
      "- **Holding registers.** 16-bit words, readable and writable.",
      "That is the whole model. There are no data types, no structures and no discovery.",
      "## The three things that catch people",
      "- **Off-by-one addressing.** Documentation numbers from one, the wire addresses from zero. Register 40001 is address 0.",
      "- **Word order for 32-bit values.** A REAL takes two registers and the protocol does not say which comes first. Vendors disagree. If a value reads as garbage or as a wildly wrong magnitude, swap the words.",
      "- **Timing on RTU.** Frames are delimited by silence, so a slow converter or a busy gateway can split a frame and produce intermittent faults that look like noise.",
      "> None of these are hard once you know them, and all of them cost somebody an afternoon the first time.",
      "## Why it survives",
      "It is small enough to implement on anything, the specification is free, and every device supports it. Newer protocols are better in every technical respect and none of them are on every device.",
    ],
  },
  {
    slug: "ethernet-ip-vs-profinet",
    title: "EtherNet/IP and PROFINET: same cable, different worlds",
    summary:
      "Both run on Ethernet and neither talks to the other, which is a fact of purchasing more than of engineering.",
    intent: "What is the difference between EtherNet/IP and PROFINET?",
    answer:
      "Both are industrial Ethernet protocols and they are not interoperable. EtherNet/IP is the Rockwell-aligned standard, encapsulating CIP over standard TCP and UDP so it runs on ordinary switches. PROFINET is the Siemens-aligned standard, with real-time classes that bypass the normal stack for deterministic traffic. The choice is almost always dictated by the controller.",
    topic: "Networking",
    minutes: 7,
    published: "2026-04-15",
    figure: "network",
    about: ["EtherNet/IP", "PROFINET", "industrial Ethernet", "CIP"],
    faq: [
      {
        q: "Can EtherNet/IP and PROFINET run on the same network?",
        a: "Physically yes, logically no. They can share cabling and switches because both use standard Ethernet framing, but devices on one protocol cannot talk to devices on the other. Crossing between them requires a gateway that maps data explicitly.",
      },
      {
        q: "Which is faster, EtherNet/IP or PROFINET?",
        a: "For ordinary I/O both are comfortably fast enough and the difference does not matter. PROFINET's IRT class achieves lower jitter for motion control by reserving time slots, which matters for coordinated axes and almost nowhere else.",
      },
    ],
    body: [
      "Both are industrial Ethernet. Both use the same cable and the same switches. Neither can talk to the other, and that is the practically important fact.",
      "## EtherNet/IP",
      "CIP, the Common Industrial Protocol, carried over standard TCP and UDP. Because it sits on top of ordinary Ethernet, it works with commodity switches and standard network tooling.",
      "Dominant wherever Rockwell is dominant, which is largely North America.",
      "## PROFINET",
      "The Siemens-aligned standard, with tiers. The basic tier is ordinary Ethernet. The real-time tiers bypass parts of the normal stack, and the isochronous tier reserves time slots for deterministic motion.",
      "Dominant wherever Siemens is dominant, which is largely Europe.",
      "## What actually decides it",
      "The controller. You do not usually choose a protocol; you choose a PLC and inherit one.",
      "> Where it matters is in a mixed plant, because a device bought for one line may be useless on the next. Check the protocol before the specification sheet convinces you the device is the same one.",
      "## Crossing between them",
      "Gateways exist and work. They also add a device to maintain, a mapping to document, and a place for latency to appear, so they are worth avoiding where a native device is available.",
    ],
  },
  {
    slug: "opc-ua-explained",
    title: "OPC UA: what it is for, and what it is not for",
    summary:
      "The protocol that connects the plant floor to everything above it, and the reason it is not a fieldbus.",
    intent: "What is OPC UA used for?",
    answer:
      "OPC UA moves data between control systems and the software above them: historians, MES, ERP and analytics. It carries a self-describing information model, so a client can discover what a server offers rather than being told in advance. It is not a fieldbus and is generally too heavy for cyclic I/O, which remains the job of EtherNet/IP or PROFINET.",
    topic: "Networking",
    minutes: 7,
    published: "2026-04-11",
    figure: "network",
    about: ["OPC UA", "IT OT convergence", "MES", "information model"],
    faq: [
      {
        q: "Is OPC UA a replacement for PROFINET or EtherNet/IP?",
        a: "No. Those are fieldbuses moving small amounts of I/O data on a fixed cycle with hard timing. OPC UA moves richer, self-describing data to systems above the controller, typically on demand or by subscription. They solve different problems and coexist on the same plant.",
      },
      {
        q: "Is OPC UA secure by default?",
        a: "It has strong security built in, including certificates, encryption and user authentication, but it is frequently deployed with security disabled because that is faster to commission. An OPC UA server running in None security mode is an open door, and this is a common finding in plant audits.",
      },
    ],
    body: [
      "OPC UA is what connects the control layer to everything that wants to read from it, which is increasingly everything.",
      "## The information model is the point",
      "Older protocols move numbers. A register holds 4,872 and something elsewhere knows that means tank level in litres.",
      "OPC UA carries the description with the data: names, types, units, engineering ranges and the relationships between objects. A client can connect and ask what is available.",
      "That is what makes it useful for anything above the controller, where the consumer was not designed alongside the machine.",
      "## Where it does not belong",
      "Cyclic I/O. It is too heavy for updating a hundred bits every millisecond, and that is not what it is for.",
      "> The rule of thumb: fieldbus below the controller, OPC UA above it.",
      "## The security footgun",
      "OPC UA has real security: certificates, encryption, authentication. It also has a None mode, which is faster to get working during commissioning and has a way of staying enabled forever.",
      "If you are auditing a plant, this is worth checking first. It is common and it is a genuine exposure.",
    ],
  },
  {
    slug: "rtd-vs-thermocouple",
    title: "RTD or thermocouple: choosing a temperature sensor",
    summary:
      "Two technologies with different failure modes, and a straightforward rule for which to use.",
    intent: "What is the difference between an RTD and a thermocouple?",
    answer:
      "An RTD measures temperature as a change in resistance and is more accurate and stable over a moderate range. A thermocouple generates a small voltage from two dissimilar metals and covers a far wider range, including very high temperatures. Use an RTD below about 600 degrees where accuracy matters, and a thermocouple above it or where response speed matters more than precision.",
    topic: "Analog & I/O",
    minutes: 6,
    published: "2026-04-07",
    figure: "analog",
    about: ["RTD", "thermocouple", "PT100", "temperature measurement", "cold junction"],
    faq: [
      {
        q: "Why does my thermocouple reading drift with ambient temperature?",
        a: "Because the junction where the thermocouple wire meets copper generates its own voltage, and that has to be compensated. If cold junction compensation is misconfigured or the terminal block is in a hot cabinet, the reading follows the cabinet rather than the process.",
      },
      {
        q: "Should I use 2, 3 or 4 wire RTD?",
        a: "Three wire for most industrial work: it compensates for lead resistance and is the usual compromise. Two wire is acceptable only for very short runs, because the lead resistance adds directly to the reading. Four wire is for laboratory accuracy.",
      },
    ],
    body: [
      "Two ways to measure temperature, with different physics and different ways of being wrong.",
      "## RTD",
      "A resistance that changes predictably with temperature. A PT100 reads 100 ohms at zero degrees.",
      "More accurate, more stable over time, and limited to roughly minus 200 to 600 degrees. Slower to respond because there is more mass.",
      "## Thermocouple",
      "Two dissimilar metals joined, generating a small voltage proportional to the temperature difference between the joint and the other end.",
      "Wider range, up to 1,700 degrees for some types, faster response, cheaper. Less accurate and drifts over time.",
      "## The rule",
      "Below 600 degrees where accuracy matters: RTD. Above that, or where speed matters more than precision: thermocouple.",
      "## The failure modes differ, which matters more",
      "An RTD fails open, which reads as maximum temperature on most cards. A thermocouple failing open also usually reads high.",
      "> Both fail towards hot, so a burnout detection setting that trips an over-temperature alarm is doing its job. Configure it deliberately rather than discovering it during a fault.",
      "**Cold junction compensation** is the thermocouple problem that catches people. The terminal block where the thermocouple meets copper is itself a junction generating its own voltage, and the card compensates using a local temperature sensor. Put the terminals somewhere hot and the compensation is wrong.",
    ],
  },
  {
    slug: "plc-io-wiring-basics",
    title: "Wiring I/O without creating problems for later",
    summary:
      "A short list of practices that make the difference between a panel that is easy to fault-find and one that is not.",
    intent: "How should PLC I/O be wired?",
    answer:
      "Keep signal and power segregated, ground shields at one end only, use interposing relays for anything inductive, and label both ends of every wire with the same identifier used in the program. The single highest-value habit is making the label on the wire, the terminal, the drawing and the tag name identical.",
    topic: "Analog & I/O",
    minutes: 6,
    published: "2026-04-03",
    figure: "wiring",
    about: ["PLC wiring", "shielding", "grounding", "interposing relay", "panel design"],
    faq: [
      {
        q: "Should cable shields be grounded at both ends?",
        a: "Normally at one end only, at the control panel. Grounding both ends creates a path for current to flow through the shield when the two ground points sit at slightly different potentials, which injects exactly the noise the shield was there to prevent.",
      },
      {
        q: "Do I need interposing relays for PLC outputs?",
        a: "For anything inductive or drawing significant current, yes. Contactor coils, solenoids and motor starters generate voltage spikes when they release, and driving them directly shortens output card life. A relay is cheaper to replace than a card and isolates the fault.",
      },
    ],
    body: [
      "Most of what makes a panel easy to work on is decided at wiring time by somebody who will never see the fault.",
      "## Segregate",
      "Signal wiring and power wiring in separate trunking, crossing at right angles where they must cross. A VFD output cable running parallel to an analog signal induces noise that looks exactly like a faulty sensor.",
      "## Ground shields at one end",
      "At the panel. Grounding both ends lets current flow along the shield when the two ground points differ in potential, which injects the noise the shield exists to stop.",
      "## Interpose anything inductive",
      "Contactor coils and solenoids produce a spike when they release. An interposing relay takes that abuse instead of the output card, and costs a fraction of the card.",
      "## Label consistently, everywhere",
      "The wire number, the terminal number, the drawing reference and the PLC tag should be recognisably the same thing.",
      "> This is the highest-value habit in the list. Every minute spent matching a wire to a tag during a fault is a minute the line is down, and it is entirely avoidable at build time.",
      "## Leave spare",
      "Spare cores in every multicore, spare terminals on every rail, and spare points on every card. The change nobody planned for always arrives, and it arrives at the worst moment.",
    ],
  },
  {
    slug: "plc-vs-microcontroller",
    title: "PLC or microcontroller: what actually decides it",
    summary:
      "An Arduino can switch a relay for a fraction of the price, and the reasons to buy a PLC anyway are mostly not technical.",
    intent: "Should I use a PLC or a microcontroller?",
    answer:
      "Use a PLC when the thing has to run for twenty years, be maintained by somebody who did not build it, and survive an industrial electrical environment. Use a microcontroller when cost dominates, volume is high, or the application is genuinely simple and disposable. The deciding factors are usually lifecycle and maintainability rather than capability.",
    topic: "Fundamentals",
    minutes: 6,
    published: "2026-03-30",
    figure: "wiring",
    about: ["PLC", "microcontroller", "Arduino", "industrial control"],
    faq: [
      {
        q: "Why are PLCs so expensive compared to an Arduino?",
        a: "You are buying environmental tolerance, a twenty-year supply commitment, isolated I/O rated for industrial voltages, certification, and the ability to hire somebody who can maintain it. The processor is the cheapest part of a PLC and it is not what the price is for.",
      },
      {
        q: "Can I use a Raspberry Pi as a PLC?",
        a: "For non-critical applications, yes, especially with OpenPLC or a CODESYS runtime. The gaps are environmental tolerance, the lack of isolated industrial I/O without extra hardware, SD card reliability, and the absence of anyone else who can maintain it when you are unavailable.",
      },
    ],
    body: [
      "The technical comparison favours the microcontroller on almost every axis, which is why the question keeps coming up and why the answer is usually still 'PLC'.",
      "## What you are actually buying",
      "- **Twenty years of availability.** The controller specified today will still be purchasable in fifteen years, or there is a documented migration.",
      "- **Environmental tolerance.** Temperature, vibration, electrical noise from a VFD two metres away.",
      "- **Isolated I/O.** Rated for the voltages and the abuse of a real machine.",
      "- **Maintainability by others.** A technician who has never seen this machine can open the program and follow it.",
      "That last one is worth more than the rest combined and is invisible in a specification comparison.",
      "## When the microcontroller wins",
      "High volume, where unit cost dominates. Genuinely simple and disposable. A one-off test rig. Anything where the person maintaining it will be the person who built it.",
      "> The honest test: if this thing breaks at 2 a.m. and you are on holiday, can somebody else fix it? That question decides more of these than performance ever does.",
    ],
  },
  {
    slug: "plc-memory-and-retentivity",
    title: "Retentive memory: what survives a power cycle",
    summary:
      "Which values come back after a restart is a design decision, and treating it as an accident causes machines to start on their own.",
    intent: "What is retentive memory in a PLC?",
    answer:
      "Retentive memory keeps its value through a power cycle; non-retentive memory is cleared on restart. Which is which varies by platform and is often configurable per tag. The decision matters most for anything that drives an output, because a retentive bit holding a motor command can energise it the moment power returns.",
    topic: "Fundamentals",
    minutes: 6,
    published: "2026-03-26",
    figure: "dataTypes",
    about: ["retentive memory", "power cycle", "latch", "restart behaviour"],
    faq: [
      {
        q: "Which PLC memory is retentive by default?",
        a: "It varies. Siemens marks retentive areas explicitly in the hardware configuration. Rockwell ControlLogix tags are retentive unless the program clears them at startup. Because it varies, never assume: check the platform and, more importantly, decide what each value should do rather than accepting the default.",
      },
      {
        q: "Can a PLC restart a motor by itself after a power cut?",
        a: "Yes, if the command bit is retentive and nothing clears it at startup. This is why seal-in circuits are preferred over latches for motors: a seal-in depends on the rung conducting, so power loss drops it and it stays off until somebody presses start.",
      },
    ],
    body: [
      "What survives a restart is a design decision. Left as a default, it produces the least safe behaviour at the worst moment.",
      "## The distinction",
      "Retentive values are written to non-volatile storage and restored on power-up. Non-retentive values start at zero.",
      "Which is which depends on the platform and is usually configurable, sometimes per tag and sometimes per memory area.",
      "## What should be retentive",
      "- Production counts and totals.",
      "- Recipe and setpoint values somebody entered.",
      "- Fault history that must survive for investigation.",
      "- Machine position, where losing it means a re-home.",
      "## What should not",
      "Anything that commands motion. A retentive bit holding a run command energises the output as soon as the processor reaches RUN.",
      "> This is the single most dangerous default in the trade, and the reason a seal-in is preferred over a latch for anything that moves.",
      "## Decide it explicitly",
      "Write down, per value, what should happen on restart. Most programs have never had this conversation, and the answer is whatever the platform happened to do.",
    ],
  },
  {
    slug: "first-scan-bit",
    title: "The first scan bit and what belongs in it",
    summary:
      "One scan of initialisation, and a reliable way to make a machine start in a known state.",
    intent: "What is the first scan bit in a PLC?",
    answer:
      "The first scan bit is true for exactly one scan after the processor enters RUN, and false thereafter. It exists to give a program somewhere to initialise: clearing stale state, setting default values, and putting sequences back to a known step. Using it well is what makes a restart predictable.",
    topic: "Fundamentals",
    minutes: 5,
    published: "2026-03-22",
    figure: "scan",
    about: ["first scan", "S:FS", "initialisation", "startup OB"],
    faq: [
      {
        q: "What should go in the first scan of a PLC program?",
        a: "Clearing anything that should not survive a restart, setting default setpoints where none are stored, resetting sequences to a safe step, and clearing outputs that must not re-energise. Anything whose stale value would be misleading or dangerous belongs here.",
      },
      {
        q: "Is the first scan bit the same on every platform?",
        a: "The concept is universal, the name is not. Rockwell exposes S:FS, Siemens provides a startup organisation block that runs once before the cyclic OB, and CODESYS platforms expose a first-cycle flag. The mechanism differs; the intent does not.",
      },
    ],
    body: [
      "Every platform gives you one scan where you know the program has just started. What you do with it determines whether a restart is predictable.",
      "## The names",
      "Rockwell exposes `S:FS`. Siemens gives you a startup organisation block that runs once before the cyclic one. CODESYS platforms expose a first-cycle flag.",
      "Different mechanisms, same idea.",
      "## What belongs there",
      "- Clearing state that should not have survived: step numbers, in-progress flags, stale results.",
      "- Setting defaults where nothing was stored.",
      "- Putting sequences back to a known step rather than resuming mid-cycle.",
      "- Clearing any output command that must require a deliberate restart.",
      "> The test: after a power cut, does the machine come back in a state somebody would predict? If the answer depends on what it was doing when the power went, the first scan is not doing enough.",
      "## What does not belong there",
      "Anything that takes time. The first scan is a scan, and a long initialisation delays the first solve of the actual program. Move slow work into a sequence that runs over several scans.",
    ],
  },
  {
    slug: "jsr-subroutines",
    title: "Subroutines: structuring a program somebody else can read",
    summary:
      "Splitting a program into routines is the cheapest readability improvement available, and there are two traps.",
    intent: "How do subroutines work in ladder logic?",
    answer:
      "A jump-to-subroutine instruction calls another routine, which runs to completion and returns to the next rung. Routines are how a program becomes navigable rather than one enormous ladder. The two traps are that a routine which is never called looks exactly like logic that does not work, and that outputs in an uncalled routine hold their last value.",
    topic: "Instructions",
    minutes: 6,
    published: "2026-03-18",
    figure: "scan",
    about: ["JSR", "subroutine", "program structure", "routine"],
    faq: [
      {
        q: "What happens to outputs in a routine that is not called?",
        a: "They hold their last value. The rungs are not solved, so nothing updates them, and a coil that was energised when the routine stopped being called stays energised. This is a genuine trap when routines are called conditionally.",
      },
      {
        q: "How should I split a PLC program into routines?",
        a: "By machine area or by function, so that a person looking for a specific behaviour knows where to look. One routine per station, plus separate routines for alarms, for manual mode and for analog handling, is a structure most engineers can navigate without a map.",
      },
    ],
    body: [
      "A five thousand rung program in one routine is unreadable regardless of how good the individual rungs are. Splitting it is the cheapest improvement available.",
      "## How the call works",
      "The jump-to-subroutine instruction transfers execution to another routine. That routine solves to its end, then execution returns to the rung after the call.",
      "It is a call, not a jump. The program comes back.",
      "## Trap one: a routine nobody calls",
      "Logic that is never executed looks identical to logic that does not work. The rungs are there, they read correctly, and nothing happens.",
      "> When a section of a program appears to be ignored, check that it is being called before reading a single rung of it.",
      "## Trap two: outputs freeze rather than clear",
      "A routine that stops being called does not turn its outputs off. Nothing solves the rungs, so the coils hold whatever value they had.",
      "For conditionally called routines this matters enormously, and the usual fix is to clear the relevant outputs before the conditional call rather than relying on the routine to do it.",
      "## A structure that works",
      "One routine per machine area, plus separate routines for alarms, manual mode and analog handling. Somebody looking for a specific behaviour should be able to guess which routine it is in.",
    ],
  },
  {
    slug: "pid-tuning-practical",
    title: "PID tuning without the maths",
    summary:
      "A method that gets a loop stable in twenty minutes, and the three symptoms that tell you which term to change.",
    intent: "How do I tune a PID loop?",
    answer:
      "Start with proportional only, increase gain until the loop oscillates steadily, then halve it. Add integral until the offset disappears, slowing it if the loop starts hunting. Leave derivative at zero for most loops, because it amplifies measurement noise and is rarely needed on temperature or level.",
    topic: "Practice",
    minutes: 8,
    published: "2026-03-14",
    figure: "pid",
    about: ["PID tuning", "proportional", "integral", "derivative", "control loop"],
    faq: [
      {
        q: "Should I use derivative in a PID loop?",
        a: "Usually not. Derivative responds to rate of change, which means it amplifies measurement noise, and most industrial loops are stable and fast enough with PI alone. It earns its place on slow, well-damped processes such as large thermal masses where anticipating the change genuinely helps.",
      },
      {
        q: "Why does my PID loop oscillate?",
        a: "Most often proportional gain is too high, so each correction overshoots and the next correction overshoots back. Halve the gain and see whether the oscillation decays. If it oscillates slowly rather than quickly, integral action is too fast and is winding up before the process has responded.",
      },
    ],
    body: [
      "Tuning is usually taught with transfer functions and applied with trial and error. The trial-and-error version, done in a disciplined order, works.",
      "## The order",
      "1. **Proportional only.** Set integral and derivative to zero. Increase gain until the loop oscillates with a steady amplitude that neither grows nor decays.",
      "2. **Halve it.** That gives you margin.",
      "3. **Add integral.** Increase until the steady-state offset disappears. If the loop starts hunting slowly, back it off.",
      "4. **Leave derivative alone** unless you have a specific reason.",
      "## Reading the symptom",
      "- **Fast oscillation.** Proportional gain too high.",
      "- **Slow hunting.** Integral too aggressive.",
      "- **Never reaches setpoint.** Not enough integral.",
      "- **Jumpy output with a noisy measurement.** Derivative, or a measurement that needs filtering.",
      "> A loop that is slightly slow and completely stable beats a fast one that oscillates. Operators turn oscillating loops to manual, and a loop in manual is not controlling anything.",
      "## Before you tune anything",
      "Check the valve. A sticking valve, a badly sized one, or one with significant hysteresis cannot be tuned around, and hours get spent trying.",
    ],
  },
  {
    slug: "motor-starter-logic",
    title: "Motor control logic that survives a real plant",
    summary:
      "The rungs beyond start and stop: interlocks, permissives, run feedback and the fault that nobody plans for.",
    intent: "How do you write PLC logic for a motor starter?",
    answer:
      "Beyond the seal-in, a production motor needs a permissive chain that must be true to start, interlocks that stop it while running, run feedback to confirm it actually started, and a failure-to-start timer. The distinction that matters most is between a permissive, which is checked at start, and an interlock, which is checked continuously.",
    topic: "Practice",
    minutes: 7,
    published: "2026-03-10",
    figure: "safety",
    about: ["motor control", "interlock", "permissive", "run feedback", "contactor"],
    faq: [
      {
        q: "What is the difference between an interlock and a permissive?",
        a: "A permissive must be true to start but does not stop a running motor: lubrication pressure established, guards closed at start. An interlock stops the motor whenever it goes false: overload trip, guard opened, downstream conveyor stopped. Confusing them produces either nuisance stops or unsafe running.",
      },
      {
        q: "Why do I need run feedback from a motor starter?",
        a: "Because commanding a contactor is not the same as the motor running. Without feedback, a welded contact, a tripped breaker or a failed contactor coil all look like a healthy motor to the program, and downstream logic proceeds as though material is moving when it is not.",
      },
    ],
    body: [
      "A seal-in starts and stops a motor. Everything else in a production rung is about what happens when something is wrong.",
      "## Permissives and interlocks are different things",
      "A **permissive** must be true to start, and does not stop a running motor. Lube pressure established. Guards closed at the moment of starting.",
      "An **interlock** stops the motor whenever it goes false. Overload trip. Guard opened. Downstream conveyor stopped.",
      "> Treating a permissive as an interlock produces nuisance stops. Treating an interlock as a permissive produces a machine that keeps running when it should not, which is worse.",
      "## Run feedback is not optional",
      "Commanding a contactor is not the same as the motor turning. Without an auxiliary contact or a current sensor, a welded contact and a healthy motor look identical to the program.",
      "## Failure to start",
      "Command the motor, start a timer, and if run feedback has not appeared within a couple of seconds, drop the command and raise a fault. Without it, a motor that cannot start is commanded indefinitely and the first symptom is a burnt coil.",
      "## Stopping is not one thing",
      "Normal stop, fault stop and emergency stop should be distinguishable in the logic and in the alarm history. When somebody asks why the line stopped, 'it stopped' is not an answer.",
    ],
  },
  {
    slug: "commissioning-checklist",
    title: "Commissioning: the order that finds problems early",
    summary: "A sequence that surfaces the expensive faults while they are still cheap to fix.",
    intent: "What is the right order to commission a PLC system?",
    answer:
      "Prove things in an order where each step depends only on what is already proven: power and safety circuits first, then I/O point by point with the program stopped, then individual devices in manual, then sequences, then the full cycle. Skipping straight to running the sequence is what turns a wiring fault into two days of debugging logic.",
    topic: "Practice",
    minutes: 8,
    published: "2026-03-06",
    figure: "wiring",
    about: ["commissioning", "I/O checkout", "FAT", "SAT"],
    faq: [
      {
        q: "How do you check PLC I/O during commissioning?",
        a: "Point by point, with the program in a state where it cannot command anything. Actuate each input at the field device and confirm the correct bit changes in the program. Force each output individually and confirm the correct device responds. Two people and a radio is faster than one person walking back and forth.",
      },
      {
        q: "What is the difference between a FAT and a SAT?",
        a: "A Factory Acceptance Test runs at the builder's works, often with simulated I/O, to prove the system before it ships. A Site Acceptance Test runs on site with real equipment and real material. The FAT catches logic problems cheaply; the SAT catches everything the simulation could not represent.",
      },
    ],
    body: [
      "The order matters more than the thoroughness, because a fault found in the wrong order is diagnosed against the wrong assumptions.",
      "## The sequence",
      "1. **Power and safety.** E-stops drop the contactors. Prove this before anything can move.",
      "2. **I/O, point by point.** Program stopped or in a state that commands nothing. Actuate each input in the field and watch the bit. Force each output and watch the device.",
      "3. **Devices in manual.** Each motor, each valve, individually, with somebody watching the actual equipment.",
      "4. **Sequences.** One at a time, dry where possible.",
      "5. **Full cycle.** Dry, then with material.",
      "> Every step depends only on what the previous step proved. That is the whole design of the sequence, and it is why skipping ahead costs so much time.",
      "## The I/O check is not optional",
      "It is boring and it is where the faults are. A crossed pair of inputs behaves perfectly until the one condition that distinguishes them, which is usually a fault condition during production.",
      "## Write down what you changed",
      "Commissioning is when a program diverges most from its documentation. An hour capturing changes at the end saves a week eighteen months later.",
    ],
  },
  {
    slug: "plc-security-basics",
    title: "Security for control systems, without the theatre",
    summary:
      "A short list of things that genuinely reduce risk on an OT network, and the ones that only look like they do.",
    intent: "How do I secure a PLC network?",
    answer:
      "The measures that matter most are segmentation from the business network, removing default credentials, keeping controllers in RUN rather than REMOTE, and controlling who can physically reach the panel. Most control systems fail on the basics rather than on anything sophisticated, and an internet-exposed HMI is still the most common serious finding.",
    topic: "Practice",
    minutes: 7,
    published: "2026-03-02",
    figure: "network",
    about: ["OT security", "network segmentation", "ICS security", "air gap"],
    faq: [
      {
        q: "Should PLCs be connected to the internet?",
        a: "No, and the fact that this still needs saying is why it is the first item on every audit. If remote access is genuinely required, it goes through a VPN with multi-factor authentication into a segmented network, never by exposing a controller or an HMI directly.",
      },
      {
        q: "Does an air gap make a control system secure?",
        a: "It helps enormously and it is rarely as complete as people believe. Engineering laptops, USB drives, vendor remote support and temporary connections during commissioning all cross the gap routinely. Treat it as one strong control among several rather than as a guarantee.",
      },
    ],
    body: [
      "Control system security fails on fundamentals far more often than on anything advanced.",
      "## The four that matter most",
      "- **Segmentation.** The control network should not be reachable from the business network without passing something that inspects the traffic.",
      "- **Default credentials.** Every HMI, every managed switch, every VFD web interface. This is the single most common finding.",
      "- **Key position.** A controller left in REMOTE can be reprogrammed over the network. In RUN it cannot.",
      "- **Physical access.** A locked panel defeats more attacks than most software controls.",
      "> If you do only these four, you have removed most of the realistic risk.",
      "## What air gaps actually do",
      "They help, and they leak. Engineering laptops move between networks. USB drives cross. Vendor support connects temporarily and the connection stays.",
      "An air gap is a strong control, not a guarantee, and treating it as a guarantee is how the leaks go unexamined.",
      "## What is mostly theatre",
      "Antivirus on an HMI that cannot be updated. Password policies on a shared operator account everybody knows. Anything that adds friction without changing who can reach what.",
    ],
  },
  {
    slug: "plc-programming-standards",
    title: "Naming and structure conventions worth adopting",
    summary:
      "A convention nobody follows is worse than none. Here is a small set that survives contact with a real project.",
    intent: "What are good PLC programming standards?",
    answer:
      "The conventions that survive are short: descriptive tag names that read in a rung, a consistent prefix or suffix scheme for signal types, one routine per machine area, and comments that explain intent rather than mechanism. A short standard people follow beats a comprehensive one they abandon in week two.",
    topic: "Practice",
    minutes: 6,
    published: "2026-02-26",
    figure: "languages",
    about: ["naming convention", "PLC standards", "code structure", "maintainability"],
    faq: [
      {
        q: "How should PLC tags be named?",
        a: "So the rung reads as a sentence. Conveyor_1_Run_Cmd is better than CNV1RC, and the extra characters cost nothing on a modern controller. Include the equipment, the signal and the type, and stay consistent about the order, because consistency matters more than the specific scheme.",
      },
      {
        q: "Should I use a formal standard like PackML?",
        a: "If you build machines that integrate into other people's lines, yes, because the value is in the shared vocabulary. For a one-off machine maintained by one team it is usually more structure than the problem needs, and a short internal convention followed consistently delivers more.",
      },
    ],
    body: [
      "Every plant has a programming standard. Most of them are twenty pages long and followed for the first two weeks of a project.",
      "## Keep it short enough to remember",
      "A convention that fits on a page gets followed. One that requires reference does not.",
      "## Names should read in a rung",
      "`Conveyor_1_Run_Cmd` reads. `CNV1RC` does not, and the saving is meaningless on hardware that has not been short of memory for twenty years.",
      "Pick an order, equipment then signal then type, and stay with it. Consistency is worth more than the specific choice.",
      "## Structure by area, not by instruction type",
      "One routine per machine area, so somebody hunting a behaviour can guess where it lives. Grouping all timers together makes the program look tidy and makes it unreadable.",
      "## Comment intent",
      "The code says what it does. The comment should say why it is there.",
      "> 'Guard must remain closed two seconds after cycle end, added after 2019 incident' is worth a hundred comments that restate the mnemonic.",
      "## Enforce lightly",
      "A review before handover catches most drift. A rule with no check is a suggestion, and everybody knows it.",
    ],
  },
  {
    slug: "scan-time-optimisation",
    title: "When scan time matters, and what to do about it",
    summary:
      "Most programs do not need optimising. Recognising the ones that do, and knowing where the time actually goes.",
    intent: "How do I reduce PLC scan time?",
    answer:
      "First measure rather than guess: most platforms report scan time and per-task timing. The usual causes are large loops, unnecessary floating point in cyclic code, and communication instructions executing every scan. Moving slow work into a periodic task at a lower rate fixes most problems without touching the logic.",
    topic: "Practice",
    minutes: 7,
    published: "2026-02-22",
    figure: "scan",
    about: ["scan time", "periodic task", "optimisation", "PLC performance"],
    faq: [
      {
        q: "What is a normal PLC scan time?",
        a: "One to twenty milliseconds for a typical machine program on a modern controller. What matters is not the average but the worst case and whether it is stable, because a scan that occasionally stretches to fifty milliseconds will miss signals that the average suggests it should catch.",
      },
      {
        q: "How do I find what is slowing down my PLC scan?",
        a: "Use the platform's task monitoring rather than guessing. Rockwell reports per-task scan times; Siemens exposes cycle time statistics. The usual culprits are loops over large arrays, floating point maths in cyclic code, and messaging instructions triggered every scan rather than on demand.",
      },
    ],
    body: [
      "Most programs never need this. The ones that do usually have one specific cause rather than a general slowness.",
      "## Measure before changing anything",
      "Every platform reports scan time, and most report it per task. Guessing which routine is slow is almost always wrong, and optimising the wrong thing costs a day and changes nothing.",
      "## The usual causes",
      "- **Loops over large arrays** executed every scan when they could run once every hundred.",
      "- **Floating point in cyclic code.** Slower than integer maths, and often unnecessary.",
      "- **Communication instructions** triggered unconditionally rather than on demand.",
      "- **Long conditional chains** where a small reorder lets the common case exit early.",
      "## The fix that usually works",
      "Move slow work out of the main cyclic task and into a periodic task running at a rate the work actually needs. A recipe calculation does not need to run every 5 ms.",
      "> This is almost always better than making the slow code faster, because it changes the requirement rather than the implementation.",
      "## When it genuinely matters",
      "When the shortest signal you must catch approaches the worst-case scan. Below that, scan time is a number on a screen and not a problem.",
    ],
  },
  {
    slug: "plc-simulator-comparison",
    title: "PLC simulators: what each one is actually for",
    summary:
      "Vendor simulators, virtual factories and browser tools solve different problems, and picking the wrong one wastes weeks.",
    intent: "What is the best PLC simulator for learning?",
    answer:
      "It depends on what you are trying to prove. Vendor simulators such as PLCSIM and Emulate reproduce their own platform faithfully and require its licence. Factory I/O adds a 3D process to drive. Browser tools need nothing installed and suit learning logic rather than platform specifics. The property that matters most is whether the simulator models the scan honestly.",
    topic: "Practice",
    minutes: 7,
    published: "2026-02-18",
    figure: "scan",
    about: ["PLC simulator", "PLCSIM", "Factory IO", "Emulate", "training"],
    faq: [
      {
        q: "Does a PLC simulator behave exactly like real hardware?",
        a: "Vendor simulators are close, because they run the same execution engine. Third-party and teaching simulators vary enormously, and the common shortcut is solving rungs like equations rather than honouring the output image, which hides the one-scan lag that causes real bugs.",
      },
      {
        q: "Can I learn PLC programming without hardware?",
        a: "Yes, for the logic. A simulator teaches scan behaviour, instructions and structure perfectly well. What it cannot teach is wiring, electrical fault finding and the physical reality of a panel, which is why most training programmes pair a simulator with a small hardware rig.",
      },
    ],
    body: [
      "Simulators are not interchangeable, and the differences matter more than the feature lists suggest.",
      "## Vendor simulators",
      "PLCSIM for Siemens, Emulate for Rockwell. They run the platform's own execution engine, so behaviour matches hardware closely, including quirks.",
      "They need the platform's licence and tooling, which makes them right for verifying a real project and wrong for a first lesson.",
      "## Process simulators",
      "Factory I/O and similar tools give you a 3D plant to control, driving a real or simulated PLC. Excellent for learning what logic does to a machine rather than to a lamp.",
      "## Browser and teaching tools",
      "Nothing to install, no licence. Right for learning logic and instructions.",
      "## The property that decides quality",
      "Whether the simulator honours the output image.",
      "> A simulator that solves rungs as simultaneous equations will never show a one-scan lag, so a student never meets the single most common real-world bug until they are standing at a machine.",
      "That is the specific thing LADX Studio models faithfully: output image, per-instruction edge memory, and timers on elapsed milliseconds rather than scan count.",
    ],
  },
  {
    slug: "plc-career-path",
    title: "Getting into automation, and what actually gets you hired",
    summary:
      "The skills that appear in job adverts and the skills that get you through an interview are not quite the same list.",
    intent: "How do I become a PLC programmer?",
    answer:
      "The reliable route combines electrical fundamentals, one platform learned properly, and evidence you have made something work. Employers weigh demonstrable troubleshooting ability above breadth of platform knowledge, because platforms can be taught in weeks and diagnostic thinking cannot. A simulator plus a small hardware rig is enough to produce that evidence.",
    topic: "Practice",
    minutes: 7,
    published: "2026-02-14",
    figure: "languages",
    about: ["PLC career", "automation jobs", "controls engineer", "training"],
    faq: [
      {
        q: "Do I need a degree to become a PLC programmer?",
        a: "No. A significant proportion of working controls engineers came through electrical apprenticeships or maintenance roles. A degree helps for design-heavy positions and for larger employers with formal requirements, but demonstrated capability carries more weight in this trade than in most.",
      },
      {
        q: "Which PLC platform should I learn first?",
        a: "Whichever dominates where you want to work: Allen-Bradley in North America, Siemens in Europe. Learning one properly transfers most of the way to any other, because the concepts are shared and only the vocabulary changes. Breadth without depth impresses nobody at interview.",
      },
    ],
    body: [
      "The trade has a shortage and still turns away candidates, which usually means the applicants and the requirement are missing each other.",
      "## What is actually required",
      "- **Electrical fundamentals.** Not theory. Reading a schematic, using a meter, understanding what 24 V DC does and does not do.",
      "- **One platform, properly.** Depth transfers; breadth does not.",
      "- **Evidence.** Something you built that works, that you can describe including what went wrong.",
      "## What gets you through the interview",
      "Troubleshooting. Almost every technical interview in this trade eventually becomes 'the machine does this, what do you check first'.",
      "> The answer that impresses is not the correct fault. It is a method that eliminates possibilities in a sensible order, because that is what the job is.",
      "## Building the evidence",
      "A simulator teaches logic. A small hardware rig, a controller, a few switches and lamps, teaches wiring and the reality of a fault. Together they are enough to have made something and to talk about it credibly.",
      "## The unglamorous advantage",
      "Willingness to travel and to work when the plant is down. Much of this trade happens at inconvenient times, and people who accept that are consistently short in supply.",
    ],
  },
  {
    slug: "what-is-a-plc",
    title: "What a PLC is, for people arriving from software",
    summary:
      "An industrial computer with an unusual execution model, and the constraints that explain every design decision in it.",
    intent: "What is a PLC and how is it different from a computer?",
    answer:
      "A programmable logic controller is an industrial computer that runs one program in an endless loop, reading inputs and writing outputs on a fixed cycle, with no operating system scheduling in the way. It is built for determinism and for twenty years of uninterrupted operation, which explains almost every difference from a general-purpose computer.",
    topic: "Fundamentals",
    minutes: 6,
    published: "2026-02-10",
    figure: "scan",
    about: ["PLC", "programmable logic controller", "industrial control", "determinism"],
    faq: [
      {
        q: "What makes a PLC different from a normal computer?",
        a: "Determinism and lifespan. A PLC runs one program on a fixed cycle with no operating system deciding when it gets CPU time, so the timing is predictable. It is also built to run for decades in heat, vibration and electrical noise, with I/O rated for industrial voltages.",
      },
      {
        q: "Do PLCs have an operating system?",
        a: "They have firmware that manages the scan cycle, I/O and communications, but not a general-purpose operating system with a scheduler competing for CPU. That absence is the point: nothing preempts the control program, so its timing can be relied on.",
      },
    ],
    body: [
      "If you arrive from software, the strange part is not the languages. It is the execution model.",
      "## One program, forever",
      "There is no process list. One program runs, in a loop, from the moment the controller is switched to RUN until it is switched out. Read inputs, solve, write outputs, repeat.",
      "No scheduler decides when it runs. Nothing preempts it. The loop is the whole system.",
      "## Why determinism is the point",
      "A general-purpose computer optimises for average throughput. A controller optimises for predictable worst case, because a machine that is usually fast enough is a machine that occasionally is not, and occasionally is where the injuries are.",
      "## Twenty years, not three",
      "A controller specified today may still be running in 2046. That shapes everything: available spares, backward compatibility, conservative firmware, and a strong preference for boring technology.",
      "> This is also why the industry moves slowly, which looks like inertia from outside and is mostly a rational response to the cost of being wrong.",
      "## What surprises software engineers most",
      "There are no threads, memory is often statically allocated, recursion is frequently prohibited, and dynamic allocation is avoided entirely. All of these are deliberate: each one removes a source of non-determinism.",
    ],
  },
  {
    slug: "virtual-plc-software-defined-automation",
    title: "Virtual PLCs: control logic without the controller",
    summary:
      "Running the PLC as software on standard hardware is now a real product from major vendors, and the tradeoffs are clearer than the marketing suggests.",
    intent: "What is a virtual PLC?",
    answer:
      "A virtual PLC runs the control logic as software on an industrial PC or server, usually in a container on a real-time Linux kernel, with the I/O still on the plant floor. Siemens ships the S7-1500V, and Audi has production lines running on it. The gain is decoupling hardware from software; the cost is that the platform becomes an IT asset with an IT lifecycle.",
    topic: "Platforms",
    minutes: 7,
    published: "2026-02-06",
    figure: "network",
    about: ["virtual PLC", "software defined automation", "S7-1500V", "Industrial Edge"],
    faq: [
      {
        q: "Is a virtual PLC as reliable as a hardware PLC?",
        a: "It can be, on a properly specified real-time platform, and Audi runs production on one. The reliability question moves rather than disappearing: instead of trusting controller firmware you are trusting a real-time kernel, a hypervisor and a server, each of which needs the same lifecycle discipline.",
      },
      {
        q: "What are the benefits of a virtual PLC?",
        a: "Control logic stops being tied to a specific piece of hardware, so it can be backed up, versioned, moved and scaled like software. Several controllers can consolidate onto one machine, and commissioning a replacement becomes deploying an image rather than configuring a device.",
      },
    ],
    body: [
      "The idea is old and the products are new: run the control logic as software on standard hardware, and keep the I/O where it is.",
      "## What ships today",
      "Siemens' SIMATIC S7-1500V runs as a container on an industrial PC with a real-time Linux kernel, under Industrial Edge. Audi has production running on it, which moves this out of the demonstration category.",
      "## What it buys",
      "- Logic decoupled from hardware, so it can be versioned, backed up and moved like software.",
      "- Consolidation, with several controllers on one machine.",
      "- Replacement by deploying an image rather than configuring a device.",
      "## What it costs",
      "The platform becomes an IT asset. Patching, imaging, hardware refresh cycles and somebody who owns it.",
      "> The reliability question does not disappear, it moves. Instead of trusting controller firmware you are trusting a real-time kernel, a hypervisor and a server, and each needs the same discipline the controller used to get for free.",
      "## Where it makes sense first",
      "New lines, high controller counts, and plants that already run a competent IT function on the OT side. Retrofitting a single machine gains little and inherits all of the new obligations.",
    ],
  },
];

/**
 * Everything, in one list.
 *
 * Order here is irrelevant: every reader of POSTS sorts by date. Slugs are
 * checked for collisions at module load rather than left to be discovered as
 * two articles quietly sharing a URL.
 */
export const POSTS: Post[] = [...CORE_POSTS, ...MORE_POSTS];

const seen = new Set<string>();
for (const post of POSTS) {
  if (seen.has(post.slug)) {
    throw new Error(`Two articles share the slug "${post.slug}". One of them has no URL.`);
  }
  seen.add(post.slug);
}

export const TOPICS = [
  "All",
  "Fundamentals",
  "Instructions",
  "Analog & I/O",
  "Platforms",
  "Migration",
  "Languages",
  "Networking",
  "Safety",
  "HMI & SCADA",
  "Drives & Motion",
  "Instrumentation",
  "Panel & Electrical",
  "Compliance",
  "AI",
  "Practice",
] as const;

export function getPost(slug: string): Post | undefined {
  return POSTS.find((p) => p.slug === slug);
}

export function sortedPosts(): Post[] {
  return [...POSTS].sort((a, b) => b.published.localeCompare(a.published));
}

export function postsByTopic(topic: string): Post[] {
  return topic === "All" ? sortedPosts() : sortedPosts().filter((p) => p.topic === topic);
}
