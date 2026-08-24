// PATCH  /api/conversations/[id]   rename, pin, or share
// DELETE /api/conversations/[id]
//
// Sharing mints a random token rather than exposing the row id. The id appears
// in authenticated URLs, so reusing it would mean anyone who ever saw a private
// link could reach the public one. Setting `share: false` clears the token,
// which revokes every link that was handed out.

import { randomBytes } from "node:crypto";
import { getApiUser } from "@/lib/auth/server";
import { db } from "@/lib/db/client";
import { conversations } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  pinned: z.boolean().optional(),
  share: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getApiUser();
  if ("error" in auth) return auth.error;
  const { id } = await params;

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid request" }, { status: 400 });

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.title !== undefined) patch.title = parsed.data.title;
  if (parsed.data.pinned !== undefined) patch.pinned = parsed.data.pinned;

  let shareToken: string | null | undefined;
  if (parsed.data.share !== undefined) {
    if (parsed.data.share) {
      // 24 bytes of randomness: long enough that the link cannot be guessed.
      shareToken = randomBytes(24).toString("base64url");
      patch.shareToken = shareToken;
      patch.sharedAt = new Date();
    } else {
      shareToken = null;
      patch.shareToken = null;
      patch.sharedAt = null;
    }
  }

  const updated = await db()
    .update(conversations)
    .set(patch)
    .where(and(eq(conversations.id, id), eq(conversations.userId, auth.user.id)))
    .returning({ id: conversations.id, shareToken: conversations.shareToken });

  if (updated.length === 0) return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json({
    ok: true,
    ...(shareToken !== undefined ? { shareToken: updated[0]?.shareToken ?? null } : {}),
  });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getApiUser();
  if ("error" in auth) return auth.error;
  const { id } = await params;

  // Messages go with it through the cascade on the foreign key.
  const deleted = await db()
    .delete(conversations)
    .where(and(eq(conversations.id, id), eq(conversations.userId, auth.user.id)))
    .returning({ id: conversations.id });

  if (deleted.length === 0) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
