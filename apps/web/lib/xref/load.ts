import { db } from "@/lib/db/client";
import { loadProgram } from "@/lib/db/ladder";
import { cadDrawings, hmiProjects } from "@/lib/db/schema";
import { accessIds } from "@/lib/teams/access";
import type { LadxProgram } from "@ladx/studio";
import { and, eq, inArray } from "drizzle-orm";
import { type XrefEntry, buildXref } from "./xref";

/** The cross reference for one of the user's projects, from what is stored. */
export async function xrefForProject(userId: string, projectId: string): Promise<XrefEntry[]> {
  const [stored, hmi, drawings] = await Promise.all([
    loadProgram(userId, projectId),
    db()
      .select({ id: hmiProjects.id, name: hmiProjects.name, doc: hmiProjects.doc })
      .from(hmiProjects)
      .where(
        and(
          inArray(hmiProjects.userId, await accessIds(userId)),
          eq(hmiProjects.projectId, projectId),
        ),
      ),
    db()
      .select({ id: cadDrawings.id, name: cadDrawings.name, data: cadDrawings.data })
      .from(cadDrawings)
      .where(
        and(
          inArray(cadDrawings.userId, await accessIds(userId)),
          eq(cadDrawings.projectId, projectId),
        ),
      ),
  ]);

  return buildXref({
    program: (stored?.program as LadxProgram | null) ?? null,
    hmi,
    drawings,
  });
}
