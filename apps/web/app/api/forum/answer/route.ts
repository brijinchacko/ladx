// POST /api/forum/answer, mark or unmark the reply that solved a thread.
//
// Only the thread author may do this. That is the convention on every technical
// forum this audience uses, and it is also the only signal available that the
// answer actually worked for the person with the problem.

import { getApiUser } from "@/lib/auth/server";
import { markAnswer } from "@/lib/forum/queries";
import { NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  threadId: z.string().uuid(),
  // null clears the mark, for when a better answer arrives later.
  postId: z.string().uuid().nullable(),
});

export async function POST(req: Request) {
  const auth = await getApiUser();
  if ("error" in auth) return auth.error;

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const ok = await markAnswer({ ...parsed.data, userId: auth.user.id });
  if (!ok) return NextResponse.json({ error: "not permitted" }, { status: 403 });
  return NextResponse.json({ ok: true });
}
