import { db } from "@/lib/db/client";
import { forumPosts, forumThreads, users } from "@/lib/db/schema";
import { and, desc, eq, isNull, sql } from "drizzle-orm";

/**
 * Forum reads and writes.
 *
 * Kept out of the route handlers so the pages can call them directly as server
 * components. A thread page that has to fetch its own API over HTTP is a page
 * paying a network round trip to talk to itself.
 */

export interface ThreadSummary {
  id: string;
  slug: string;
  title: string;
  category: string;
  replyCount: number;
  pinned: boolean;
  locked: boolean;
  answered: boolean;
  lastActivityAt: Date;
  createdAt: Date;
  authorName: string;
  excerpt: string;
}

export interface ThreadDetail extends ThreadSummary {
  body: string;
  authorId: string;
  answerPostId: string | null;
}

export interface PostView {
  id: string;
  body: string;
  createdAt: Date;
  updatedAt: Date;
  authorId: string;
  authorName: string;
  isAnswer: boolean;
  deleted: boolean;
}

/**
 * A display name that is always present.
 *
 * displayName is optional at sign-up, so falling back to the local part of the
 * email keeps the forum from showing a column of blanks. The full address is
 * never exposed: that would turn a public forum into a scraped mailing list.
 */
function displayName(name: string | null, email: string): string {
  if (name?.trim()) return name.trim();
  const local = email.split("@")[0] ?? "member";
  return local.replace(/[._-]+/g, " ").slice(0, 32);
}

function excerptOf(body: string, max = 180): string {
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1)}…`;
}

/**
 * Turn a title into a URL slug with a short random suffix.
 *
 * The suffix is what makes two threads asking the same question able to coexist.
 * Without it the second "Why does my coil only work on the second scan" fails a
 * unique constraint, which is a terrible experience for a perfectly good post.
 */
export function slugify(title: string): string {
  const base = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 70)
    .replace(/^-+|-+$/g, "");
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${base || "thread"}-${suffix}`;
}

export async function listThreads(options?: {
  category?: string;
  limit?: number;
}): Promise<ThreadSummary[]> {
  const limit = options?.limit ?? 50;
  const rows = await db()
    .select({
      id: forumThreads.id,
      slug: forumThreads.slug,
      title: forumThreads.title,
      body: forumThreads.body,
      category: forumThreads.category,
      replyCount: forumThreads.replyCount,
      pinned: forumThreads.pinned,
      locked: forumThreads.locked,
      answerPostId: forumThreads.answerPostId,
      lastActivityAt: forumThreads.lastActivityAt,
      createdAt: forumThreads.createdAt,
      authorName: users.displayName,
      authorEmail: users.email,
    })
    .from(forumThreads)
    .innerJoin(users, eq(users.id, forumThreads.authorId))
    .where(options?.category ? eq(forumThreads.category, options.category) : undefined)
    // Pinned first, then most recently active. Matches how every forum this
    // audience already uses behaves, and meeting that expectation is free.
    .orderBy(desc(forumThreads.pinned), desc(forumThreads.lastActivityAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    category: r.category,
    replyCount: r.replyCount,
    pinned: r.pinned,
    locked: r.locked,
    answered: Boolean(r.answerPostId),
    lastActivityAt: r.lastActivityAt,
    createdAt: r.createdAt,
    authorName: displayName(r.authorName, r.authorEmail),
    excerpt: excerptOf(r.body),
  }));
}

export async function countByCategory(): Promise<Record<string, number>> {
  const rows = await db()
    .select({ category: forumThreads.category, n: sql<number>`count(*)::int` })
    .from(forumThreads)
    .groupBy(forumThreads.category);
  const out: Record<string, number> = {};
  for (const r of rows) out[r.category] = r.n;
  return out;
}

export async function getThread(slug: string): Promise<ThreadDetail | null> {
  const [row] = await db()
    .select({
      id: forumThreads.id,
      slug: forumThreads.slug,
      title: forumThreads.title,
      body: forumThreads.body,
      category: forumThreads.category,
      replyCount: forumThreads.replyCount,
      pinned: forumThreads.pinned,
      locked: forumThreads.locked,
      answerPostId: forumThreads.answerPostId,
      lastActivityAt: forumThreads.lastActivityAt,
      createdAt: forumThreads.createdAt,
      authorId: forumThreads.authorId,
      authorName: users.displayName,
      authorEmail: users.email,
    })
    .from(forumThreads)
    .innerJoin(users, eq(users.id, forumThreads.authorId))
    .where(eq(forumThreads.slug, slug))
    .limit(1);

  if (!row) return null;
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    body: row.body,
    category: row.category,
    replyCount: row.replyCount,
    pinned: row.pinned,
    locked: row.locked,
    answered: Boolean(row.answerPostId),
    answerPostId: row.answerPostId,
    lastActivityAt: row.lastActivityAt,
    createdAt: row.createdAt,
    authorId: row.authorId,
    authorName: displayName(row.authorName, row.authorEmail),
    excerpt: excerptOf(row.body),
  };
}

