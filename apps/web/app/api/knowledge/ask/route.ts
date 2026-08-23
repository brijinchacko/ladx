// POST /api/knowledge/ask
//
// Retrieve passages from the user's own documents, then answer from those
// passages only, streaming the reply as Server-Sent Events.
//
// The retrieval step is what makes the answer checkable, so it is reported to
// the client before the tokens start: the UI shows which passages were used
// even if the model then says the answer is not in them.

import { getApiUser } from "@/lib/auth/server";
import { credentialsFor, preferredProvider } from "@/lib/db/provider-keys";
import { normalise } from "@/lib/knowledge/chunk";
import { ANSWER_SYSTEM_PROMPT, buildContext, searchChunks } from "@/lib/knowledge/search";
import { ProviderError, getProvider } from "@/lib/providers";
import { NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  question: z.string().trim().min(3).max(2000),
  docId: z.string().uuid().optional(),
  model: z.string().min(1).max(200).optional(),
});

export async function POST(req: Request) {
  const auth = await getApiUser();
  if ("error" in auth) return auth.error;

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  const preferred = await preferredProvider(auth.user.id);
  if (!preferred) {
    return NextResponse.json(
      { error: "no_provider", message: "Connect an AI provider in Settings first." },
      { status: 428 },
    );
  }

  const provider = getProvider(preferred.kind);
  if (!provider.embed || !provider.defaultEmbedModel) {
    return NextResponse.json(
      {
        error: "no_embeddings",
        message: `${provider.label} has no embeddings API, so it cannot search your documents.`,
      },
      { status: 409 },
    );
  }

  const creds = await credentialsFor(auth.user.id, preferred.kind);
  if (!creds) return NextResponse.json({ error: "no_provider" }, { status: 428 });

  let hits: Awaited<ReturnType<typeof searchChunks>>;
  try {
    const [queryVector] = await provider.embed(creds, {
      model: provider.defaultEmbedModel,
      input: [parsed.data.question],
    });
    if (!queryVector) throw new ProviderError("bad_request", "no embedding for the question");

    hits = await searchChunks({
      userId: auth.user.id,
      queryVector: normalise(queryVector),
      embedModel: provider.defaultEmbedModel,
      docId: parsed.data.docId,
    });
  } catch (err) {
    if (err instanceof ProviderError) {
      return NextResponse.json({ error: err.kind, message: err.userMessage }, { status: 502 });
    }
    return NextResponse.json({ error: "search failed" }, { status: 500 });
  }

  // Nothing relevant. Saying so is the correct answer, and it costs no tokens.
  if (hits.length === 0) {
    return NextResponse.json({
      error: "no_match",
      message:
        "Nothing in your indexed documents is close enough to that question to answer it. Try different wording, or index the manual that covers it.",
      sources: [],
    });
  }

  const model = parsed.data.model ?? creds.defaultModel;
  if (!model) {
    return NextResponse.json(
      { error: "no_model", message: "Choose a model in Settings first." },
      { status: 428 },
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      // Sources first, so the citations are on screen before the answer that
      // refers to them arrives.
      send(
        "sources",
        hits.map((h, i) => ({
          n: i + 1,
          docId: h.docId,
          docTitle: h.docTitle,
          passage: h.ordinal + 1,
          score: Math.round(h.score * 100) / 100,
          excerpt: h.text.slice(0, 240),
        })),
      );

      try {
        for await (const delta of provider.stream(creds, {
          model,
          messages: [
            { role: "system", content: ANSWER_SYSTEM_PROMPT },
            {
              role: "user",
              content: `Passages:\n\n${buildContext(hits)}\n\n---\n\nQuestion: ${parsed.data.question}`,
            },
          ],
          maxTokens: 1200,
        })) {
          send("delta", delta);
        }
        send("done", {});
      } catch (err) {
        const message =
          err instanceof ProviderError ? err.userMessage : "The provider stopped responding.";
        send("error", { message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
