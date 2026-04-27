// GET /api/projects — list current user's projects.
// POST /api/projects — create + upload (multipart, file goes to R2, parsed).
// Phase 1 stub: returns empty list, accepts upload metadata.

import { getApiUser } from "@/lib/auth/server";
import { db } from "@/lib/db/client";
import { projects } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET() {
  const authResult = await getApiUser();
  if ("error" in authResult) return authResult.error;

  const rows = await db()
    .select()
    .from(projects)
    .where(eq(projects.userId, authResult.user.id))
    .orderBy(projects.createdAt);

  return Response.json({ projects: rows });
}

export async function POST(_req: Request) {
  const authResult = await getApiUser();
  if ("error" in authResult) return authResult.error;

  // TODO(upload-pipeline): parse multipart, push to R2 / local store,
  // run Rust parser via subprocess, persist projects row + audit log.
  return Response.json({ error: "upload pipeline not yet implemented" }, { status: 501 });
}
