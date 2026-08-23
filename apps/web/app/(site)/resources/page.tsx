import { ArticleFigure } from "@/components/site/figures";
import { sortedPosts } from "@/content/posts";
import Link from "next/link";

export const metadata = {
  title: "Resources",
  description:
    "Articles on PLC programming, ladder logic and where AI genuinely helps in industrial automation, written for people who program machines.",
};

export default function ResourcesPage() {
  const posts = sortedPosts();
  const [lead, ...rest] = posts;

  return (
    <div className="mx-auto max-w-6xl px-5 py-16">
      <header className="mb-14 max-w-2xl">
        <p className="mb-3 font-mono text-[11.5px] font-semibold uppercase tracking-[0.18em] text-ink-400">
          Resources
        </p>
        <h1 className="font-display text-[2.4rem] font-extrabold leading-[1.05] tracking-[-0.02em] text-ink-900">
          Writing for people who program machines
        </h1>
        <p className="mt-5 text-[16px] leading-relaxed text-ink-600">
          Half of this is the fundamentals, scan cycles, timers, analog scaling, because those are
          the questions that actually get asked, every week, forever. The other half is what AI is
          and isn't doing in this industry, written by people who have to make it work rather than
          sell it.
        </p>
      </header>

      {lead && (
        <Link
          href={`/resources/${lead.slug}`}
          className="group mb-16 block border-y border-ink-100 py-10 transition-colors hover:bg-ink-50/50"
        >
          <div className="grid gap-8 lg:grid-cols-[1.1fr_1fr] lg:items-center">
            <div>
              <div className="mb-3 flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.12em]">
                <span className="text-teal-700">{lead.topic}</span>
                <span className="text-ink-300">·</span>
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
            <figure className="rounded-sm border border-ink-100 bg-white p-5">
              <ArticleFigure name={lead.figure} className="w-full text-ink-800" />
            </figure>
          </div>
        </Link>
      )}

      <ul className="grid gap-x-10 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
        {rest.map((post) => (
          <li key={post.slug}>
            <Link href={`/resources/${post.slug}`} className="group block">
              <figure className="mb-4 rounded-sm border border-ink-100 bg-white p-4 transition-colors group-hover:border-ink-200">
                <ArticleFigure name={post.figure} className="h-32 w-full text-ink-800" />
              </figure>
              <div className="mb-2 flex items-center gap-2.5 font-mono text-[10.5px] uppercase tracking-[0.12em]">
                <span className="text-teal-700">{post.topic}</span>
                <span className="text-ink-300">·</span>
                <span className="text-ink-400">{post.minutes} min</span>
              </div>
              <h3 className="font-display text-[1.1rem] font-bold leading-snug tracking-[-0.01em] text-ink-900 group-hover:text-teal-700">
                {post.title}
              </h3>
              <p className="mt-2 text-[14px] leading-relaxed text-ink-500">{post.summary}</p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
