// POST   /api/documents/[id]/share   mint a read only link, with an expiry
// DELETE /api/documents/[id]/share   revoke it
//
// The same shape as sharing a conversation: 24 random bytes as the token, kept
// apart from the row id, so revoking is setting it to null and every copy of
// the link stops at once. Documents add an expiry, because a link to an FDS
// should not outlive the project it was written for.

import { randomBytes } from "node:crypto";
import { getApiUser } from "@/lib/auth/server";
import { db } from "@/lib/db/client";
import { documents } from "@/lib/db/schema";
import { accessIds } from "@/lib/teams/access";
import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  /** 0 means no expiry. */
  days: z.number().int().min(0).max(365).default(30),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getApiUser();
  if ("error" in auth) return auth.error;
  const { id } = await params;

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid request" }, { status: 400 });

  const token = randomBytes(24).toString("base64url");
  const expires =
    parsed.data.days > 0 ? new Date(Date.now() + parsed.data.days * 86_400_000) : null;

  const updated = await db()
    .update(documents)
    .set({ shareToken: token, sharedAt: new Date(), shareExpiresAt: expires })
    .where(and(eq(documents.id, id), inArray(documents.userId, await accessIds(auth.user.id))))
    .returning({ id: documents.id });
  if (updated.length === 0) return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json({ token, expiresAt: expires?.toISOString() ?? null });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getApiUser();
  if ("error" in auth) return auth.error;
  const { id } = await params;

  const updated = await db()
    .update(documents)
    .set({ shareToken: null, sharedAt: null, shareExpiresAt: null })
    .where(and(eq(documents.id, id), inArray(documents.userId, await accessIds(auth.user.id))))
    .returning({ id: documents.id });
  if (updated.length === 0) return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json({ ok: true });
}
