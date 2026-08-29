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
import { parseProjectToIr } from "@/lib/parsers/spawn";
import { getStorage } from "@/lib/storage";
import { and, eq } from "drizzle-orm";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await getApiUser();
  if ("error" in authResult) return authResult.error;
  const { id } = await params;

  const rows = await db()
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.userId, authResult.user.id)))
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
