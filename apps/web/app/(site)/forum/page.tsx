import { Eyebrow, GridField, Sq } from "@/components/site/squares";
import { CATEGORIES } from "@/lib/forum/categories";
import { countByCategory, listThreads } from "@/lib/forum/queries";
import { SITE } from "@/lib/seo/schema";
import Link from "next/link";
import { ThreadRow } from "./thread-row";

export const metadata = {
  title: "Forum, technical discussion for automation engineers",
  description:
    "Ask and answer questions about ladder logic, PLC platforms, migrations, HMI, safety standards and commissioning. Open to read, free to join.",
  alternates: { canonical: `${SITE.url}/forum` },
};

// Threads change as people post, so this page is rendered per request rather
// than baked at build time.
export const dynamic = "force-dynamic";

export default async function ForumPage() {
  const [recent, counts] = await Promise.all([listThreads({ limit: 12 }), countByCategory()]);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <>
      <section className="relative border-b border-ink-100">
        <GridField />
        <div className="relative mx-auto max-w-6xl px-5 py-14">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div className="max-w-2xl">
              <Eyebrow>Forum</Eyebrow>
              <h1 className="font-display text-[2.4rem] font-extrabold leading-[1.05] tracking-[-0.02em] text-ink-900">
                Ask the people who have hit it before
              </h1>
              <p className="mt-5 text-[16px] leading-relaxed text-ink-600">
                A technical forum for people who program machines. Open to read without an account.
                Post a question, answer one, and mark what actually worked so the next person
                searching finds it.
              </p>
            </div>
            <Link
              href="/forum/new"
              className="rounded-sm bg-ink-900 px-5 py-2.5 text-[14px] font-medium text-white transition-opacity hover:opacity-90"
            >
              Start a thread
            </Link>
          </div>
          <p className="mt-6 flex items-center gap-2 font-mono text-[12px] text-ink-400">
            <Sq size={6} />
            {total === 0
              ? "No threads yet. The first one is yours."
              : `${total} ${total === 1 ? "thread" : "threads"} across ${CATEGORIES.length} categories`}
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-5 py-12">
        <div className="grid gap-12 lg:grid-cols-[1fr_300px] lg:items-start">
          <div className="min-w-0">
            <h2 className="mb-5 border-b border-ink-200 pb-2 font-display text-[1.2rem] font-bold tracking-[-0.012em] text-ink-900">
              {recent.length ? "Recent activity" : "Nothing posted yet"}
            </h2>

            {recent.length === 0 ? (
              <EmptyState />
            ) : (
              <ul className="divide-y divide-ink-100">
                {recent.map((t) => (
                  <ThreadRow key={t.id} thread={t} showCategory />
                ))}
              </ul>
            )}
          </div>

          <aside>
            <h2 className="mb-4 font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-400">
              Categories
            </h2>
            <ul className="space-y-px">
              {CATEGORIES.map((c) => (
                <li key={c.slug}>
                  <Link
                    href={`/forum/c/${c.slug}`}
                    className="group block border border-transparent px-3 py-2.5 transition-colors hover:border-ink-200 hover:bg-ink-50/60"
                  >
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="font-display text-[14px] font-bold text-ink-900 group-hover:text-teal-700">
                        {c.name}
                      </span>
                      <span className="font-mono text-[11px] tabular-nums text-ink-400">
                        {counts[c.slug] ?? 0}
                      </span>
                    </span>
                    <span className="mt-0.5 block text-[12.5px] leading-relaxed text-ink-500">
                      {c.blurb}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>

            <div className="mt-8 border-t border-ink-100 pt-5">
              <h2 className="mb-2 font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-400">
                House rules
              </h2>
              <ul className="space-y-2 text-[12.5px] leading-relaxed text-ink-500">
                {[
                  "Say which platform and version. Half the answers depend on it.",
                  "Post the rung, not a description of the rung.",
                  "Mark the reply that worked, for whoever searches next.",
                  "No safety bypasses. Ask how to do it properly instead.",
                ].map((rule) => (
                  <li key={rule} className="flex items-start gap-2">
                    <Sq size={5} className="mt-[6px] shrink-0 text-ink-400" />
                    {rule}
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}

/**
 * What an empty forum shows.
 *
 * Real prompts rather than invented threads with fake reply counts. A new forum
 * seeded with posts from people who do not exist is the fastest way to lose the
 * trust of an audience that checks things for a living.
 */
function EmptyState() {
  return (
    <div>
      <p className="mb-8 max-w-xl text-[15px] leading-relaxed text-ink-600">
        This forum is new and nobody has posted yet. Below are the questions that get asked
        repeatedly in this field. They are prompts, not threads: pick one, or bring your own.
      </p>
      <div className="grid gap-6 sm:grid-cols-2">
        {CATEGORIES.slice(0, 4).map((c) => (
          <div key={c.slug} className="border-t-2 border-ink-900 pt-3">
            <h3 className="font-display text-[14.5px] font-bold text-ink-900">{c.name}</h3>
            <ul className="mt-2.5 space-y-1.5">
              {c.prompts.slice(0, 3).map((p) => (
                <li key={p}>
                  <Link
                    href={`/forum/new?category=${c.slug}`}
                    className="flex items-start gap-2 text-[13.5px] leading-relaxed text-ink-600 transition-colors hover:text-teal-700"
                  >
                    <Sq size={5} className="mt-[7px] shrink-0 text-ink-400" />
                    {p}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
