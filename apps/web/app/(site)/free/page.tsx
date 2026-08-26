import { SITE, breadcrumbSchema, faqSchema, itemListSchema, jsonLd } from "@/lib/seo/schema";
import Link from "next/link";

export const metadata = {
  title: "Free PLC, CAD and SCADA software you can use in a browser",
  description:
    "Four automation tools that are free with no account, no download, no trial period and no tag limit: a ladder editor with a real PLC simulator, CAD for panels and schematics, an HMI and SCADA builder, and a converter to Structured Text and SCL.",
  alternates: { canonical: `${SITE.url}/free` },
  openGraph: {
    type: "website",
    url: `${SITE.url}/free`,
    title: "Free PLC, CAD and SCADA software, in a browser",
    description:
      "No account, no download, no trial period, no tag limit. Four tools that open and work.",
  },
};

const TOOLS = [
  {
    href: "/ladder",
    name: "Ladder editor and PLC simulator",
    query: "free PLC programming software, online PLC simulator",
    what: "Draw ladder logic and run it. The simulator keeps a real output image, holds edge memory per instruction and counts timers in milliseconds rather than scans, so a rung behaves the way it would on a controller rather than the way a teaching tool pretends.",
    free: "Everything. Twenty three instructions, the tag table, the simulator, export.",
    account: "Saving to a project rather than to this browser, and AI generation.",
  },
  {
    href: "/cad",
    name: "CAD for panels and schematics",
    query: "free online CAD, free electrical CAD software",
    what: "Two dimensional drafting for the electrical and panel drawings an automation project produces. Eleven templates numbered the way a control package is read, typed commands, object snap, dimensions, named layers.",
    free: "The whole editor, and DXF and SVG export, so nothing is trapped here.",
    account:
      "Drawings that follow you between machines, filed against a project with its title block filled in.",
  },
  {
    href: "/hmi",
    name: "HMI and SCADA builder",
    query: "free SCADA software, free HMI software",
    what: "Operator screens with eighty seven symbols and alarms following the ISA-18.2 state machine. It binds to the ladder editor's own tag table and runs against the same scan engine, so a start button on the glass starts the motor in the logic.",
    free: "The builder, the symbols, the alarms, the runtime, and no tag limit.",
    account: "A project to file it against, and drawing a screen from a description.",
  },
  {
    href: "/convert",
    name: "Ladder to Structured Text and SCL",
    query: "convert ladder to structured text",
    what: "Write a ladder program out as IEC 61131-3 Structured Text, Siemens SCL, Rockwell neutral text or PLCopen XML, with a report of what converted cleanly and what did not.",
    free: "All four outputs and the conversion report. It runs in the browser, so the program does not leave your machine.",
    account: "Nothing. This one is the same either way.",
  },
];

const FAQ = [
  {
    q: "Is this actually free, or is it a trial?",
    a: "Free with no time limit. There is no trial period, no watermark, no tag count and no export paywall on any of the four tools. An account adds somewhere central to keep work and AI generation, which needs a provider key that belongs to a person.",
  },
  {
    q: "Do I need to download or install anything?",
    a: "No. All four run in the browser. Work is saved in the browser, which means clearing your site data clears it, so export anything you want to keep. There is also a desktop build for sites that will not allow a cloud tool at all.",
  },
  {
    q: "What is the catch?",
    a: "Two honest ones. Anything using a model needs a provider key you supply, because there is no shared inference key and no metering here. And none of these deploy to hardware: they design, simulate and document, and downloading to a controller or a panel is a deliberate act with the vendor's own tools.",
  },
  {
    q: "How does this compare to OpenPLC or CODESYS?",
    a: "Different jobs. OpenPLC is a real runtime you can put on hardware; CODESYS is a full IEC engineering environment with a free editor and a runtime that stops after two hours. These tools install nothing, expire never, and are for drawing, proving and documenting rather than for running a machine.",
  },
  {
    q: "Can I use this commercially?",
    a: "Yes. There is no personal-use restriction and no licence that changes when the drawing is for a client.",
  },
];

/**
 * The free tools, in one place.
 *
 * The pages that rank for "free PLC programming software" and "free online CAD"
 * are almost all roundups, and the thing they all lead with is the catch: which
 * of these expires, which watermarks, which is free until you need a tag count
 * a real machine has. That is the question this audience is actually asking,
 * so the page answers it in a column rather than burying it.
 *
 * Saying what an account adds, next to what it does not, is the part that makes
 * this credible. A page claiming everything is free and explaining nothing gets
 * read as the usual thing.
 */
