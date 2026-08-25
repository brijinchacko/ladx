import { ArticleFigure } from "@/components/site/figures";
import { POSTS, getPost, sortedPosts } from "@/content/posts";
import { ctaFor } from "@/lib/seo/article-cta";
import { SITE, articleSchema, breadcrumbSchema, faqSchema, jsonLd } from "@/lib/seo/schema";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

export function generateStaticParams() {
  return POSTS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) return { title: "Not found" };
  const url = `${SITE.url}/resources/${post.slug}`;
  return {
    title: post.title,
    description: post.summary,
    keywords: post.about,
    // A canonical on every article, because the same content reachable at two
    // URLs splits its own authority and answer engines pick one arbitrarily.
    alternates: { canonical: url },
    openGraph: {
      title: post.title,
      description: post.summary,
      type: "article",
      url,
      publishedTime: post.published,
      modifiedTime: post.updated ?? post.published,
      section: post.topic,
      images: [{ url: `/og/resources/${post.slug}`, width: 1200, height: 630, alt: post.title }],
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description: post.summary,
      images: [`/og/resources/${post.slug}`],
    },
  };
}

/**
 * Renders the tiny subset of markup the articles use.
 *
 * Deliberately not a markdown library: the articles are authored as an array of
 * strings in one typed file, so the only syntax that exists is the syntax used
 * here. Adding a parser would add a dependency, a build step and a class of
 * bugs, in exchange for features nothing is asking for.
 */
function Body({ lines }: { lines: string[] }) {
  const blocks: React.ReactNode[] = [];
  let list: string[] = [];

  const flushList = (key: string) => {
    if (!list.length) return;
    blocks.push(
      <ul key={key} className="my-5 space-y-2.5 pl-5">
        {list.map((item) => (
          <li
            key={item}
            className="list-disc text-[16.5px] leading-[1.7] text-ink-700 marker:text-teal-600"
          >
            <Inline text={item} />
          </li>
        ))}
      </ul>,
    );
    list = [];
  };

  lines.forEach((line, i) => {
    const key = `${i}-${line.slice(0, 24)}`;
    if (line.startsWith("- ")) {
      list.push(line.slice(2));
      return;
    }
    flushList(`list-${i}`);

    if (line.startsWith("## ")) {
      blocks.push(
        <h2
          key={key}
          className="mt-11 mb-3 font-display text-[1.35rem] font-bold tracking-[-0.012em] text-ink-900"
        >
          {line.slice(3)}
        </h2>,
      );
    } else if (line.startsWith("> ")) {
      blocks.push(
        <blockquote
          key={key}
          className="my-7 border-l-2 border-teal-500 bg-teal-50/40 py-4 pl-5 pr-4 text-[16px] leading-relaxed text-ink-800"
        >
          <Inline text={line.slice(2)} />
        </blockquote>,
      );
    } else {
      blocks.push(
        <p key={key} className="my-4 text-[16.5px] leading-[1.72] text-ink-700">
          <Inline text={line} />
        </p>,
      );
    }
  });
  flushList("list-end");

  return <>{blocks}</>;
}

