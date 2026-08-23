// POST /api/forum/posts, reply to a thread.
// PATCH, edit your own reply. DELETE, soft delete your own reply.
//
// Ownership is enforced in the query layer rather than here, so that a second
// caller cannot bypass it by forgetting the check.

import { getApiUser } from "@/lib/auth/server";
import { db } from "@/lib/db/client";
import { forumThreads } from "@/lib/db/schema";
import { createPost, deletePost, editPost } from "@/lib/forum/queries";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

const createSchema = z.object({
  threadId: z.string().uuid(),
  body: z.string().trim().min(2).max(20_000),
});

const editSchema = z.object({
  postId: z.string().uuid(),
  body: z.string().trim().min(2).max(20_000),
});

export async function POST(req: Request) {
  const auth = await getApiUser();
  if ("error" in auth) return auth.error;

  const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  // A locked thread accepts no replies. Checked here rather than trusted from
  // the client, which is where the disabled button lives.
  const [thread] = await db()
    .select({ locked: forumThreads.locked })
    .from(forumThreads)
    .where(eq(forumThreads.id, parsed.data.threadId))
    .limit(1);

  if (!thread) return NextResponse.json({ error: "no such thread" }, { status: 404 });
  if (thread.locked) return NextResponse.json({ error: "thread is locked" }, { status: 409 });

  const post = await createPost({ ...parsed.data, authorId: auth.user.id });
  return NextResponse.json(post, { status: 201 });
}

export async function PATCH(req: Request) {
  const auth = await getApiUser();
  if ("error" in auth) return auth.error;

  const parsed = editSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const ok = await editPost(parsed.data.postId, auth.user.id, parsed.data.body);
  if (!ok) return NextResponse.json({ error: "not yours to edit" }, { status: 403 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const auth = await getApiUser();
  if ("error" in auth) return auth.error;

  const postId = new URL(req.url).searchParams.get("postId") ?? "";
  const ok = await deletePost(postId, auth.user.id);
  if (!ok) return NextResponse.json({ error: "not yours to delete" }, { status: 403 });
  return NextResponse.json({ ok: true });
}
