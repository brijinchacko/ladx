import ReplyBox, { AnswerToggle } from "@/components/forum/reply-box";
import { Sq } from "@/components/site/squares";
import { getCurrentUser } from "@/lib/auth/server";
import { getCategory } from "@/lib/forum/categories";
import { getThread, listPosts } from "@/lib/forum/queries";
import { SITE, breadcrumbSchema, jsonLd } from "@/lib/seo/schema";
import Link from "next/link";
import { notFound } from "next/navigation";
import { timeAgo } from "../../thread-row";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const thread = await getThread(slug);
  if (!thread) return { title: "Thread not found" };
  return {
    title: thread.title,
    description: thread.excerpt,
    alternates: { canonical: `${SITE.url}/forum/t/${thread.slug}` },
  };
}

/**
 * One thread.
 *
 * The answered reply is pulled to the top as well as being marked in place.
 * Somebody arriving from a search wants the answer, not a chronological account
 * of how it was found, and scrolling a long thread to look for a green tick is
 * the tax that forums usually charge for that.
 */
export default async function ThreadPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const thread = await getThread(slug);
  if (!thread) notFound();

  const [posts, user] = await Promise.all([
    listPosts(thread.id, thread.answerPostId),
    getCurrentUser(),
  ]);

  const category = getCategory(thread.category);
  const isAuthor = user?.id === thread.authorId;
  const answer = posts.find((p) => p.isAnswer && !p.deleted);

  // A discussion forum page maps onto schema.org's DiscussionForumPosting, and
  // that is what lets an answer engine quote the accepted reply rather than the
  // question. Worth emitting properly given the whole point of marking an
  // answer is to help whoever searches next.
  const discussionSchema = {
    "@context": "https://schema.org",
    "@type": "DiscussionForumPosting",
    "@id": `${SITE.url}/forum/t/${thread.slug}#thread`,
    headline: thread.title,
    text: thread.body,
    url: `${SITE.url}/forum/t/${thread.slug}`,
    datePublished: thread.createdAt.toISOString(),
    dateModified: thread.lastActivityAt.toISOString(),
    author: { "@type": "Person", name: thread.authorName },
    articleSection: category?.name ?? thread.category,
    interactionStatistic: {
      "@type": "InteractionCounter",
      interactionType: "https://schema.org/CommentAction",
      userInteractionCount: thread.replyCount,
    },
    ...(answer
      ? {
          comment: posts
            .filter((p) => !p.deleted)
            .map((p) => ({
              "@type": "Comment",
              text: p.body,
              datePublished: p.createdAt.toISOString(),
              author: { "@type": "Person", name: p.authorName },
            })),
        }
      : {}),
  };

  return (
    <>
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD must be inline for crawlers that do not run scripts.
        dangerouslySetInnerHTML={jsonLd(discussionSchema)}
      />
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: as above.
        dangerouslySetInnerHTML={jsonLd(
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Forum", path: "/forum" },
            ...(category ? [{ name: category.name, path: `/forum/c/${category.slug}` }] : []),
          ]),
        )}
      />

      <div className="mx-auto max-w-3xl px-5 py-12">
        <nav className="mb-7 flex flex-wrap items-center gap-2 font-mono text-[11.5px] text-ink-400">
          <Link href="/forum" className="transition-colors hover:text-ink-700">
            Forum
          </Link>
          {category && (
            <>
              <span aria-hidden="true">/</span>
              <Link
                href={`/forum/c/${category.slug}`}
                className="transition-colors hover:text-ink-700"
              >
                {category.name}
              </Link>
            </>
          )}
        </nav>

        <header className="mb-8">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {thread.answered && (
              <span className="border border-teal-600 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-teal-700">
                Answered
              </span>
            )}
            {thread.locked && (
              <span className="border border-ink-300 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-ink-400">
                Locked
              </span>
            )}
          </div>
          <h1 className="font-display text-[1.9rem] font-extrabold leading-[1.12] tracking-[-0.018em] text-ink-900">
            {thread.title}
          </h1>
          <p className="mt-3 font-mono text-[11.5px] text-ink-400">
            {thread.authorName} · {timeAgo(thread.createdAt)} ·{" "}
            {thread.replyCount === 1 ? "1 reply" : `${thread.replyCount} replies`}
          </p>
        </header>

        {/* The answer, surfaced. Only when there is one and it is not the OP. */}
        {answer && (
          <section className="mb-8 border-l-2 border-teal-600 bg-teal-50/40 py-4 pl-5 pr-4">
            <h2 className="mb-2 flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.12em] text-teal-700">
              <Sq size={6} /> Accepted answer, by {answer.authorName}
            </h2>
            <Body text={answer.body} />
          </section>
        )}

        <article className="mb-10 border border-ink-200 bg-white">
          <div className="border-b border-ink-100 bg-ink-50/60 px-4 py-2.5">
            <p className="font-mono text-[11.5px] text-ink-500">
              <span className="font-semibold text-ink-800">{thread.authorName}</span> asked ·{" "}
              {thread.createdAt.toLocaleDateString("en-GB", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </p>
          </div>
          <div className="px-4 py-4">
            <Body text={thread.body} />
          </div>
        </article>

        <section className="mb-10">
          <h2 className="mb-5 border-b border-ink-200 pb-2 font-display text-[1.05rem] font-bold tracking-[-0.012em] text-ink-900">
            {posts.length === 0
              ? "No replies yet"
              : posts.length === 1
                ? "1 reply"
                : `${posts.length} replies`}
          </h2>

          {posts.length === 0 ? (
            <p className="text-[14.5px] leading-relaxed text-ink-500">
              Nobody has answered this yet. If you know, say so below.
            </p>
          ) : (
            <ul className="space-y-5">
              {posts.map((post) => (
                <li
                  key={post.id}
                  id={`post-${post.id}`}
                  className={`border bg-white ${
                    post.isAnswer ? "border-teal-600" : "border-ink-200"
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-3 border-b border-ink-100 bg-ink-50/60 px-4 py-2.5">
                    <p className="font-mono text-[11.5px] text-ink-500">
                      {post.deleted ? (
                        <span className="italic text-ink-400">reply removed</span>
                      ) : (
                        <>
                          <span className="font-semibold text-ink-800">{post.authorName}</span> ·{" "}
                          {timeAgo(post.createdAt)}
                          {post.updatedAt.getTime() - post.createdAt.getTime() > 60_000 && (
                            <span className="text-ink-400"> · edited</span>
                          )}
                        </>
                      )}
                    </p>
                    {post.isAnswer && !post.deleted && (
                      <span className="border border-teal-600 px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.08em] text-teal-700">
                        Answer
                      </span>
                    )}
                    {isAuthor && !post.deleted && (
                      <span className="ml-auto">
                        <AnswerToggle
                          threadId={thread.id}
                          postId={post.id}
                          isAnswer={post.isAnswer}
                        />
                      </span>
                    )}
                  </div>
                  <div className="px-4 py-4">
                    {post.deleted ? (
                      <p className="text-[14px] italic text-ink-400">
                        This reply was removed by its author.
                      </p>
                    ) : (
                      <Body text={post.body} />
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <ReplyBox
          threadId={thread.id}
          threadSlug={thread.slug}
          signedIn={Boolean(user)}
          locked={thread.locked}
        />
      </div>
    </>
  );
}

/**
 * Post body.
 *
 * Rendered as pre-wrapped plain text rather than as HTML or Markdown. Posts are
 * user input on a public page, and the safest renderer is the one that cannot
 * emit markup at all. It also happens to be the right choice for the content:
 * ladder logic pasted as neutral text needs its whitespace kept exactly.
 */
function Body({ text }: { text: string }) {
  return (
    <div className="whitespace-pre-wrap break-words font-mono text-[13.5px] leading-relaxed text-ink-800">
      {text}
    </div>
  );
}
