import { LiveRung } from "@/components/site/live-rung";
import { IrHub, RungDivider, ScanCycle, ValidationLoop } from "@/components/site/schematics";
import { CornerTicks, Eyebrow, GridField } from "@/components/site/squares";
import { GROUP_META, GROUP_ORDER, PRODUCTS, STATE_META, productsIn } from "@/content/products";
import { SITE, jsonLd, organizationSchema, softwareSchema, websiteSchema } from "@/lib/seo/schema";
import Link from "next/link";

export const metadata = {
  // The root had no canonical, so ladx.ai and ladx.ai/ and any parameterised
  // variant were three addresses for one page as far as a crawler is
  // concerned. Cheapest possible fix for the most linked page on the site.
  alternates: { canonical: SITE.url },
  title: "The AI workbench for automation engineers",
  description:
    "Draw ladder logic and watch it run. Generate PLC code that compiles before you see it. Write it out as Structured Text, SCL, Rockwell neutral text or PLCopen XML. Bring your own AI key.",
};

export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD has no other injection point
        dangerouslySetInnerHTML={jsonLd(organizationSchema())}
      />
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: as above
        dangerouslySetInnerHTML={jsonLd(websiteSchema())}
      />
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: as above
        dangerouslySetInnerHTML={jsonLd(softwareSchema())}
      />
      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-b border-ink-100">
        <GridField size={34} />
        <div className="relative mx-auto grid max-w-6xl gap-12 px-5 py-16 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:py-24">
          <div>
            <Eyebrow className="mb-5">
              Vendor-neutral &middot; validated &middot; runs offline
            </Eyebrow>
            <h1 className="font-display text-[2.6rem] font-extrabold leading-[1.03] tracking-[-0.025em] text-ink-900 sm:text-[3.4rem]">
              Ladder logic you can
              <br />
              actually <span className="text-teal-600">run</span>.
            </h1>
            <p className="mt-6 max-w-lg text-[16.5px] leading-relaxed text-ink-600">
              An AI workbench for the people who program machines. Draw a rung and watch it conduct.
              Ask for logic and get logic a compiler has already agreed with.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/ladder"
                className="rounded-sm bg-ink-900 px-5 py-2.5 text-[14.5px] font-semibold text-white transition-opacity hover:opacity-90"
              >
                Open the simulator
              </Link>
              <Link
                href="/products"
                className="rounded-sm border border-ink-200 px-5 py-2.5 text-[14.5px] font-medium text-ink-700 transition-colors hover:border-ink-400"
              >
                See what's in it
              </Link>
            </div>
            <p className="mt-3.5 text-[13px] text-ink-400">
              No account, no card. It runs in the browser and saves to the browser.
            </p>
          </div>

          <figure className="lg:justify-self-end">
            <LiveRung />
            <figcaption className="mt-3 max-w-md text-[12.5px] leading-relaxed text-ink-400">
              Not a picture of a ladder program. This is the same scan engine the editor uses,
              solving these two rungs on a timer, in your browser. Operate the switches and it
              behaves the way the logic says it should.
            </figcaption>
          </figure>
        </div>
      </section>

      {/* ── The problem ───────────────────────────────────────────────── */}
      <section className="border-b border-ink-100 bg-ink-50">
        <div className="mx-auto max-w-6xl px-5 py-16">
          <div className="grid gap-10 lg:grid-cols-[1fr_1.25fr] lg:gap-16">
            <div>
              <h2 className="font-display text-[1.75rem] font-bold leading-tight tracking-[-0.015em] text-ink-900">
                Every vendor built a copilot.
                <br />
                Every one of them is a cage.
              </h2>
            </div>
            <div className="space-y-4 text-[15.5px] leading-relaxed text-ink-600">
              <p>
                Siemens will help you write Siemens. Rockwell will help you write Rockwell. Beckhoff
                will help you write Beckhoff. That is not a criticism. Their assistants exist to
                sell their hardware, and they do it well.
              </p>
              <p>
                It leaves out the person who touches a Siemens line, a Rockwell cell and a CODESYS
                skid in the same week. Which is most system integrators, most contractors, and most
                maintenance departments in a plant that has bought equipment for more than ten
                years.
              </p>
              <p className="font-medium text-ink-800">
                LADX belongs to the engineer instead of to the hardware.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── How it works ──────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-5 py-20">
        <header className="mb-3 max-w-2xl">
          <Eyebrow>How it works</Eyebrow>
          <h2 className="font-display text-[1.75rem] font-bold leading-tight tracking-[-0.015em] text-ink-900">
            Nothing reaches you until a compiler agrees it exists
          </h2>
          <p className="mt-4 text-[15.5px] leading-relaxed text-ink-600">
            A language model that has read the internet can write something that looks like ladder
            logic. Looking right is not the bar in a job where wrong code stops a line, or hurts
            somebody. So LADX does not show you an answer it has not checked.
          </p>
        </header>

        <div className="mt-10 rounded-sm border border-ink-100 bg-white p-7">
          <ValidationLoop className="w-full text-ink-800" />
        </div>

        <div className="mt-8 grid gap-6 sm:grid-cols-3">
          {[
            {
              h: "It compiles for real",
              p: "matiec, the open IEC 61131-3 compiler, not a regex that counts brackets. If it does not build, you never see it.",
            },
            {
              h: "It gets checked",
              p: "iec-checker for static analysis and a PLCopen schema pass, so the structure is valid and not only the syntax.",
            },
            {
              h: "It repairs itself",
              p: "Failures go back to the model with the compiler's own errors attached. This is what makes a free model good enough to be useful.",
            },
          ].map((c) => (
            <div key={c.h} className="relative border border-ink-100 bg-white p-5">
              <CornerTicks />
              <h3 className="mb-1.5 text-[15px] font-semibold text-ink-900">{c.h}</h3>
              <p className="text-[14px] leading-relaxed text-ink-500">{c.p}</p>
            </div>
          ))}
        </div>
      </section>

      <RungDivider className="mx-auto h-4 w-full max-w-6xl text-ink-900" />

      {/* ── Products ──────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-5 py-20">
        <header className="mb-12 max-w-2xl">
          <Eyebrow>What's in it</Eyebrow>
          <h2 className="font-display text-[1.75rem] font-bold leading-tight tracking-[-0.015em] text-ink-900">
            Ten tools that share one project
          </h2>
          <p className="mt-4 text-[15.5px] leading-relaxed text-ink-600">
            They are not separate apps that export to each other. They all read and write the same
            representation, so the rung you draw is the rung the AI edits, the rung that converts,
            the rung Monitor runs, and the rung that ends up in the functional spec.
          </p>
        </header>

        <div className="space-y-10">
          {GROUP_ORDER.map((g) => (
            <div key={g}>
              <div className="mb-1 flex flex-wrap items-baseline gap-x-3 border-b border-ink-200 pb-2">
                <h3 className="font-display text-[1.05rem] font-bold text-ink-900">
                  {GROUP_META[g].title}
                </h3>
                <p className="text-[13px] text-ink-500">{GROUP_META[g].blurb}</p>
              </div>
              <ul className="divide-y divide-ink-100">
                {productsIn(g).map((p) => (
                  <li key={p.slug}>
                    <Link
                      href={`/products/${p.slug}`}
                      className="group grid gap-4 py-6 transition-colors hover:bg-ink-50 sm:grid-cols-[1fr_auto] sm:items-baseline sm:gap-8 sm:px-4"
                    >
                      <div className="max-w-2xl">
                        <div className="mb-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                          <h4 className="font-display text-[1.2rem] font-bold tracking-[-0.01em] text-ink-900 group-hover:text-teal-700">
                            {p.name}
                          </h4>
                          <span
                            className={`rounded-sm border px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] ${STATE_META[p.state].cls}`}
                          >
                            {STATE_META[p.state].label}
                          </span>
                        </div>
                        <p className="mb-1.5 text-[14.5px] font-medium text-ink-700">{p.tagline}</p>
                        <p className="text-[14px] leading-relaxed text-ink-500">{p.summary}</p>
                      </div>
                      <span
                        aria-hidden="true"
                        className="hidden text-[14px] text-ink-400 transition-transform group-hover:translate-x-0.5 group-hover:text-ink-600 sm:block"
                      >
                        →
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <p className="mt-8 text-[14px] text-ink-500">
          <Link href="/products" className="font-medium text-ink-800 hover:text-teal-700">
            All {PRODUCTS.length} in detail →
          </Link>
        </p>
      </section>

      {/* ── The IR ────────────────────────────────────────────────────── */}
      <section className="border-y border-ink-100 bg-ink-50">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <div className="grid gap-12 lg:grid-cols-[1fr_1.3fr] lg:items-center">
            <div>
              <Eyebrow>Why conversion works</Eyebrow>
              <h2 className="font-display text-[1.75rem] font-bold leading-tight tracking-[-0.015em] text-ink-900">
                Every format meets in the middle
              </h2>
              <div className="mt-4 space-y-4 text-[15.5px] leading-relaxed text-ink-600">
                <p>
                  There is no Siemens-to-Rockwell converter inside LADX, and there never will be.
                  Everything is read into one representation built on{" "}
                  <span className="font-mono text-[14px] text-ink-800">PLCopen TC6</span>, and
                  everything is written out of it.
                </p>
                <p>
                  Four importers and four exporters give sixteen conversion paths for eight pieces
                  of work: and adding a ninth vendor gives everyone else a new destination for free.
                </p>
              </div>
            </div>
            <div className="rounded-sm border border-ink-100 bg-white p-6">
              <IrHub className="w-full text-ink-800" />
            </div>
          </div>
        </div>
      </section>

      {/* ── Learn ─────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-5 py-20">
        <div className="grid gap-12 lg:grid-cols-[1.3fr_1fr] lg:items-center">
          <div>
            <Eyebrow>Also, it teaches</Eyebrow>
            <h2 className="font-display text-[1.75rem] font-bold leading-tight tracking-[-0.015em] text-ink-900">
              The simulator does not lie to you
            </h2>
            <div className="mt-4 space-y-4 text-[15.5px] leading-relaxed text-ink-600">
              <p>
                Most teaching simulators cheat: they solve the rungs like a list of equations, so a
                coil on rung five appears to reach a contact on rung two instantly. Then the student
                meets a real controller and nothing behaves the way they were taught.
              </p>
              <p>
                LADX keeps the output image. A coil written after a contact has already been solved
                does not reach it until the next sweep. Edges are remembered per instruction, so a
                held button counts once and not four thousand times. Timers advance on elapsed
                milliseconds, not on how many scans happened to fit.
              </p>
              <p className="text-[14.5px] text-ink-500">
                Which is to say: the things students get wrong are the things it gets right.
              </p>
            </div>
            <Link
              href="/resources/plc-scan-cycle-explained"
              className="mt-6 inline-block border-b border-ink-300 pb-0.5 text-[14.5px] font-medium text-ink-800 hover:border-ink-900"
            >
              Read: what actually happens in one scan
            </Link>
          </div>
          <figure className="justify-self-center">
            <ScanCycle className="w-56 text-ink-800 sm:w-64" />
          </figure>
        </div>
      </section>

      {/* ── CTA ───────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-t border-ink-100 bg-ink-900">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(to right, #fff 1px, transparent 1px),linear-gradient(to bottom, #fff 1px, transparent 1px)",
            backgroundSize: "34px 34px",
          }}
        />
        <div className="relative mx-auto max-w-6xl px-5 py-16 text-center">
          <h2 className="font-display text-[1.9rem] font-extrabold tracking-[-0.02em] text-white">
            Open it and draw a rung.
          </h2>
          {/* On a band that is deliberately inverted, the text has to invert
              with it. A step from the ink ramp does not: ink-900 becomes light
              in the dark theme while a mid grey stays mid, and the sentence
              faded to 2.7 to 1. */}
          <p className="mx-auto mt-3 max-w-md text-[15.5px] leading-relaxed text-white/80">
            The editor and the simulator are free and always will be. No sign-up, no card, nothing
            to install.
          </p>
          <Link
            href="/ladder"
            className="mt-7 inline-block rounded-sm bg-teal-400 px-6 py-3 text-[15px] font-semibold text-on-accent transition-opacity hover:opacity-90"
          >
            Open Studio
          </Link>
        </div>
      </section>
    </>
  );
}
