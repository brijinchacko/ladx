import { ArticleFigure } from "@/components/site/figures";
import { Eyebrow } from "@/components/site/squares";
import { POSTS, TOPICS, sortedPosts } from "@/content/posts";
import { SITE } from "@/lib/seo/schema";
import Link from "next/link";

export const metadata = {
  title: "Resources",
  description:
    "Articles on PLC programming, ladder logic, analog scaling, platform differences and where AI genuinely helps in industrial automation. Written for people who program machines.",
  alternates: { canonical: `${SITE.url}/resources` },
};

/**
 * The article index.
 *
 * Grouped by topic rather than presented as one long reverse-chronological
 * list. With fifty articles a flat list buries everything published more than a
 * month ago, and a reader arriving from a search for one specific thing is
 * better served by seeing the cluster it belongs to.
 */
export default function ResourcesPage() {
  const all = sortedPosts();
  const [lead, ...rest] = all;
  const topics = TOPICS.filter((t) => t !== "All");

  return (
    <div className="mx-auto max-w-6xl px-5 py-16">
      <header className="mb-12 max-w-2xl">
        <Eyebrow>Resources</Eyebrow>
        <h1 className="font-display text-[2.4rem] font-extrabold leading-[1.05] tracking-[-0.02em] text-ink-900">
          Writing for people who program machines
        </h1>
        <p className="mt-5 text-[16px] leading-relaxed text-ink-600">
          The fundamentals first: scan cycles, timers, analog scaling, addressing. Those are the
          questions that get asked every week, forever. Then the ground where the answers online get
          thinner, which is where most of a working week actually goes: functional safety, operator
          screens, drives, fieldbus, instrumentation, panel building and the regulated industries.
          And what AI is and is not doing in this trade, written by people who have to make it work
          rather than sell it.
        </p>
        <p className="mt-3 font-mono text-[12.5px] text-ink-400">
          {all.length} articles across {topics.length} topics
        </p>
      </header>

      {/* Topic jump list. Fifty articles need a way in that is not scrolling. */}
      <nav aria-label="Topics" className="mb-14 flex flex-wrap gap-2 border-y border-ink-100 py-4">
        {topics.map((topic) => {
          const count = POSTS.filter((p) => p.topic === topic).length;
          return (
            <a
              key={topic}
              href={`#${slugifyTopic(topic)}`}
              className="flex items-center gap-2 border border-ink-200 px-2.5 py-1.5 text-[13px] text-ink-600 transition-colors hover:border-ink-400 hover:text-ink-900"
            >
              {topic}
              <span className="font-mono text-[10.5px] tabular-nums text-ink-400">{count}</span>
            </a>
          );
        })}
      </nav>

      {lead && (
        <Link
          href={`/resources/${lead.slug}`}
          className="group mb-16 block border-y border-ink-100 py-10 transition-colors hover:bg-ink-50/50"
        >
          <div className="grid gap-8 lg:grid-cols-[1.1fr_1fr] lg:items-center">
            <div>
              <div className="mb-3 flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.12em]">
                <span className="text-teal-700">{lead.topic}</span>
                <span className="text-ink-300">/</span>
                <span className="text-ink-400">{lead.minutes} min</span>
              </div>
              <h2 className="font-display text-[1.8rem] font-bold leading-[1.15] tracking-[-0.015em] text-ink-900 group-hover:text-teal-700">
                {lead.title}
              </h2>
              <p className="mt-3 max-w-xl text-[15.5px] leading-relaxed text-ink-600">
                {lead.summary}
              </p>
              <p className="mt-4 font-mono text-[12px] text-ink-400">Answers: “{lead.intent}”</p>
            </div>
            <figure className="border border-ink-100 bg-white p-5">
              <ArticleFigure name={lead.figure} className="w-full text-ink-800" />
            </figure>
          </div>
        </Link>
      )}

      {topics.map((topic) => {
        const posts = rest.filter((p) => p.topic === topic);
        if (!posts.length) return null;
        return (
          <section key={topic} id={slugifyTopic(topic)} className="mb-16 scroll-mt-24">
            <h2 className="mb-6 flex items-baseline gap-3 border-b border-ink-100 pb-3 font-display text-[1.3rem] font-bold tracking-[-0.012em] text-ink-900">
              {topic}
              <span className="font-mono text-[11px] font-normal tabular-nums text-ink-400">
                {posts.length}
              </span>
            </h2>
            <ul className="grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
              {posts.map((post) => (
                <li key={post.slug}>
                  {/*
                    No figure on the cards. Each one used to inline its whole
                    schematic at 112 pixels tall, which is below the size any
                    of them can be read at, and a hundred of them made this
                    page 2.6 MB. A diagram too small to read is decoration, and
                    decoration that costs two and a half megabytes on the page
                    most likely to be somebody's first is a bad trade. The
                    figure is still on the lead article above, where it is
                    large enough to be worth looking at, and on the article
                    itself.
                  */}
                  <Link
                    href={`/resources/${post.slug}`}
                    className="group block border-l-2 border-ink-100 pl-4 transition-colors hover:border-teal-500"
                  >
                    <h3 className="font-display text-[1.05rem] font-bold leading-snug tracking-[-0.01em] text-ink-900 group-hover:text-teal-700">
                      {post.title}
                    </h3>
                    <p className="mt-2 text-[13.5px] leading-relaxed text-ink-500">
                      {post.summary}
                    </p>
                    <p className="mt-2.5 font-mono text-[11px] leading-snug text-ink-400">
                      {post.intent}
                    </p>
                    <p className="mt-2 font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-300">
                      {post.minutes} min read
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function slugifyTopic(topic: string): string {
  return topic
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
