import { db } from "@/lib/db/client";
import { knowledgeChunks, knowledgeDocs } from "@/lib/db/schema";
import { accessIds } from "@/lib/teams/access";
import { and, eq, inArray } from "drizzle-orm";

/**
 * Retrieval over a user's indexed documents.
 *
 * **The scale limit, stated plainly.** Similarity is computed in the application
 * rather than in the database, over every chunk the user owns for the model in
 * question. That is a real limit: it is comfortable into the low tens of
 * thousands of chunks, which is several thousand pages of manual, and it stops
 * being comfortable well before a corpus that a whole site would share.
 *
 * The alternative is pgvector, and the reason it is not used is not technical.
 * This database is shared with fifteen unrelated production applications, and
 * installing an extension into it changes their server too. When this feature
 * earns its own database, pgvector is the first thing to add, and the only code
 * that changes is this file.
 */

export interface Hit {
  chunkId: string;
  docId: string;
  docTitle: string;
  ordinal: number;
  text: string;
  /** Cosine similarity, in the range -1 to 1. Practically 0 to 1 here. */
  score: number;
}

/** Below this, a passage is not about the question, it just shares vocabulary. */
const FLOOR = 0.25;

/**
 * Dot product of two unit vectors, which is their cosine similarity.
 *
 * Vectors of different lengths come from different embedding models, and
 * comparing them produces a number that means nothing. Returning zero is safer
 * than comparing the overlap.
 */
function similarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += (a[i] as number) * (b[i] as number);
  return sum;
}

export async function searchChunks(input: {
  userId: string;
  queryVector: number[];
  embedModel: string;
  /** Restrict to one document, when the user has asked about a specific manual. */
  docId?: string;
  limit?: number;
}): Promise<Hit[]> {
  const limit = input.limit ?? 6;

  const rows = await db()
    .select({
      chunkId: knowledgeChunks.id,
      docId: knowledgeChunks.docId,
      ordinal: knowledgeChunks.ordinal,
      text: knowledgeChunks.text,
      embedding: knowledgeChunks.embedding,
      docTitle: knowledgeDocs.title,
      docModel: knowledgeDocs.embedModel,
    })
    .from(knowledgeChunks)
    .innerJoin(knowledgeDocs, eq(knowledgeDocs.id, knowledgeChunks.docId))
    .where(
      input.docId
        ? and(
            inArray(knowledgeChunks.userId, await accessIds(input.userId)),
            eq(knowledgeChunks.docId, input.docId),
          )
        : inArray(knowledgeChunks.userId, await accessIds(input.userId)),
    );

  return (
    rows
      // Vectors from a different embedding model are not comparable, so documents
      // indexed with one model are invisible to a query embedded with another.
      // Silently mixing them would return confident nonsense.
      .filter((r) => r.docModel === input.embedModel)
      .map((r) => ({
        chunkId: r.chunkId,
        docId: r.docId,
        docTitle: r.docTitle,
        ordinal: r.ordinal,
        text: r.text,
        score: similarity(input.queryVector, r.embedding),
      }))
      .filter((h) => h.score >= FLOOR)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
  );
}

/**
 * Build the context block handed to the model, with citation markers.
 *
 * Each passage is numbered and labelled with its source, and the prompt requires
 * those numbers in the answer. That is what makes a claim checkable: an answer
 * about a torque limit with no source is worse than no answer, because it is
 * just as confident and cannot be verified.
 */
export function buildContext(hits: Hit[]): string {
  return hits
    .map((h, i) => `[${i + 1}] ${h.docTitle}, passage ${h.ordinal + 1}\n${h.text}`)
    .join("\n\n---\n\n");
}

export const ANSWER_SYSTEM_PROMPT = `You answer questions about industrial automation using only the passages provided.

Rules:
- Use only what is in the passages. If they do not contain the answer, say so plainly and stop. Do not fill the gap from general knowledge.
- Cite every factual claim with the passage number in square brackets, like [1] or [2].
- Quote exact figures, tolerances, part numbers and settings rather than paraphrasing them.
- If two passages disagree, say so and cite both.
- Be brief. An engineer reading this is standing in front of a machine.`;
