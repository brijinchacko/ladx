// POST /api/forum/threads, start a new thread.
//
// Reads are done directly by the server components that need them, so this
// route only handles the write.

import { getApiUser } from "@/lib/auth/server";
import { CATEGORY_SLUGS } from "@/lib/forum/categories";
import { createThread } from "@/lib/forum/queries";
import { NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  // Long enough to say something, short enough to stay a title rather than
  // becoming the post.
  title: z.string().trim().min(12).max(160),
  body: z.string().trim().min(30).max(20_000),
  category: z.enum(CATEGORY_SLUGS as [string, ...string[]]),
});

export async function POST(req: Request) {
  const auth = await getApiUser();
  if ("error" in auth) return auth.error;

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid request", detail: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const { slug } = await createThread({ ...parsed.data, authorId: auth.user.id });
  return NextResponse.json({ slug }, { status: 201 });
}
