/**
 * Seed the forum with starter threads.
 *
 * Authored by one official LADX account rather than by invented members. That
 * distinction matters: a forum that opens with fabricated usernames and fake
 * reply counts is lying to an audience that checks things for a living, and it
 * only has to be noticed once. Staff-written opening topics are ordinary
 * practice and are what these are.
 *
 * The content is real: the questions are ones that genuinely recur in this
 * field, and the answers are correct. They exist to be useful on their own and
 * to show what a good thread looks like here.
 *
 * Idempotent. Re-running updates nothing and inserts nothing that already
 * exists, so it is safe to run against production more than once.
 *
 *   pnpm --filter=@ladx/web exec tsx scripts/seed-forum.ts
 */

import { db } from "@/lib/db/client";
import { forumPosts, forumThreads, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const SEED_EMAIL = "team@ladx.ai";
const SEED_NAME = "LADX";

interface Seed {
  category: string;
  title: string;
  body: string;
  replies?: string[];
  answerIndex?: number;
  pinned?: boolean;
}

const THREADS: Seed[] = [
  {
    category: "ladder-logic",
    title: "Why does my coil only energise on the second scan?",
    pinned: true,
    body: `This one catches nearly everyone once, and it is not a fault.

A PLC does not evaluate a rung the instant a value changes. It reads every input into an image table, solves the whole program against that frozen copy, then writes the output image to the physical outputs. One pass, top to bottom.

So if you write a coil on rung 10 and examine that same bit on rung 3, rung 3 has already been solved this sweep. It sees last scan's value. The effect only reaches it on the next pass, which is why it looks like a one scan delay.

Two things follow:

- Forward references, where you write on an earlier rung and read on a later one, resolve inside the same scan.
- Backward references always lag by exactly one scan.

If the lag matters, move the rung. If you need the value immediately in the same sweep, that is what an immediate input or output instruction is for, and it is worth knowing they bypass the image table and cost scan time.`,
    replies: [
      "Worth adding the diagnostic: put the two rungs in the opposite order and see if the symptom moves. If it does, it is scan order rather than logic.",
      "The place this bites hardest is a sequencer written with the steps in descending order. Everything works but every transition takes two scans, and on a fast machine that is a real timing difference.",
    ],
    answerIndex: 0,
  },
  {
    category: "ladder-logic",
    title: "TON, TOF or RTO for a machine hours meter?",
    body: `RTO, and it is not close.

A TON resets its accumulated value the moment the rung goes false. For a running hours meter that means every time the machine stops you lose the count, which is the opposite of what the meter is for.

RTO is retentive: it holds the accumulated value when the rung goes false and carries on from there when it goes true again. You clear it deliberately with an RES, which is exactly the behaviour you want for a total that spans shifts.

Two things to get right:

- Put the RES somewhere an operator cannot reach by accident. A maintenance reset behind a key switch or a password level.
- Decide what happens on a power cycle. RTO accumulators are usually retentive across a restart, but confirm it on your platform rather than assuming, because it varies.

If you are on a platform with no RTO, add the elapsed time into a retentive DINT yourself on a one second pulse. Slightly more work and completely portable.`,
    replies: [
      "On Siemens there is no RTO as such. IEC TON resets on a falling edge, so the usual approach is exactly what you describe: a one second clock incrementing a retentive counter.",
    ],
  },
  {
    category: "ladder-logic",
    title: "Seal-in versus a latch instruction: is there a real difference?",
    body: `Yes, and it shows up on power loss and on E-stop, which is when it matters.

A seal-in is a branch around the start contact that keeps the rung true through the output's own contact. It is ordinary logic, so it obeys everything else on the rung. Put a stop contact in series and it drops out. Lose control power and it drops out, and it stays dropped when power returns because the coil is false.

A latch (OTL/SET) writes the bit and walks away. The bit is usually retentive, which means it survives a power cycle. On power restoration the machine can restart on its own with nobody touching anything.

That difference is the whole argument. For anything that moves, use a seal-in, because "does not restart by itself" is a safety property you get for free.

Latches are still right for state that should survive a restart: a fault that has been recorded and not yet acknowledged, a mode selection, a recipe number. Things that describe the machine rather than energise it.`,
    replies: [
      "The other practical difference is finding it later. A seal-in is one rung you can read. A latch is set on one rung and unlatched on another, sometimes in a different routine, and tracing it is a cross reference exercise.",
      "ISO 13849 effectively decides this for you on safety related circuits: an automatic restart on power restoration is not acceptable, so the latch is out.",
    ],
    answerIndex: 0,
  },
  {
    category: "platforms",
    title: "Why does my Siemens analog read 27648 instead of a percentage?",
    body: `Because 27648 is what the card actually produces, and nothing has scaled it yet.

Siemens analog modules return a raw integer over the nominal range. For a 4 to 20 mA input:

- 4 mA reads 0
- 20 mA reads 27648
- The range continues past both ends for over and under range detection

27648 is not an arbitrary number. It is 27648 = 1.35 x 20480, chosen so the nominal range sits inside a 16 bit word with headroom above and below for out of range values.

To get engineering units, use NORM_X to bring the raw value into 0.0 to 1.0, then SCALE_X to map that onto your range. Two blocks, in that order.

The part worth doing carefully is out of range. Below about 3.6 mA the card reports a negative value, and a broken wire reads as zero flow rather than as a fault. If the sequence carries on because it believes there is no flow, that is a real problem. Check the raw value against its limits before you use the scaled one.`,
    replies: [
      "Also worth knowing: the same 27648 applies to analog outputs. Writing 27648 gives you 20 mA, and writing 32767 does not give you more, it gives you an over range.",
    ],
    answerIndex: 0,
  },
  {
    category: "platforms",
    title: "Moving from RSLogix 500 to Studio 5000: what actually changes?",
    body: `The instruction set is largely familiar. The data model is not, and that is where the time goes.

In SLC and MicroLogix, addresses are physical: N7:0, B3:0/2, T4:1. The address tells you where the value lives. In ControlLogix you have named tags with data types, and the physical address only appears at the I/O module. Everything else is a name.

What that changes in practice:

- Arrays and UDTs replace address arithmetic. A 20 element structure is one tag, not a block of N7 you have to remember the layout of.
- Timers become TIMER structures with .PRE, .ACC, .DN. No more T4:1/DN.
- Add-On Instructions replace copy and paste. Worth learning early, because most SLC programs are full of repeated logic that becomes one AOI.
- Aliases let you name a physical point once and use the name everywhere.

The conversion tool will produce something that runs, and it will be full of N7_0 style tags that carry none of that benefit. It is a starting point, not a finished migration. Budget time to re-tag it properly or you have moved the program without gaining anything.`,
    replies: [
      "The other one that catches people: scan order. SLC files ran in a fixed order, ControlLogix has tasks with priorities. A continuous task plus a periodic task is not the same thing as ladder file 2 and 3.",
    ],
  },
  {
    category: "migration",
    title: "Is there an honest way to convert ladder to Structured Text?",
    body: `The logic converts exactly. The drawing does not, and any tool that implies otherwise is overselling.

What converts cleanly:

- A contact is a boolean term. XIC becomes the tag, XIO becomes NOT tag.
- A series is AND, a parallel is OR.
- A coil is an assignment: the tag becomes the rung expression.

What does not survive:

- The physical order of contacts on the rung. ST has no way to say that.
- Branch geometry. A seal-in becomes ((Start OR Run) AND NOT Stop), which is correct and no longer looks like a seal-in.
- Anything that holds state across scans. Timers, counters and one shots become function block instances with declarations that the original ladder never had, and those instances are new state you have to check.

The retentive timer is the one to watch. IEC has TON and TOF but no standard retentive on delay, so a tool that maps RTO to TON has silently changed behaviour: TON resets when the rung goes false and RTO does not.

Convert it, then read the report, then read the output. It is a translation, not a compile.`,
    replies: [
      "The reverse direction is much worse, for what it is worth. ST to ladder has to invent a layout, and the result is usually one enormous rung nobody can read.",
      'Agreed on the report. The useful question for any conversion tool is not "did it produce output" but "does it tell me what it could not do".',
    ],
    answerIndex: 0,
  },
  {
    category: "safety",
    title: "Do I need a safety PLC, or will a safety relay do?",
    body: `The risk assessment decides, not the budget and not the preference. But there is a practical dividing line.

A safety relay is right when you have a small number of independent safety functions with simple logic. One or two E-stops, a guard interlock, a light curtain, each doing one thing. It is cheap, it is quick to wire, and its behaviour is obvious from the schematic.

A safety controller starts to pay when:

- You have more than roughly five safety functions, where the relay count and the wiring stop being simple.
- The logic is conditional. Muting, zone control, different behaviour in setup mode versus production.
- You need diagnostics. A relay tells you it has tripped; a controller tells you which channel, and that is the difference between a five minute fault find and an hour.
- Safety data has to travel over a network to another cell.

What does not change either way: the required performance level comes out of the risk assessment first, and then you choose hardware that achieves it. Both routes can reach PL e. Picking the hardware first and assessing afterwards is the wrong order and it is how projects end up rebuilding a panel.`,
    replies: [
      'The diagnostics point is underrated. On a line with twenty guard doors, a relay system that just says "guard circuit open" costs you real production time every single trip.',
    ],
    answerIndex: 0,
  },
  {
    category: "safety",
    title: "Reset circuit that cannot be defeated by a taped button",
    body: `Make the reset act on an edge, not a level, and monitor the button for being stuck.

The failure being defended against is simple: somebody tapes the reset button down, or its contact welds closed. If the reset is level sensitive, the machine then re-enables the instant the guard closes, with nobody deciding anything. That is precisely the hazard the interlock exists to prevent.

Two requirements, and both are ordinary:

- Trigger on the falling edge of the reset input, so a held button does nothing. The operator must press and release, which is a deliberate act.
- Detect a held reset. If the input is true when the safety function first becomes ready, refuse the reset and raise a fault, because the button is stuck or taped.

Any certified safety relay or safety block implements both already. The mistake is nearly always in application logic that adds its own reset on top and does it with a plain contact.

While you are there, put the reset where the operator can see the hazard from it. A reset button around a corner from the machine defeats the point of a manual reset entirely.`,
    replies: [
      "This is worth testing explicitly at FAT: hold the reset closed, then satisfy the guard, and confirm nothing re-enables. It is a thirty second test that catches a real design fault.",
    ],
    answerIndex: 0,
  },
  {
    category: "commissioning",
    title: "Analog input reads full scale: where do you start?",
    body: `Work from the field back, and check the cheap things first.

Full scale on a 4 to 20 mA input almost always means the loop is open or the input is seeing more current than it should. In order:

1. Measure the current at the transmitter with a meter in series, or use its own test facility. If the transmitter is producing 4 mA and the card reads full scale, the fault is between them.
2. Check the loop is not open. An open 4 to 20 mA input on many cards reads high rather than low, which is the opposite of intuition.
3. Check the wiring type against the card configuration. A two wire transmitter on a channel configured for four wire will not behave, and the same is true in reverse.
4. Check the screen is earthed at one end only. Earthed at both ends it becomes a loop and picks up whatever is nearby.
5. Only then suspect scaling. If the raw count is at its maximum, scaling is not the problem.

The single most useful habit is measuring the actual milliamps early. It splits the problem in half in about a minute and tells you which side of the terminal to look at.`,
    replies: [
      "Adding one: check whether anything else shares that supply. A 24 V rail that is sagging under load produces analog readings that wander in a way that looks like a sensor fault.",
    ],
    answerIndex: 0,
  },
  {
    category: "commissioning",
    title: "The sequence hangs on one step and nobody can say why",
    body: `Because the step has no timeout, so there is nothing to report.

A step that waits for a transition condition and never gets it will wait forever, and the only symptom is that the machine stopped. The operator says "it just stopped", which is completely accurate and no help at all.

The fix is a rule rather than a repair: every step gets a timeout, and the timeout raises an alarm that names the step and the condition it was waiting for. Then the same failure reports itself as "step 4 timed out waiting for XV-101 open limit", which is a fault somebody can act on.

Two more things that pay for themselves immediately:

- Expose the current step number to the HMI. Diagnosing a stuck sequence without it means going online with the programming software, which not everyone on site can do.
- Log step transitions with timestamps. A step that usually takes 2 seconds and today took 30 is a bearing starting to go, and you can only see that if the transitions are recorded.

If you are retrofitting this to an existing sequence, start with the steps that wait on field devices. That is where nearly all of them hang.`,
    replies: [
      "The HMI step number is the single highest value change on this list. It turns a call-out into a phone call.",
      'Worth pairing with a "waiting for" string on the screen. The step number tells you where, the string tells you what, and between them most faults are self explaining.',
    ],
    answerIndex: 0,
  },
  {
    category: "hmi-scada",
    title: "Alarm priorities: how do you decide what counts as High?",
    body: `By consequence and by the time available to act, not by how important the equipment feels.

ISA-18.2 asks three questions of every alarm, and they settle nearly every argument:

1. What happens if the operator does nothing?
2. How long do they have before that happens?
3. What action do they take?

If there is no answer to question 3, it is not an alarm. It is a status, and putting it on the alarm list is how alarm floods start.

A workable split:

- High: injury, environmental release, or major loss. Action needed in under about three minutes.
- Medium: product loss or equipment damage. Action needed this shift.
- Low: efficiency or minor quality. Action needed, not urgent.

The distribution matters as much as the individual decisions. Aim for roughly 5 percent high, 15 percent medium, 80 percent low. If a third of your alarms are High, none of them are, because the operator cannot tell which to look at first.

Then measure it in service: average alarms per hour per operator should be around six. If it is sixty, the priorities are not the problem, the alarm list is.`,
    replies: [
      'The question that kills most proposed High alarms is the second one. "What happens if they do nothing for ten minutes" is very often "nothing", and that is a Low.',
    ],
    answerIndex: 0,
  },
  {
    category: "ai-and-tooling",
    title: "Would you let an LLM write a rung that goes to a real machine?",
    body: `Not unreviewed, and not without it having been compiled first. But the question is more interesting than a flat no.

Where it genuinely helps today:

- Documentation. Turning a program you already wrote into an I/O schedule or a functional description is a mechanical task on information that already exists, and it is the least risky thing to automate.
- Explaining unfamiliar code. "What does this rung do" against a program somebody left behind ten years ago is a real time saver.
- Boilerplate. The twentieth motor block that looks like the first nineteen.

Where it does not:

- Anything safety related. That is not a confidence question, it is a competence and liability question, and the answer does not change with a better model.
- Timing sensitive logic where the correct answer depends on scan behaviour the model cannot observe.
- Anything where being subtly wrong looks exactly like being right, which describes a great deal of ladder.

The useful test is not "is the output correct" but "would I have caught it if it were wrong". If generated logic goes through a real compiler and then a real review, it is a tool. If it goes straight to a controller, it is a hazard with good grammar.`,
    replies: [
      "The compile step is the part people skip. An answer that looks plausible and does not compile is obviously wrong; an answer that compiles and is subtly wrong is the dangerous one, and only review catches that.",
      "Agreed on documentation being the safe win. It is also the job nobody wants to do, which is a good sign it is the right thing to automate first.",
    ],
    answerIndex: 0,
  },
];

function slugify(title: string): string {
  const base = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 70)
    .replace(/^-+|-+$/g, "");
  return base || "thread";
}

