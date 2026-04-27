// POST /api/projects/:id/parse — re-run the Rust parser on the stored R2
// blob. Phase 1: stub returns 501 until R2 + spawn pipeline lands.

import { auth } from "@clerk/nextjs/server";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  return Response.json(
    { error: "parser pipeline not yet implemented", projectId: id },
    { status: 501 },
  );
}
