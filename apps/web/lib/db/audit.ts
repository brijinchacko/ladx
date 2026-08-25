/**
 * The audit trail.
 *
 * The table has existed since the first migration and nothing wrote to it,
 * which is the worst of both worlds: a compliance story on the website and an
 * empty table behind it. ALCOA+ asks that a record be attributable, legible,
 * contemporaneous, original and accurate, and the first of those is the one a
 * missing writer fails outright.
 *
 * What goes in: who did it, what they did, which thing it was done to, and
 * when. What does not go in: the content. A prompt can carry a customer's
 * process description and a generated program is the customer's intellectual
 * property, so the record says "a program was generated for this project, of
 * this size, by this model" and the program itself stays where the user put
 * it. That is enough to reconstruct the sequence of events, which is what an
 * audit is for, without turning the log into a second copy of everybody's work.
 *
 * Never throws. A failure to record must not fail the thing being recorded:
 * an audit line lost to a database hiccup is a gap in a log, and a sign-in
 * refused because the log was busy is an outage.
 */

import { db } from "@/lib/db/client";
import { auditLog } from "@/lib/db/schema";

export interface AuditEntry {
  /** The account responsible, when there is one. Null for anonymous events. */
  userId?: string | null;
  /** How they would be named in a report: an email, or "system". */
  actor: string;
  /** Past tense, snake case: project_created, ladder_generated, admin_granted. */
  event: string;
  /** The row or resource acted on. */
  subjectId?: string | null;
  /**
   * Facts about the action, never its content.
   *
   * Counts, model names, sizes, outcomes. If a field could contain something
   * the user wrote or something a model wrote for them, it does not belong.
   */
  payload?: Record<string, unknown> | null;
}

export async function writeAudit(entry: AuditEntry): Promise<void> {
  try {
    await db()
      .insert(auditLog)
      .values({
        userId: entry.userId ?? null,
        actor: entry.actor,
        event: entry.event,
        subjectId: entry.subjectId ?? null,
        payload: entry.payload ?? null,
      });
  } catch {
    // Deliberately swallowed. See the note at the top: the caller is doing
    // something the user asked for, and this is a note about it.
  }
}

/**
 * Record without waiting.
 *
 * For the hot paths, where the user is watching a spinner and an extra round
 * trip to Postgres before the first token is a cost they can feel. The promise
 * is deliberately not returned and deliberately not awaited.
 */
export function auditInBackground(entry: AuditEntry): void {
  void writeAudit(entry);
}
