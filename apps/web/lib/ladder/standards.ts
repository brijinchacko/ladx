/**
 * The written standards that apply to a generation request.
 *
 * Kept out of the route so the route reads as what it does rather than as
 * plumbing, and so the failure policy is in one place: if the standards cannot
 * be read, generation goes ahead without them rather than failing.
 *
 * That is a real decision and it goes one way for guidance and would go the
 * other for a veto, if a veto could be silently lost. It cannot be here: the
 * retrieval returns every forbidden rule in scope, so either all of them arrive
 * or none do, and none means the subprocess did not run at all. Somebody
 * generating a rung while the analysis binary is missing gets a rung written
 * without their standards, which is what they had before standards existed.
 */

import { db } from "@/lib/db/client";
import { memories } from "@/lib/db/schema";
import { applicableStandards } from "@/lib/parsers/spawn";
import { and, eq, isNull } from "drizzle-orm";

export interface StandardsForPrompt {
  /** Prepended to the request. Empty when nothing applies. */
  prompt: string;
  /**
   * What was used, in the words they were written in.
   *
   * The content rather than the ids, because this is shown to the person who
   * wrote them. "LADX followed 2 standards" is not an answer; the two rules
   * are. The Standards page promises this and it is the promise that makes
   * the feature trustworthy: a suggestion somebody disagrees with can be
   * traced to the rule that caused it and the rule can be changed.
   */
  used: { forbidden: string[]; guidance: string[] };
}

export async function standardsFor(
  userId: string,
  request: string,
  projectId: string | null,
): Promise<StandardsForPrompt> {
  try {
    const rows = await db()
      .select()
      .from(memories)
      .where(and(eq(memories.userId, userId), isNull(memories.supersededBy)));

    if (rows.length === 0) return { prompt: "", used: { forbidden: [], guidance: [] } };

    // Shaped for the Rust model, which names things in snake_case and takes
    // the project as the identifier the entry stores.
    const shaped = rows.map((r) => ({
      id: r.id,
      scope: r.scope,
      kind: r.kind,
      project: r.projectId,
      content: r.content,
      reason: r.reason,
      author: r.author,
      created_at: r.createdAt.toISOString(),
      supersedes: r.supersedes,
      superseded_by: r.supersededBy,
    }));

    const out = await applicableStandards(shaped, request, projectId);
    const contentOf = (ids: string[]) =>
      ids
        .map((id) => rows.find((r) => r.id === id)?.content)
        .filter((c): c is string => Boolean(c));

    return {
      prompt: out.prompt,
      used: { forbidden: contentOf(out.forbidden), guidance: contentOf(out.guidance) },
    };
  } catch {
    // Deliberately swallowed. Somebody writing a rung should not be stopped
    // because the standards could not be read; they get what they had before
    // standards existed.
    return { prompt: "", used: { forbidden: [], guidance: [] } };
  }
}
