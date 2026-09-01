import { Eyebrow, GridField, Sq } from "@/components/site/squares";
import { SITE, breadcrumbSchema, faqSchema, jsonLd } from "@/lib/seo/schema";
import {
  CATEGORY_BLURB,
  CATEGORY_ORDER,
  TEMPLATES,
  fileCount,
  templatesByCategory,
} from "@ladx/documents";
import Link from "next/link";

export const metadata = {
  title: "Automation project document templates, free to download",
  description:
    "URS, FDS, I/O list, BOM, cable schedule, cause and effect matrix, FAT and SAT protocols, risk assessment and handover pack. Working templates for control system projects, not empty outlines.",
  alternates: { canonical: `${SITE.url}/documents` },
};

const FAQ = [
  {
    q: "What documents does an automation project need?",
    a: "A full control system project produces a URS, an FDS, an I/O list, a BOM, a cable schedule, a cause and effect matrix, a risk assessment, FAT and SAT protocols, and a handover pack. A small machine build needs three: an FDS, an I/O list and a commissioning checklist.",
  },
  {
    q: "What is the difference between FAT and SAT?",
    a: "A Factory Acceptance Test runs at the integrator's works on simulated I/O, before the panel ships. A Site Acceptance Test runs on the plant with real field devices after installation. The FAT proves the logic, the SAT proves the installation. Neither substitutes for the other.",
  },
  {
    q: "What is the difference between a URS and an FDS?",
    a: "The URS states what the client needs in plant terms and is the client's document. The FDS states how the control system will meet each of those requirements and is the engineer's document. Every FDS section should trace back to a numbered URS requirement.",
  },
  {
    q: "Are these templates free?",
    a: "Yes. Every template downloads without an account, as Markdown or CSV. You can fill in the project details first and the download arrives already populated.",
  },
];

/**
 * The template library.
 *
 * Public and account free. These are the most linkable pages on the site: an
 * engineer searching for "FAT protocol template" wants a file, not a signup
 * form, and a library that delivers one earns the link that a gated one never
 * gets.
 */
export default function DocumentsPage() {
  const total = TEMPLATES.length;
  const files = fileCount();

  return (
    <>
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD must be inline for crawlers that do not run scripts.
        dangerouslySetInnerHTML={jsonLd(faqSchema(FAQ, "/documents"))}
      />
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: as above.
        dangerouslySetInnerHTML={jsonLd(
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Documents", path: "/documents" },
          ]),
        )}
      />

      <section className="relative border-b border-ink-100">
        <GridField />
        <div className="relative mx-auto max-w-6xl px-5 py-16">
          <div className="max-w-2xl">
            <Eyebrow>Documents</Eyebrow>
            <h1 className="font-display text-[2.5rem] font-extrabold leading-[1.04] tracking-[-0.02em] text-ink-900">
              The paperwork a control system project actually produces
            </h1>
            <p className="mt-5 text-[16.5px] leading-relaxed text-ink-600">
              {total} templates covering the full project, from the requirement the client writes to
              the pack the site keeps afterwards. These are working documents with the tables, the
              acceptance criteria and the sign-off blocks already in them, not outlines with empty
              headings.
            </p>
            <p className="mt-4 text-[15px] leading-relaxed text-ink-500">
              Free, no account. Fill in your project details on any template and the download
              arrives already populated.
            </p>
            <p className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[12px] text-ink-400">
              <span className="flex items-center gap-2">
                <Sq size={6} /> {total} templates
              </span>
              <span className="flex items-center gap-2">
                <Sq size={6} /> {files} files
              </span>
              <span className="flex items-center gap-2">
                <Sq size={6} /> Markdown and CSV
              </span>
            </p>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-5 py-14">
        {/* Which ones do I actually need. The question everybody has first. */}
        <section className="mb-16 border border-ink-200 bg-ink-50/50 p-6 sm:p-8">
          <h2 className="font-display text-[1.25rem] font-bold tracking-[-0.012em] text-ink-900">
            Which of these do I actually need?
          </h2>
          <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-ink-600">
            Not all of them, on most jobs. Scale the set to the work.
          </p>
          <div className="mt-6 grid gap-6 sm:grid-cols-3">
            {[
              {
                scale: "Small machine build",
                count: "3 documents",
                list: ["FDS", "I/O list", "Commissioning checklist"],
              },
              {
                scale: "Mid-size project",
                count: "8 documents",
                list: [
                  "URS",
                  "FDS",
                  "I/O list",
                  "BOM",
                  "Cause and effect",
                  "Risk assessment",
                  "FAT",
                  "SAT",
                ],
              },
              {
                scale: "Regulated or process plant",
                count: "The full set",
                list: [
                  "Everything, with traceability",
                  "Alarm rationalisation",
                  "Change control from day one",
                ],
              },
            ].map((tier) => (
              <div key={tier.scale} className="border-t-2 border-ink-900 pt-4">
                <h3 className="font-display text-[15px] font-bold text-ink-900">{tier.scale}</h3>
                <p className="mt-1 font-mono text-[11.5px] uppercase tracking-[0.1em] text-teal-700">
                  {tier.count}
                </p>
                <ul className="mt-3 space-y-1.5">
                  {tier.list.map((item) => (
                    <li
                      key={item}
                      className="flex items-start gap-2 text-[13.5px] leading-relaxed text-ink-600"
                    >
                      <Sq size={5} className="mt-[7px] text-ink-400" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {CATEGORY_ORDER.map((category) => {
          const items = templatesByCategory(category);
          if (!items.length) return null;
          return (
            <section key={category} className="mb-14">
              <div className="mb-6 flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-ink-200 pb-3">
                <h2 className="font-display text-[1.3rem] font-bold tracking-[-0.012em] text-ink-900">
                  {category}
                </h2>
                <p className="text-[14px] text-ink-500">{CATEGORY_BLURB[category]}</p>
                <span className="ml-auto font-mono text-[11px] tabular-nums text-ink-400">
                  {items.length}
                </span>
              </div>

              <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((t) => (
                  <li key={t.slug}>
                    <Link
                      href={`/documents/${t.slug}`}
                      className="group flex h-full flex-col border border-ink-200 bg-white p-5 transition-colors hover:border-ink-400"
                    >
                      <div className="mb-3 flex items-center gap-2.5">
                        <span className="bg-ink-900 px-1.5 py-0.5 font-mono text-[10.5px] font-semibold tracking-[0.08em] text-white">
                          {t.abbr}
                        </span>
                        <span className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-400">
                          {t.files.length === 1 ? "1 file" : `${t.files.length} files`}
                        </span>
                      </div>
                      <h3 className="font-display text-[15.5px] font-bold leading-snug tracking-[-0.01em] text-ink-900 group-hover:text-teal-700">
                        {t.title}
                      </h3>
                      <p className="mt-2 flex-1 text-[13.5px] leading-relaxed text-ink-600">
                        {t.summary}
                      </p>
                      <p className="mt-4 font-mono text-[11px] text-ink-400 group-hover:text-ink-700">
                        Preview and download
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}

        <section className="mt-20 border-t border-ink-200 pt-12">
          <h2 className="font-display text-[1.4rem] font-bold tracking-[-0.015em] text-ink-900">
            Common questions
          </h2>
          <dl className="mt-7 grid gap-x-12 gap-y-8 sm:grid-cols-2">
            {FAQ.map((item) => (
              <div key={item.q}>
                <dt className="font-display text-[15.5px] font-bold leading-snug text-ink-900">
                  {item.q}
                </dt>
                <dd className="mt-2 text-[14.5px] leading-relaxed text-ink-600">{item.a}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </>
  );
}