/** `**bold**` and `` `code` ``, nothing else. */
function Inline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return (
    <>
      {parts.map((part, i) => {
        const key = `${i}-${part}`;
        if (part.startsWith("**") && part.endsWith("**")) {
          return (
            <strong key={key} className="font-semibold text-ink-900">
              {part.slice(2, -2)}
            </strong>
          );
        }
        if (part.startsWith("`") && part.endsWith("`")) {
          return (
            <code
              key={key}
              className="rounded-sm bg-ink-50 px-1.5 py-0.5 font-mono text-[14px] text-ink-800"
            >
              {part.slice(1, -1)}
            </code>
          );
        }
        return part;
      })}
    </>
  );
}

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();

  const cta = ctaFor(post.topic);

  const others = sortedPosts()
    .filter((p) => p.slug !== post.slug)
    .slice(0, 3);

  const date = new Date(post.published).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const url = `/resources/${post.slug}`;

  return (
    <article>
      {/* Structured data, server rendered. ChatGPT's crawler parses HTML only
          and does not run JavaScript, so anything added on the client is
          invisible to it. */}
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD has no other injection point
        dangerouslySetInnerHTML={jsonLd(articleSchema(post))}
      />
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: as above
        dangerouslySetInnerHTML={jsonLd(
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Resources", path: "/resources" },
            { name: post.title, path: url },
          ]),
        )}
      />
      {post.faq?.length ? (
        <script
          type="application/ld+json"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: as above
          dangerouslySetInnerHTML={jsonLd(faqSchema(post.faq, url))}
        />
      ) : null}

      <div className="mx-auto max-w-3xl px-5 pt-14">
        <Link
          href="/resources"
          className="mb-8 inline-block font-mono text-[12px] text-ink-400 hover:text-ink-700"
        >
          ← Resources
        </Link>

        <div className="mb-4 flex flex-wrap items-center gap-3 font-mono text-[11.5px] uppercase tracking-[0.12em]">
          <span className="text-teal-700">{post.topic}</span>
          <span className="text-ink-300">·</span>
          <span className="text-ink-400">{post.minutes} min read</span>
          <span className="text-ink-300">·</span>
          <time className="text-ink-400" dateTime={post.published}>
            {date}
          </time>
        </div>

        <h1 className="font-display text-[2.3rem] font-extrabold leading-[1.08] tracking-[-0.022em] text-ink-900">
          {post.title}
        </h1>
        <p className="mt-5 text-[17.5px] leading-relaxed text-ink-600">{post.summary}</p>

        {/* The direct answer, first and self-contained. Retrieval selects
            passages rather than pages, and this is the passage. */}
        <div className="mt-8 border-l-2 border-teal-500 bg-teal-50/40 py-4 pl-5 pr-4">
          <p className="mb-1.5 font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-teal-700">
            Short answer
          </p>
          <p className="text-[16.5px] leading-relaxed text-ink-800">{post.answer}</p>
        </div>
      </div>

      <figure className="mx-auto my-11 max-w-4xl px-5">
        <div className="rounded-sm border border-ink-100 bg-white p-7">
          <ArticleFigure name={post.figure} className="w-full text-ink-800" />
        </div>
      </figure>

      <div className="mx-auto max-w-3xl px-5">
        <Body lines={post.body} />

        {post.faq?.length ? (
          <section className="mt-14 border-t border-ink-100 pt-10">
            <h2 className="mb-6 font-display text-[1.35rem] font-bold tracking-[-0.012em] text-ink-900">
              Common questions
            </h2>
            <dl className="divide-y divide-ink-100 border-y border-ink-100">
              {post.faq.map((item) => (
                <div key={item.q} className="py-5">
                  <dt className="mb-2 text-[16px] font-semibold leading-snug text-ink-900">
                    {item.q}
                  </dt>
                  <dd className="text-[15.5px] leading-relaxed text-ink-600">{item.a}</dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null}

        {/*
          Chosen by topic. Every article used to offer the ladder editor,
          including the ones about alarm rationalisation and GAMP 5, which is
          an offer that does not follow from what was just read. It also meant
          a hundred articles linked to one page and told a search engine
          nothing about which of them were about what.
        */}
        <aside className="mt-14 rounded-sm border border-ink-200 bg-ink-50/60 p-6">
          <h2 className="mb-2 font-display text-[1.1rem] font-bold text-ink-900">{cta.heading}</h2>
          <p className="mb-4 text-[15px] leading-relaxed text-ink-600">{cta.body}</p>
          <Link
            href={cta.href}
            className="inline-block rounded-sm bg-ink-900 px-4 py-2 text-[14px] font-semibold text-white hover:opacity-90"
          >
            {cta.label}
          </Link>
        </aside>
      </div>

      <section className="mx-auto mt-20 max-w-6xl border-t border-ink-100 px-5 pt-12">
        <h2 className="mb-8 font-mono text-[11.5px] font-semibold uppercase tracking-[0.16em] text-ink-400">
          Keep reading
        </h2>
        <ul className="grid gap-8 sm:grid-cols-3">
          {others.map((p) => (
            <li key={p.slug}>
              <Link href={`/resources/${p.slug}`} className="group block">
                <span className="mb-2 block font-mono text-[10.5px] uppercase tracking-[0.12em] text-teal-700">
                  {p.topic}
                </span>
                <h3 className="font-display text-[1.05rem] font-bold leading-snug text-ink-900 group-hover:text-teal-700">
                  {p.title}
                </h3>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-500">{p.summary}</p>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </article>
  );
}
