import { RungDivider } from "@/components/site/schematics";
import Link from "next/link";

export const metadata = {
  title: "Forum",
  description:
    "A technical forum for automation engineers, ladder logic, platform differences, migrations, and where AI actually helps.",
};

/**
 * The forum, before it has people in it.
 *
 * Seeded with the questions this audience genuinely asks, taken from what gets
 * asked repeatedly on the existing automation forums, rather than with invented
 * threads and fake reply counts. A forum that opens with "247 replies" from
 * usernames nobody has met reads as a lie, and this audience notices.
 *
 * So: real categories, real opening questions, and an honest note that it is
 * new. Threads become interactive once accounts and posting land.
 */

const CATEGORIES = [
  {
    slug: "ladder-logic",
    name: "Ladder logic",
    blurb: "Rungs, timers, counters, seal-ins, and the scan-order problems that look like magic.",
    seeds: [
      "Why does my coil only work on the second scan?",
      "TON vs RTO for a machine-hours meter, which and why?",
      "Seal-in versus a latch instruction: is there a real difference?",
      "How do I one-shot a signal that is already only one scan long?",
    ],
  },
  {
    slug: "platforms",
    name: "Platforms & migration",
    blurb:
      "Siemens, Rockwell, Beckhoff, CODESYS, differences, conversions, and the parts that don't map.",
    seeds: [
      "PLC-5 to ControlLogix: how are people handling indexed addressing?",
      "Siemens IEC timers vs Rockwell timer structures when converting",
      "Is there any sane path from Modicon to S7-1500?",
      "What actually breaks when you export PLCopen XML between tools?",
    ],
  },
  {
    slug: "analog-io",
    name: "Analog & I/O",
    blurb: "Scaling, raw counts, wiring, and diagnosing the readings that look almost right.",
    seeds: [
      "4-20 mA scaling: what raw range does your card actually use?",
      "Should underrange fault or clamp to zero?",
      "Shielding and grounding for a long analog run, practical rules?",
    ],
  },
  {
    slug: "ai-automation",
    name: "AI in automation",
    blurb:
      "What is genuinely useful, what is marketing, and what nobody should let near a controller.",
    seeds: [
      "Has anyone got a local model working usefully for ST generation?",
      "Where do you draw the line on AI-written code in a safety function?",
      "Vendor copilots: is anyone seeing the productivity numbers they claim?",
      "Air-gapped networks, what are people actually running on site?",
    ],
  },
  {
    slug: "ladx",
    name: "LADX",
    blurb: "Using the tools, reporting what broke, and asking for the thing that is missing.",
    seeds: [
      "Studio: how do I model a branch that opens between two contacts?",
      "Which file formats can I import today?",
      "Feature request: SFC support",
    ],
  },
];

export default function ForumPage() {
  return (
    <div className="mx-auto max-w-6xl px-5 py-16">
      <header className="mb-12 max-w-2xl">
        <p className="mb-3 font-mono text-[11.5px] font-semibold uppercase tracking-[0.18em] text-ink-400">
          Forum
        </p>
        <h1 className="font-display text-[2.4rem] font-extrabold leading-[1.05] tracking-[-0.02em] text-ink-900">
          Ask the awkward questions
        </h1>
        <p className="mt-5 text-[16px] leading-relaxed text-ink-600">
          A place for the problems that do not fit in a manual, why the rung works on the bench and
          not on the line, what breaks in a migration, whether anyone has got a local model to write
          usable structured text.
        </p>
      </header>

      <div className="mb-14 rounded-sm border border-ink-200 bg-ink-50/70 px-6 py-5">
        <h2 className="mb-1.5 text-[15px] font-semibold text-ink-900">This forum is new</h2>
        <p className="max-w-3xl text-[14.5px] leading-relaxed text-ink-600">
          Rather than fill it with invented threads and reply counts nobody earned, the categories
          below are seeded with questions this industry genuinely asks, the ones that come up over
          and over on the existing forums. Posting opens with accounts shortly. Until then,{" "}
          <Link href="/help" className="border-b border-ink-300 text-ink-800 hover:border-ink-900">
            send the question directly
          </Link>{" "}
          and it will be answered and posted here.
        </p>
      </div>

      <ul className="space-y-10">
        {CATEGORIES.map((cat) => (
          <li key={cat.slug} className="border-t border-ink-100 pt-8">
            <div className="grid gap-6 lg:grid-cols-[1fr_1.7fr] lg:gap-12">
              <div>
                <h2 className="font-display text-[1.3rem] font-bold tracking-[-0.012em] text-ink-900">
                  {cat.name}
                </h2>
                <p className="mt-2 max-w-xs text-[14px] leading-relaxed text-ink-500">
                  {cat.blurb}
                </p>
              </div>
              <ul className="divide-y divide-ink-100">
                {cat.seeds.map((q) => (
                  <li key={q}>
                    <Link
                      href={`/help?subject=${encodeURIComponent(q)}`}
                      className="group flex items-baseline justify-between gap-4 py-3"
                    >
                      <span className="text-[15px] leading-snug text-ink-700 group-hover:text-teal-700">
                        {q}
                      </span>
                      <span className="shrink-0 font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-300 group-hover:text-ink-500">
                        Ask
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </li>
        ))}
      </ul>

      <RungDivider className="mx-auto my-14 h-4 w-full max-w-xl text-ink-900" />

      <section className="mx-auto max-w-2xl text-center">
        <h2 className="font-display text-[1.4rem] font-bold tracking-[-0.015em] text-ink-900">
          Answers get written up
        </h2>
        <p className="mt-3 text-[15.5px] leading-relaxed text-ink-600">
          Questions that come up more than once become articles. Several of the pieces in{" "}
          <Link
            href="/resources"
            className="border-b border-ink-300 text-ink-800 hover:border-ink-900"
          >
            Resources
          </Link>{" "}
          started as somebody asking why their coil did not work.
        </p>
      </section>
    </div>
  );
}