export async function listPosts(
  threadId: string,
  answerPostId: string | null,
): Promise<PostView[]> {
  const rows = await db()
    .select({
      id: forumPosts.id,
      body: forumPosts.body,
      createdAt: forumPosts.createdAt,
      updatedAt: forumPosts.updatedAt,
      deletedAt: forumPosts.deletedAt,
      authorId: forumPosts.authorId,
      authorName: users.displayName,
      authorEmail: users.email,
    })
    .from(forumPosts)
    .innerJoin(users, eq(users.id, forumPosts.authorId))
    .where(eq(forumPosts.threadId, threadId))
    .orderBy(forumPosts.createdAt);

  return rows.map((r) => ({
    id: r.id,
    // A deleted reply keeps its place in the conversation but not its content,
    // so the replies that answer it still make sense.
    body: r.deletedAt ? "" : r.body,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    authorId: r.authorId,
    authorName: r.deletedAt ? "" : displayName(r.authorName, r.authorEmail),
    isAnswer: r.id === answerPostId,
    deleted: Boolean(r.deletedAt),
  }));
}

export async function createThread(input: {
  authorId: string;
  category: string;
  title: string;
  body: string;
}): Promise<{ slug: string }> {
  const slug = slugify(input.title);
  await db().insert(forumThreads).values({
    authorId: input.authorId,
    category: input.category,
    title: input.title,
    slug,
    body: input.body,
  });
  return { slug };
}

export async function createPost(input: {
  threadId: string;
  authorId: string;
  body: string;
}): Promise<{ id: string }> {
  const [post] = await db()
    .insert(forumPosts)
    .values({ threadId: input.threadId, authorId: input.authorId, body: input.body })
    .returning({ id: forumPosts.id });

  // Keep the denormalised counters honest. Computed from the table rather than
  // incremented, so a failed insert or a delete can never drift the count.
  await db()
    .update(forumThreads)
    .set({
      replyCount: sql`(select count(*)::int from ${forumPosts}
                       where ${forumPosts.threadId} = ${input.threadId}
                         and ${forumPosts.deletedAt} is null)`,
      lastActivityAt: new Date(),
    })
    .where(eq(forumThreads.id, input.threadId));

  if (!post) throw new Error("post insert returned no row");
  return post;
}

/** Only the thread author may mark an answer, and only to a post in their thread. */
export async function markAnswer(input: {
  threadId: string;
  postId: string | null;
  userId: string;
}): Promise<boolean> {
  const [thread] = await db()
    .select({ authorId: forumThreads.authorId })
    .from(forumThreads)
    .where(eq(forumThreads.id, input.threadId))
    .limit(1);
  if (!thread || thread.authorId !== input.userId) return false;

  if (input.postId) {
    const [post] = await db()
      .select({ id: forumPosts.id })
      .from(forumPosts)
      .where(and(eq(forumPosts.id, input.postId), eq(forumPosts.threadId, input.threadId)))
      .limit(1);
    if (!post) return false;
  }

  await db()
    .update(forumThreads)
    .set({ answerPostId: input.postId })
    .where(eq(forumThreads.id, input.threadId));
  return true;
}

/** Soft delete, author only. */
export async function deletePost(postId: string, userId: string): Promise<boolean> {
  const [post] = await db()
    .select({ threadId: forumPosts.threadId, authorId: forumPosts.authorId })
    .from(forumPosts)
    .where(and(eq(forumPosts.id, postId), isNull(forumPosts.deletedAt)))
    .limit(1);
  if (!post || post.authorId !== userId) return false;

  await db().update(forumPosts).set({ deletedAt: new Date() }).where(eq(forumPosts.id, postId));
  await db()
    .update(forumThreads)
    .set({
      replyCount: sql`(select count(*)::int from ${forumPosts}
                       where ${forumPosts.threadId} = ${post.threadId}
                         and ${forumPosts.deletedAt} is null)`,
    })
    .where(eq(forumThreads.id, post.threadId));
  return true;
}

export async function editPost(postId: string, userId: string, body: string): Promise<boolean> {
  const [post] = await db()
    .select({ authorId: forumPosts.authorId })
    .from(forumPosts)
    .where(eq(forumPosts.id, postId))
    .limit(1);
  if (!post || post.authorId !== userId) return false;

  await db()
    .update(forumPosts)
    .set({ body, updatedAt: new Date() })
    .where(eq(forumPosts.id, postId));
  return true;
}
