// GET /api/projects — list current user's projects.
// POST /api/projects — create + upload (multipart, file goes to R2, parsed).
// Phase 1 stub: returns empty list, accepts upload metadata.

import { auth } from "@clerk/nextjs/server";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return new Response("Unauthorized", { status: 401 });

  // TODO(phase-1): query db, return user's projects.
  return Response.json({ projects: [] });
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response("Unauthorized", { status: 401 });

  // TODO(phase-1): parse multipart, push to R2, queue parse job, persist row.
  return Response.json({ error: "upload pipeline not yet implemented" }, { status: 501 });
}