export default function FreePage() {
  return (
    <div className="mx-auto max-w-4xl px-5 py-16">
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD has no other insertion point.
        dangerouslySetInnerHTML={jsonLd(
          itemListSchema({
            url: "/free",
            name: "Free automation software that runs in a browser",
            items: TOOLS.map((t) => ({ name: t.name, description: t.what, path: t.href })),
          }),
        )}
      />
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD has no other insertion point.
        dangerouslySetInnerHTML={jsonLd(faqSchema(FAQ, "/free"))}
      />
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD has no other insertion point.
        dangerouslySetInnerHTML={jsonLd(
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Free tools", path: "/free" },
          ]),
        )}
      />

      <header className="mb-12 max-w-2xl">
        <p className="mb-3 font-mono text-[11.5px] font-semibold uppercase tracking-[0.18em] text-ink-400">
          No account, no download
        </p>
        <h1 className="font-display text-[2.4rem] font-extrabold leading-[1.05] tracking-[-0.02em] text-ink-900">
          Free PLC, CAD and SCADA software, in a browser
        </h1>
        <p className="mt-5 border-l-2 border-teal-600 pl-5 text-[17px] leading-relaxed text-ink-800">
          Four tools that open and work: a ladder editor with a scan-accurate PLC simulator, CAD for
          panel drawings and schematics, an HMI and SCADA builder with no tag limit, and a converter
          to Structured Text and SCL. No sign-up, no installer, no trial period, nothing that
          expires.
        </p>
      </header>

      <section className="mb-14">
        <h2 className="mb-2 font-display text-[1.3rem] font-bold tracking-[-0.012em] text-ink-900">
          What "free" usually means in this industry
        </h2>
        <p className="text-[15.5px] leading-relaxed text-ink-600">
          It is worth being specific, because the word is doing a lot of different jobs. Some tools
          are free forever and open source. Some are thirty day trials. Some give you a free editor
          and a runtime that stops after two hours. Some are free up to a tag count chosen to sit
          just below what a real machine needs. Some are free for personal use and licensed the
          moment the drawing is for a client.
        </p>
        <p className="mt-3 text-[15.5px] leading-relaxed text-ink-600">
          All of those are legitimate. The problem is finding out which one you have after an
          evening's work. So here is which one this is, per tool, including what an account adds.
        </p>
      </section>

      <ul className="mb-14 space-y-px">
        {TOOLS.map((t) => (
          <li key={t.href} className="border-b border-ink-100 py-7 first:border-t">
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <h2 className="font-display text-[1.3rem] font-bold tracking-[-0.012em] text-ink-900">
                <Link href={t.href} className="hover:text-teal-700">
                  {t.name}
                </Link>
              </h2>
              <span className="font-mono text-[11px] text-ink-400">{t.query}</span>
            </div>
            <p className="mt-2.5 max-w-2xl text-[15px] leading-relaxed text-ink-600">{t.what}</p>
            <dl className="mt-4 grid gap-x-8 gap-y-2 sm:grid-cols-2">
              <div>
                <dt className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-teal-700">
                  Free
                </dt>
                <dd className="mt-1 text-[14px] leading-relaxed text-ink-600">{t.free}</dd>
              </div>
              <div>
                <dt className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-400">
                  An account adds
                </dt>
                <dd className="mt-1 text-[14px] leading-relaxed text-ink-500">{t.account}</dd>
              </div>
            </dl>
            <Link
              href={t.href}
              className="mt-4 inline-block rounded-sm bg-ink-900 px-4 py-2 text-[14px] font-semibold text-white hover:opacity-90"
            >
              Open it
            </Link>
          </li>
        ))}
      </ul>

      <section className="mb-14">
        <h2 className="mb-4 font-display text-[1.3rem] font-bold tracking-[-0.012em] text-ink-900">
          Questions
        </h2>
        <dl className="space-y-7">
          {FAQ.map((item) => (
            <div key={item.q}>
              <dt className="text-[16px] font-semibold leading-snug text-ink-900">{item.q}</dt>
              <dd className="mt-2 max-w-2xl text-[15px] leading-relaxed text-ink-600">{item.a}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="rounded-sm border border-ink-200 bg-ink-50/60 p-6">
        <h2 className="font-display text-[1.1rem] font-bold text-ink-900">
          Also free, and not software
        </h2>
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-ink-600">
          Seventeen automation project document templates, downloadable without an account, and a
          hundred articles on the things that get asked every week: scan cycles, timers, analogue
          scaling, functional safety, alarm rationalisation and the rest.
        </p>
        <div className="mt-4 flex flex-wrap gap-4 text-[14px]">
          <Link href="/documents" className="font-semibold text-teal-700 underline">
            Document templates
          </Link>
          <Link href="/resources" className="font-semibold text-teal-700 underline">
            The writing
          </Link>
          <Link href="/products" className="font-semibold text-teal-700 underline">
            Everything, including what needs an account
          </Link>
        </div>
      </div>
    </div>
  );
}
