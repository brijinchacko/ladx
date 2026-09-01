import { Eyebrow, Sq } from "@/components/site/squares";
import { SITE, breadcrumbSchema, jsonLd } from "@/lib/seo/schema";
import { TEMPLATES, getTemplate } from "@ladx/documents";
import Link from "next/link";
import { notFound } from "next/navigation";
import DownloadForm from "./download-form";

export function generateStaticParams() {
  return TEMPLATES.map((t) => ({ slug: t.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const t = getTemplate(slug);
  if (!t) return { title: "Not found" };
  return {
    title: `${t.title} template (${t.abbr}), free download`,
    description: t.summary,
    alternates: { canonical: `${SITE.url}/documents/${t.slug}` },
  };
}

/**
 * One template: what it is for, what is in it, and the file itself.
 *
 * The preview is the whole document rather than an excerpt. Somebody deciding
 * whether this is worth downloading should be able to read it first, and a
 * teaser that hides the useful half is the pattern this page exists to avoid.
 */
export default async function TemplatePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const t = getTemplate(slug);
  if (!t) notFound();

  const related = (t.related ?? [])
    .map((s) => getTemplate(s))
    .filter((x): x is NonNullable<typeof x> => Boolean(x));

  return (
    <>
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD must be inline for crawlers that do not run scripts.
        dangerouslySetInnerHTML={jsonLd(
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Documents", path: "/documents" },
            { name: t.abbr, path: `/documents/${t.slug}` },
          ]),
        )}
      />

      <div className="mx-auto max-w-6xl px-5 py-12">
        <nav className="mb-8 flex items-center gap-2 font-mono text-[11.5px] text-ink-400">
          <Link href="/documents" className="transition-colors hover:text-ink-700">
            Documents
          </Link>
          <span aria-hidden="true">/</span>
          <span className="text-ink-600">{t.category}</span>
        </nav>

        <div className="grid gap-12 lg:grid-cols-[1fr_360px] lg:items-start">
          <div className="min-w-0">
            <header className="mb-10">
              <Eyebrow>{t.category}</Eyebrow>
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="font-display text-[2.1rem] font-extrabold leading-[1.06] tracking-[-0.02em] text-ink-900">
                  {t.title}
                </h1>
                <span className="bg-ink-900 px-2 py-1 font-mono text-[12px] font-semibold tracking-[0.08em] text-white">
                  {t.abbr}
                </span>
              </div>
              <p className="mt-5 max-w-2xl text-[16px] leading-relaxed text-ink-600">{t.purpose}</p>
            </header>

            <section className="mb-10 border-l-2 border-teal-600 py-1 pl-5">
              <h2 className="font-display text-[15px] font-bold text-ink-900">
                Do you need this one?
              </h2>
              <p className="mt-2 max-w-2xl text-[14.5px] leading-relaxed text-ink-600">
                {t.whenYouNeedIt}
              </p>
            </section>

            <section className="mb-10">
              <h2 className="mb-4 border-b border-ink-200 pb-2 font-display text-[1.15rem] font-bold tracking-[-0.012em] text-ink-900">
                What is in it
              </h2>
              <ol className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
                {t.outline.map((section, i) => (
                  <li
                    key={section}
                    className="flex items-baseline gap-3 text-[14.5px] text-ink-700"
                  >
                    <span className="font-mono text-[11px] tabular-nums text-ink-400">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    {section}
                  </li>
                ))}
              </ol>
            </section>

            <section className="mb-10 grid gap-6 border-y border-ink-100 py-6 sm:grid-cols-2">
              <div>
                <h3 className="mb-1 font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-400">
                  Written by
                </h3>
                <p className="text-[14.5px] text-ink-700">{t.writtenBy}</p>
              </div>
              <div>
                <h3 className="mb-1 font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-400">
                  Approved by
                </h3>
                <p className="text-[14.5px] text-ink-700">{t.approvedBy}</p>
              </div>
              {t.standards?.length ? (
                <div className="sm:col-span-2">
                  <h3 className="mb-1.5 font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-400">
                    Written against
                  </h3>
                  <ul className="flex flex-wrap gap-2">
                    {t.standards.map((s) => (
                      <li
                        key={s}
                        className="border border-ink-200 px-2 py-1 font-mono text-[11.5px] text-ink-600"
                      >
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </section>

            <section className="mb-10">
              <h2 className="mb-4 border-b border-ink-200 pb-2 font-display text-[1.15rem] font-bold tracking-[-0.012em] text-ink-900">
                Preview
              </h2>
              {t.files.map((file) => (
                <figure key={file.name} className="mb-6">
                  <figcaption className="mb-2 flex flex-wrap items-baseline gap-3">
                    <span className="font-mono text-[12.5px] font-semibold text-ink-800">
                      {file.name}
                    </span>
                    {file.note && <span className="text-[13px] text-ink-500">{file.note}</span>}
                  </figcaption>
                  <div className="max-h-[420px] overflow-auto border border-ink-200 bg-ink-50">
                    <pre className="p-4 font-mono text-[11.5px] leading-relaxed text-ink-700">
                      {file.body}
                    </pre>
                  </div>
                </figure>
              ))}
            </section>

            {related.length > 0 && (
              <section>
                <h2 className="mb-4 border-b border-ink-200 pb-2 font-display text-[1.15rem] font-bold tracking-[-0.012em] text-ink-900">
                  Travels with
                </h2>
                <ul className="grid gap-3 sm:grid-cols-2">
                  {related.map((r) => (
                    <li key={r.slug}>
                      <Link
                        href={`/documents/${r.slug}`}
                        className="group flex items-start gap-3 border border-ink-200 p-3.5 transition-colors hover:border-ink-400"
                      >
                        <span className="mt-[3px] shrink-0 bg-ink-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-ink-600">
                          {r.abbr}
                        </span>
                        <span>
                          <span className="block font-display text-[14px] font-bold text-ink-900 group-hover:text-teal-700">
                            {r.title}
                          </span>
                          <span className="mt-0.5 block text-[13px] leading-relaxed text-ink-500">
                            {r.summary}
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>

          <aside className="lg:sticky lg:top-24">
            <DownloadForm slug={t.slug} files={t.files} />
            <p className="mt-4 flex items-start gap-2 text-[12.5px] leading-relaxed text-ink-400">
              <Sq size={5} className="mt-[6px] shrink-0" />
              Markdown opens in any editor and converts to Word or PDF with Pandoc. CSV opens in
              Excel, Sheets or LibreOffice.
            </p>
          </aside>
        </div>
      </div>
    </>
  );
}
