import { Eyebrow, Sq } from "@/components/site/squares";
import { CATEGORIES, getCategory } from "@/lib/forum/categories";
import { listThreads } from "@/lib/forum/queries";
import { SITE, breadcrumbSchema, jsonLd } from "@/lib/seo/schema";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ThreadRow } from "../../thread-row";

export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return CATEGORIES.map((c) => ({ category: c.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ category: string }> }) {
  const { category } = await params;
  const c = getCategory(category);
  if (!c) return { title: "Not found" };
  return {
    title: `${c.name}, forum`,
    description: c.blurb,
    alternates: { canonical: `${SITE.url}/forum/c/${c.slug}` },
  };
}

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category } = await params;
  const c = getCategory(category);
  if (!c) notFound();

  const threads = await listThreads({ category: c.slug });

  return (
    <>
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD must be inline for crawlers that do not run scripts.
        dangerouslySetInnerHTML={jsonLd(
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Forum", path: "/forum" },
            { name: c.name, path: `/forum/c/${c.slug}` },
          ]),
        )}
      />
      <div className="mx-auto max-w-4xl px-5 py-12">
        <nav className="mb-8 font-mono text-[11.5px] text-ink-400">
          <Link href="/forum" className="transition-colors hover:text-ink-700">
            Forum
          </Link>
        </nav>

        <header className="mb-10 flex flex-wrap items-end justify-between gap-5 border-b border-ink-200 pb-6">
          <div className="max-w-xl">
            <Eyebrow>Category</Eyebrow>
            <h1 className="font-display text-[2rem] font-extrabold leading-[1.06] tracking-[-0.02em] text-ink-900">
              {c.name}
            </h1>
            <p className="mt-3 text-[15.5px] leading-relaxed text-ink-600">{c.blurb}</p>
          </div>
          <Link
            href={`/forum/new?category=${c.slug}`}
            className="rounded-sm bg-ink-900 px-4 py-2 text-[13.5px] font-medium text-white transition-opacity hover:opacity-90"
          >
            Start a thread
          </Link>
        </header>

        {threads.length === 0 ? (
          <div>
            <p className="mb-6 text-[15px] leading-relaxed text-ink-600">
              Nothing in this category yet. These are the questions that come up most often here.
            </p>
            <ul className="space-y-2">
              {c.prompts.map((p) => (
                <li key={p}>
                  <Link
                    href={`/forum/new?category=${c.slug}`}
                    className="flex items-start gap-2.5 text-[14.5px] leading-relaxed text-ink-600 transition-colors hover:text-teal-700"
                  >
                    <Sq size={5} className="mt-[8px] shrink-0 text-ink-300" />
                    {p}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <ul className="divide-y divide-ink-100">
            {threads.map((t) => (
              <ThreadRow key={t.id} thread={t} />
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
