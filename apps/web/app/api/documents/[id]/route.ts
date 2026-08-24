// GET    /api/documents/[id]        the document, including an uploaded file's bytes
// PUT    /api/documents/[id]        save an edit
// DELETE /api/documents/[id]

import { getApiUser } from "@/lib/auth/server";
import { db } from "@/lib/db/client";
import { documents } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const updateSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  content: z.string().max(400_000).optional(),
  projectId: z.string().uuid().nullish(),
});

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getApiUser();
  if ("error" in auth) return auth.error;
  const { id } = await params;

  const [row] = await db()
    .select()
    .from(documents)
    .where(and(eq(documents.id, id), eq(documents.userId, auth.user.id)))
    .limit(1);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });

  // `raw` streams an uploaded file back as its own content type, which is what
  // the preview pane embeds. Without it the client would have to re-encode a
  // data URL it just received as JSON.
  if (req.nextUrl.searchParams.get("raw") === "1" && row.fileData) {
    const m = /^data:([^;]+);base64,(.+)$/.exec(row.fileData);
    if (m) {
      return new NextResponse(new Uint8Array(Buffer.from(m[2] as string, "base64")), {
        headers: {
          "Content-Type": m[1] as string,
          "Content-Disposition": `inline; filename="${(row.fileName ?? "file").replace(/"/g, "")}"`,
          "Cache-Control": "no-store",
        },
      });
    }
  }

  return NextResponse.json({ document: row });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getApiUser();
  if ("error" in auth) return auth.error;
  const { id } = await params;

  const parsed = updateSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid request" }, { status: 400 });

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.title !== undefined) patch.title = parsed.data.title;
  if (parsed.data.content !== undefined) {
    patch.content = parsed.data.content;
    patch.byteSize = parsed.data.content.length;
  }
  if (parsed.data.projectId !== undefined) patch.projectId = parsed.data.projectId ?? null;

  const updated = await db()
    .update(documents)
    .set(patch)
    .where(and(eq(documents.id, id), eq(documents.userId, auth.user.id)))
    .returning({ id: documents.id });

  if (updated.length === 0) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getApiUser();
  if ("error" in auth) return auth.error;
  const { id } = await params;

  const deleted = await db()
    .delete(documents)
    .where(and(eq(documents.id, id), eq(documents.userId, auth.user.id)))
    .returning({ id: documents.id });

  if (deleted.length === 0) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