async function main() {
  // The seed account. It has no usable password: these threads are authored,
  // not logged into, and an account nobody can sign in to cannot be abused.
  let [account] = await db().select().from(users).where(eq(users.email, SEED_EMAIL)).limit(1);

  if (!account) {
    [account] = await db()
      .insert(users)
      .values({
        email: SEED_EMAIL,
        // Not a bcrypt hash, so no password can ever match it.
        passwordHash: "seeded-account-no-login",
        displayName: SEED_NAME,
      })
      .returning();
    console.log(`created seed account ${SEED_EMAIL}`);
  }
  if (!account) throw new Error("could not create the seed account");

  let inserted = 0;
  let skipped = 0;

  for (const seed of THREADS) {
    const slug = slugify(seed.title);
    const [existing] = await db()
      .select({ id: forumThreads.id })
      .from(forumThreads)
      .where(eq(forumThreads.slug, slug))
      .limit(1);

    if (existing) {
      skipped++;
      continue;
    }

    const [thread] = await db()
      .insert(forumThreads)
      .values({
        authorId: account.id,
        category: seed.category,
        title: seed.title,
        slug,
        body: seed.body,
        pinned: seed.pinned ?? false,
        replyCount: seed.replies?.length ?? 0,
      })
      .returning({ id: forumThreads.id });
    if (!thread) continue;

    const postIds: string[] = [];
    for (const body of seed.replies ?? []) {
      const [post] = await db()
        .insert(forumPosts)
        .values({ threadId: thread.id, authorId: account.id, body })
        .returning({ id: forumPosts.id });
      if (post) postIds.push(post.id);
    }

    if (seed.answerIndex !== undefined && postIds[seed.answerIndex]) {
      await db()
        .update(forumThreads)
        .set({ answerPostId: postIds[seed.answerIndex] })
        .where(eq(forumThreads.id, thread.id));
    }

    inserted++;
  }

  console.log(`seeded ${inserted} threads, skipped ${skipped} that already existed`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
