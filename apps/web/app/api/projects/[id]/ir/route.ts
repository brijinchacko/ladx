// GET /api/projects/:id/ir, read a stored project into the LADX IR.
//
// The logic, not the names. `/api/projects/:id/parse` and the upload path
// still produce the manifest the project list is built from, and both are
// untouched: this is a second reading of the same stored file, for callers
// that need the rungs.
//
// Rockwell L5X only today. The parser binary refuses anything else by name.

import { getApiUser } from "@/lib/auth/server";
import { db } from "@/lib/db/client";
import { projects } from "@/lib/db/schema";
import { programFromUpload } from "@/lib/ladder/from-upload";
import { parseProjectToIr } from "@/lib/parsers/spawn";
import { getStorage } from "@/lib/storage";
import { accessIds } from "@/lib/teams/access";
import { and, eq, inArray } from "drizzle-orm";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await getApiUser();
  if ("error" in authResult) return authResult.error;
  const { id } = await params;

  const rows = await db()
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), inArray(projects.userId, await accessIds(authResult.user.id))))
    .limit(1);

  const project = rows[0];
  if (!project) return Response.json({ error: "not found" }, { status: 404 });

  // A project can exist before anything is uploaded to it, and that is not an
  // error worth a 500.
  if (!project.r2Key) {
    return Response.json({ error: "this project has no uploaded file to read" }, { status: 409 });
  }

  try {
    const storage = await getStorage();
    const localPath = await storage.resolveLocalPath(project.r2Key);
    const result = await parseProjectToIr(localPath);
    return Response.json(result);
  } catch (err) {
    // The binary says useful things about what it could not do, such as the
    // file not being an L5X. Passing that through beats a generic failure,
    // and it is our own message rather than anything from the file.
    const message = err instanceof Error ? err.message : "could not read the project";
    return Response.json({ error: message }, { status: 422 });
  }
}

/**
 * POST reads the stored file into a ladder program and keeps it.
 *
 * For projects uploaded before an upload did this on its own. It is the same
 * reading as GET, followed by the conversion the editor uses, and it replaces
 * whatever program was saved against the project before: the file is the
 * source of truth for a project that started as a file.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await getApiUser();
  if ("error" in authResult) return authResult.error;
  const { id } = await params;

  const rows = await db()
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), inArray(projects.userId, await accessIds(authResult.user.id))))
    .limit(1);

  const project = rows[0];
  if (!project) return Response.json({ error: "not found" }, { status: 404 });
  if (!project.r2Key) {
    return Response.json({ error: "this project has no uploaded file to read" }, { status: 409 });
  }

  try {
    const storage = await getStorage();
    const localPath = await storage.resolveLocalPath(project.r2Key);
    const result = await programFromUpload(authResult.user.id, project.id, project.name, localPath);
    return Response.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "could not read the project";
    return Response.json({ error: message }, { status: 422 });
  }
}
