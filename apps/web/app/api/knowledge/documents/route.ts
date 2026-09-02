// GET    /api/knowledge/documents  list the user's indexed documents
// POST   /api/knowledge/documents  index a new one
// DELETE /api/knowledge/documents?id=...  remove one, chunks included
//
// Indexing needs an embeddings API, which Anthropic does not have. The POST
// says so explicitly rather than failing somewhere less obvious.

import { getApiUser } from "@/lib/auth/server";
import { db } from "@/lib/db/client";
import { credentialsFor, preferredProvider } from "@/lib/db/provider-keys";
import { knowledgeChunks, knowledgeDocs } from "@/lib/db/schema";
import { chunkText, normalise } from "@/lib/knowledge/chunk";
import { ProviderError, getProvider } from "@/lib/providers";
import { accessIds } from "@/lib/teams/access";
import { and, desc, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

const MAX_CHARS = 400_000;
/** Providers cap how many inputs one embeddings call takes. */
const BATCH = 64;

const schema = z.object({
  title: z.string().trim().min(1).max(200),
  text: z.string().trim().min(20).max(MAX_CHARS),
  filename: z.string().trim().max(255).optional(),
});

export async function GET() {
  const auth = await getApiUser();
  if ("error" in auth) return auth.error;

  const rows = await db()
    .select({
      id: knowledgeDocs.id,
      title: knowledgeDocs.title,
      filename: knowledgeDocs.filename,
      byteSize: knowledgeDocs.byteSize,
      chunkCount: knowledgeDocs.chunkCount,
      embedModel: knowledgeDocs.embedModel,
      createdAt: knowledgeDocs.createdAt,
    })
    .from(knowledgeDocs)
    .where(inArray(knowledgeDocs.userId, await accessIds(auth.user.id)))
    .orderBy(desc(knowledgeDocs.createdAt));

  return NextResponse.json({ documents: rows });
}

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

  const preferred = await preferredProvider(auth.user.id);
  if (!preferred) {
    return NextResponse.json(
      {
        error: "no_provider",
        message: "Connect an AI provider in Settings before indexing a document.",
      },
      { status: 428 },
    );
  }

  const provider = getProvider(preferred.kind);
  if (!provider.embed || !provider.defaultEmbedModel) {
    return NextResponse.json(
      {
        error: "no_embeddings",
        message: `${provider.label} has no embeddings API, so it cannot build a searchable index. Connect OpenAI, OpenRouter, or any OpenAI-compatible endpoint in Settings and use that for Knowledge.`,
      },
      { status: 409 },
    );
  }

  const creds = await credentialsFor(auth.user.id, preferred.kind);
  if (!creds) return NextResponse.json({ error: "no_provider" }, { status: 428 });

  const chunks = chunkText(parsed.data.text);
  if (chunks.length === 0) {
    return NextResponse.json({ error: "nothing to index in that text" }, { status: 400 });
  }

  const embedModel = provider.defaultEmbedModel;
  const vectors: number[][] = [];

  try {
    for (let i = 0; i < chunks.length; i += BATCH) {
      const batch = chunks.slice(i, i + BATCH);
      const result = await provider.embed(creds, {
        model: embedModel,
        input: batch.map((c) => c.text),
      });
      vectors.push(...result.map(normalise));
    }
  } catch (err) {
    if (err instanceof ProviderError) {
      return NextResponse.json(
        { error: err.kind, message: err.userMessage },
        { status: err.kind === "auth" ? 400 : 502 },
      );
    }
    return NextResponse.json({ error: "embedding failed" }, { status: 502 });
  }

  const [doc] = await db()
    .insert(knowledgeDocs)
    .values({
      userId: auth.user.id,
      title: parsed.data.title,
      filename: parsed.data.filename ?? null,
      byteSize: parsed.data.text.length,
      chunkCount: chunks.length,
      embedModel,
    })
    .returning({ id: knowledgeDocs.id });

  if (!doc) return NextResponse.json({ error: "could not save" }, { status: 500 });

  await db()
    .insert(knowledgeChunks)
    .values(
      chunks.map((c, i) => ({
        docId: doc.id,
        userId: auth.user.id,
        ordinal: c.ordinal,
        text: c.text,
        embedding: vectors[i] as number[],
      })),
    );

  return NextResponse.json({ id: doc.id, chunks: chunks.length, embedModel }, { status: 201 });
}

export async function DELETE(req: Request) {
  const auth = await getApiUser();
  if ("error" in auth) return auth.error;

  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  // Scoped to the owner, so an id from someone else's library deletes nothing.
  const deleted = await db()
    .delete(knowledgeDocs)
    .where(
      and(eq(knowledgeDocs.id, id), inArray(knowledgeDocs.userId, await accessIds(auth.user.id))),
    )
    .returning({ id: knowledgeDocs.id });

  if (deleted.length === 0) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  // Chunks go with it through the cascade on the foreign key.
  return NextResponse.json({ ok: true });
}
