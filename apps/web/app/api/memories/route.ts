// GET  /api/memories, what LADX has been told about how work is done here.
// POST /api/memories, tell it something.
//
// Engineering knowledge, not the assistant's chat history. Everything here is
// visible, attributed and removable, because a tool that quietly accumulates
// opinions about somebody's work is one they stop believing the first time it
// is wrong and they cannot find out why.

import { getApiUser } from "@/lib/auth/server";
import { db } from "@/lib/db/client";
import { memories } from "@/lib/db/schema";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";

const create = z.object({
  scope: z.enum(["user", "company", "project"]),
  kind: z.enum(["convention", "approved", "forbidden", "note"]),
  projectId: z.string().uuid().nullish(),
  content: z.string().trim().min(3).max(2000),
  reason: z.string().trim().max(2000).nullish(),
});

export async function GET(req: Request) {
  const auth = await getApiUser();
  if ("error" in auth) return auth.error;

  const url = new URL(req.url);
  // Superseded entries are history and are not returned unless asked for,
  // because a list that grows every time somebody rewords a rule stops being
  // readable.
  const includeHistory = url.searchParams.get("history") === "1";

  const where = includeHistory
    ? eq(memories.userId, auth.user.id)
    : and(eq(memories.userId, auth.user.id), isNull(memories.supersededBy));

  const rows = await db().select().from(memories).where(where).orderBy(desc(memories.createdAt));

  return Response.json({ memories: rows });
}

export async function POST(req: Request) {
  const auth = await getApiUser();
  if ("error" in auth) return auth.error;

  const parsed = create.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "invalid request" }, { status: 400 });
  }
  const { scope, kind, projectId, content, reason } = parsed.data;

  // A project rule with no project applies to nothing and would be invisible
  // to retrieval, which filters project-scoped entries by their project.
  if (scope === "project" && !projectId) {
    return Response.json({ error: "a project rule needs a project" }, { status: 400 });
  }

  const [row] = await db()
    .insert(memories)
    .values({
      userId: auth.user.id,
      scope,
      kind,
      projectId: scope === "project" ? (projectId ?? null) : null,
      content,
      reason: reason ?? null,
      author: auth.user.displayName ?? auth.user.email,
    })
    .returning();

  return Response.json({ memory: row }, { status: 201 });
}
