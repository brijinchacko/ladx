import { db } from "@/lib/db/client";
import { ladderPrograms } from "@/lib/db/schema";
import { and, desc, eq, isNull } from "drizzle-orm";

/**
 * Ladder programs, per project.
 *
 * The Ladder editor writes here and the Monitor reads from here, which is the
 * whole point: a program written for a job should be the program that gets run
 * against that job, not a copy of it living in one browser's storage.
 *
 * "scratch" is the unattached program every user gets for trying something out
 * without booking a project first.
 */

export const SCRATCH = "scratch";

export interface StoredProgram {
  id: string;
  projectId: string | null;
  name: string;
  program: unknown;
  updatedAt: Date;
}

function where(userId: string, projectId: string | null) {
  return projectId === null
    ? and(eq(ladderPrograms.userId, userId), isNull(ladderPrograms.projectId))
    : and(eq(ladderPrograms.userId, userId), eq(ladderPrograms.projectId, projectId));
}

export async function loadProgram(
  userId: string,
  projectId: string | null,
): Promise<StoredProgram | null> {
  const rows = await db()
    .select()
    .from(ladderPrograms)
    .where(where(userId, projectId))
    // The scratch row is not constrained unique by the database, so if a race
    // ever produced two, the most recent one is the answer rather than an error.
    .orderBy(desc(ladderPrograms.updatedAt))
    .limit(1);
  const row = rows[0];
  return row
    ? {
        id: row.id,
        projectId: row.projectId,
        name: row.name,
        program: row.program,
        updatedAt: row.updatedAt,
      }
    : null;
}

export async function saveProgram(
  userId: string,
  projectId: string | null,
  name: string,
  program: unknown,
): Promise<void> {
  const existing = await loadProgram(userId, projectId);
  if (existing) {
    await db()
      .update(ladderPrograms)
      .set({ name, program, updatedAt: new Date() })
      .where(eq(ladderPrograms.id, existing.id));
    return;
  }
  await db().insert(ladderPrograms).values({ userId, projectId, name, program });
}

/** Every program this user has, newest first, for the Monitor's source picker. */
export async function listPrograms(userId: string): Promise<StoredProgram[]> {
  const rows = await db()
    .select()
    .from(ladderPrograms)
    .where(eq(ladderPrograms.userId, userId))
    .orderBy(desc(ladderPrograms.updatedAt));
  return rows.map((r) => ({
    id: r.id,
    projectId: r.projectId,
    name: r.name,
    program: r.program,
    updatedAt: r.updatedAt,
  }));
}
