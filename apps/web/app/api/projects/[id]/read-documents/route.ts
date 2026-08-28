// POST /api/projects/:id/read-documents
//
// Text from the client's own documents in, proposed design basis fields out.
// Nothing is saved here: the answer is a proposal the engineer reviews, because
// a model reading a specification is a useful reader and not an authority, and
// a field that silently appeared in a controlled document is worse than a blank
// one.

import { getApiUser } from "@/lib/auth/server";
import { complete, firstJsonObject } from "@/lib/inference/complete";
import { getProject } from "@/lib/platform/queries";
import { ProviderError } from "@/lib/providers";
import { BRIEF_FIELDS, type BriefKey, sanitizeBrief } from "@ladx/documents";
import { NextResponse } from "next/server";
import { z } from "zod";

export const maxDuration = 120;

const schema = z.object({
  documents: z
    .array(
      z.object({
        name: z.string().max(300),
        text: z.string().min(1).max(400_000),
      }),
    )
    .min(1)
    .max(6),
});

/** Total characters sent to the model, across every document. */
const BUDGET = 90_000;

function fieldGuide(): string {
  return BRIEF_FIELDS.map((f) => `- ${f.key}: ${f.label}. ${f.hint}`).join("\n");
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getApiUser();
  if ("error" in auth) return auth.error;
  const { id } = await params;

  const project = await getProject(auth.user.id, id);
  if (!project) return NextResponse.json({ error: "project not found" }, { status: 404 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid request" }, { status: 400 });

  // Share the budget across the documents rather than letting the first one
  // spend it, so a long URS does not squeeze out the short scope note that had
  // the commercial dates in it.
  const share = Math.floor(BUDGET / parsed.data.documents.length);
  const corpus = parsed.data.documents
    .map((d) => {
      const body = d.text.length > share ? `${d.text.slice(0, share)}\n[truncated]` : d.text;
      return `=== ${d.name} ===\n${body}`;
    })
    .join("\n\n");

  const system = [
    "You read control and automation project documents and pull out the facts an",
    "engineer would put on a project's design basis.",
    "",
    "Rules, in order of importance:",
    "1. Only state what the documents actually say. If a field is not covered, omit it.",
    "   A guess in a controlled document is worse than a gap.",
    "2. Quote figures exactly as written, units included. Do not convert or round.",
    "3. Keep the document's own wording where it is already concise.",
    "4. One field, one answer. Do not repeat the same fact across several fields.",
    "5. Reply with a single JSON object and nothing else.",
    "",
    "The object has two keys:",
    '  "fields": an object whose keys are from the list below and whose values are strings.',
    '  "sources": an object with the same keys, each a short note saying where in the',
    "            documents the value came from, so the engineer can check it.",
    "",
    "Fields:",
    fieldGuide(),
  ].join("\n");

  const user = [
    `Project: ${project.name}${project.code ? ` (${project.code})` : ""}`,
    "",
    "Documents:",
    "",
    corpus,
  ].join("\n");

  const messages = [
    { role: "system" as const, content: system },
    { role: "user" as const, content: user },
  ];

  try {
    /*
     * Two goes, and the second is not the same as the first.
     *
     * A free model that ignores "reply with JSON" once will usually comply when
     * told again with its own reply in front of it, and the free tier's
     * fall-through means the retry is often a different model anyway. One
     * unlucky pick should not send an engineer back to typing twenty-two
     * fields by hand.
     */
    let text = "";
    let model = "";
    let raw: unknown = null;
    let lastError: unknown = null;

    for (let attempt = 0; attempt < 2 && !raw; attempt++) {
      try {
        const result = await complete({
          userId: auth.user.id,
          messages:
            attempt === 0
              ? messages
              : [
                  ...messages,
                  { role: "assistant" as const, content: text.slice(0, 2000) },
                  {
                    role: "user" as const,
                    content:
                      "That was not a JSON object. Reply again with the JSON object only: no prose, no code fence, starting with { and ending with }.",
                  },
                ],
          // Generous, because a reasoning model thinks before it answers and a
          // tight ceiling means it spends the whole budget reasoning and
          // returns nothing at all. That is the commonest free tier failure.
          maxTokens: 4000,
          temperature: 0,
        });
        text = result.text;
        model = result.model;
        raw = firstJsonObject(text);
      } catch (err) {
        // A model that fails outright is worth one more go: the free tier's
        // fall-through usually lands on a different model second time.
        lastError = err;
      }
    }

    if (!raw && lastError) throw lastError;

    const parsedReply = raw as { fields?: unknown; sources?: Record<string, unknown> } | null;
    if (!parsedReply) {
      return NextResponse.json(
        {
          error: "The model did not return anything usable. Try again, or fill the fields by hand.",
        },
        { status: 502 },
      );
    }

    // Same sanitiser the manual path uses, so an extracted value cannot do
    // anything a typed one could not.
    const fields = sanitizeBrief(parsedReply.fields);
    const sources: Partial<Record<BriefKey, string>> = {};
    for (const f of BRIEF_FIELDS) {
      const note = parsedReply.sources?.[f.key];
      if (typeof note === "string" && note.trim()) sources[f.key] = note.trim().slice(0, 300);
    }

    return NextResponse.json({ fields, sources, model, found: Object.keys(fields).length });
  } catch (err) {
    const message =
      err instanceof ProviderError
        ? err.userMessage
        : "Could not read those documents. Try again, or fill the fields by hand.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
