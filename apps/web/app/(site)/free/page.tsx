import {
  FREE_GROUP_META,
  FREE_GROUP_ORDER,
  FREE_SOFTWARE,
  FREE_TOOLS,
  freeToolsIn,
} from "@/content/free-tools";
import { SITE, breadcrumbSchema, faqSchema, itemListSchema, jsonLd } from "@/lib/seo/schema";
import Link from "next/link";

export const metadata = {
  title: "Free PLC, CAD and SCADA software you can use in a browser",
  description:
    "Five automation tools that are free with no account, no download, no trial period and no tag limit: a ladder editor with a real PLC simulator, an HMI and SCADA builder, CAD for panels and schematics, a converter to Structured Text and SCL, and seventeen project document templates.",
  alternates: { canonical: `${SITE.url}/free` },
  openGraph: {
    type: "website",
    url: `${SITE.url}/free`,
    title: "Free PLC, CAD and SCADA software, in a browser",
    description:
      "No account, no download, no trial period, no tag limit. Tools that open and work.",
  },
};

const FAQ = [
  {
    q: "Is this actually free, or is it a trial?",
    a: "Free with no time limit. There is no trial period, no watermark, no tag count and no export paywall on any of these. An account adds somewhere central to keep work and AI generation, which needs a provider key that belongs to a person.",
  },
  {
    q: "Do I need to download or install anything?",
    a: "No. They all run in the browser. Work is saved in the browser, which means clearing your site data clears it, so export anything you want to keep. There is also a desktop build for sites that will not allow a cloud tool at all.",
  },
  {
    q: "What is the catch?",
    a: "Two honest ones. Anything using a model needs a provider key you supply, because there is no shared inference key and no metering here. And none of these download to a controller: they design, simulate and document, and putting logic on hardware is a deliberate act with the vendor's own tools. The HMI does export a panel that runs, but as one HTML file for a browser rather than as a vendor panel project.",
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
 * a real machine has. That is the question this audience is actually asking, so
 * the page answers it in a column rather than burying it.
 *
 * Arranged by what somebody is trying to do rather than as a flat list of
 * product names, and from the same data the header menu reads. A page and a
 * menu with separate lists fail in one specific way, every time: something gets
 * added to one of them.
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
            items: FREE_TOOLS.map((t) => ({
              name: t.title,
              description: t.what,
              path: t.href,
            })),
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

      <header className="mb-10 max-w-2xl">
        <p className="mb-3 font-mono font-semibold text-[11.5px] text-ink-400 uppercase tracking-[0.18em]">
          No account, no download
        </p>
        <h1 className="font-display font-extrabold text-[2.4rem] text-ink-900 leading-[1.05] tracking-[-0.02em]">
          Free PLC, CAD and SCADA software, in a browser
        </h1>
        <p className="mt-5 border-teal-600 border-l-2 pl-5 text-[17px] text-ink-800 leading-relaxed">
          A ladder editor with a scan-accurate PLC simulator, an HMI and SCADA builder with no tag
          limit, CAD for panel drawings and schematics, a converter to Structured Text and SCL, and
          the documents a project is handed over with. No sign-up, no installer, no trial period,
          nothing that expires.
        </p>
      </header>

      {/* The contents, so the shape of the page is visible before scrolling it.
          The group labels are paragraphs rather than headings: they repeat the
          section headings word for word further down, and a document with each
          of its H2s twice reads as two of everything to anything parsing it. */}
      <nav aria-label="On this page" className="mb-14 grid gap-px bg-ink-100 sm:grid-cols-3">
        {FREE_GROUP_ORDER.map((g) => (
          <div key={g} className="bg-white p-4">
            <p className="font-mono font-semibold text-[10.5px] text-ink-400 uppercase tracking-[0.14em]">
              {FREE_GROUP_META[g].title}
            </p>
            <ul className="mt-2 space-y-1">
              {freeToolsIn(g).map((t) => (
                <li key={t.name}>
                  <a
                    href={`#${slug(t.name)}`}
                    className="font-display font-bold text-[14.5px] text-ink-900 hover:text-teal-700"
                  >
                    {t.name}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <section className="mb-14">
        <h2 className="mb-2 font-display font-bold text-[1.3rem] text-ink-900 tracking-[-0.012em]">
          What "free" usually means in this industry
        </h2>
        <p className="text-[15.5px] text-ink-600 leading-relaxed">
          It is worth being specific, because the word is doing a lot of different jobs. Some tools
          are free forever and open source. Some are thirty day trials. Some give you a free editor
          and a runtime that stops after two hours. Some are free up to a tag count chosen to sit
          just below what a real machine needs. Some are free for personal use and licensed the
          moment the drawing is for a client.
        </p>
        <p className="mt-3 text-[15.5px] text-ink-600 leading-relaxed">
          All of those are legitimate. The problem is finding out which one you have after an
          evening's work. So here is which one this is, per tool, including what an account adds.
        </p>
      </section>

      {FREE_GROUP_ORDER.map((g) => (
        <section key={g} className="mb-14">
          <div className="mb-1 flex flex-wrap items-baseline gap-x-4">
            <h2 className="font-display font-bold text-[1.5rem] text-ink-900 tracking-[-0.015em]">
              {FREE_GROUP_META[g].title}
            </h2>
            <p className="text-[14px] text-ink-500">{FREE_GROUP_META[g].blurb}</p>
          </div>

          <ul className="space-y-px">
            {freeToolsIn(g).map((t) => (
              <li
                key={t.name}
                id={slug(t.name)}
                className="scroll-mt-24 border-ink-100 border-b py-7 first:border-t"
              >
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  <h3 className="font-display font-bold text-[1.3rem] text-ink-900 tracking-[-0.012em]">
                    <Link href={t.href} className="hover:text-teal-700">
                      {t.title}
                    </Link>
                  </h3>
                  {t.query && <span className="font-mono text-[11px] text-ink-400">{t.query}</span>}
                </div>

                <p className="mt-2.5 max-w-2xl text-[15px] text-ink-600 leading-relaxed">
                  {t.what}
                </p>

                {/* The free-versus-account columns only where the question
                    arises. The writing and the forum have no account tier, and
                    a column saying so would be noise pretending to be an
                    answer. */}
                {t.free && (
                  <dl className="mt-4 grid gap-x-8 gap-y-2 sm:grid-cols-2">
                    <div>
                      <dt className="font-mono text-[10.5px] text-teal-700 uppercase tracking-[0.1em]">
                        Free
                      </dt>
                      <dd className="mt-1 text-[14px] text-ink-600 leading-relaxed">{t.free}</dd>
                    </div>
                    <div>
                      <dt className="font-mono text-[10.5px] text-ink-400 uppercase tracking-[0.1em]">
                        An account adds
                      </dt>
                      <dd className="mt-1 text-[14px] text-ink-500 leading-relaxed">{t.account}</dd>
                    </div>
                  </dl>
                )}

                <Link
                  href={t.href}
                  className="mt-4 inline-block rounded-sm bg-ink-900 px-4 py-2 font-semibold text-[14px] text-white hover:opacity-90"
                >
                  {t.free ? "Open it" : "Read it"}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <section className="mb-14">
        <h2 className="mb-4 font-display font-bold text-[1.3rem] text-ink-900 tracking-[-0.012em]">
          Questions
        </h2>
        <dl className="space-y-7">
          {FAQ.map((item) => (
            <div key={item.q}>
              <dt className="font-semibold text-[16px] text-ink-900 leading-snug">{item.q}</dt>
              <dd className="mt-2 max-w-2xl text-[15px] text-ink-600 leading-relaxed">{item.a}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="rounded-sm border border-ink-200 bg-ink-50/60 p-6">
        <h2 className="font-display font-bold text-[1.1rem] text-ink-900">
          And what an account is for
        </h2>
        <p className="mt-2 max-w-2xl text-[15px] text-ink-600 leading-relaxed">
          The {FREE_SOFTWARE.length} tools above keep their work in this browser, which means
          clearing your site data clears it. An account puts them all against one project, so a
          drawing, a program and a screen are the same job rather than three files, and adds
          generation from a description, which needs a provider key that belongs to somebody.
        </p>
        <div className="mt-4 flex flex-wrap gap-4 text-[14px]">
          <Link href="/products" className="font-semibold text-teal-700 underline">
            Everything, including what needs an account
          </Link>
          <Link href="/sign-up" className="font-semibold text-teal-700 underline">
            Make one
          </Link>
        </div>
      </div>
    </div>
  );
}

/** An anchor from a tool name, so the contents can link into the page. */
function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
