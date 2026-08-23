// POST /api/projects/:id/parse, re-run the Rust parser on the stored
// project blob. Stub returns 501 until the upload + parse pipeline lands.

import { getApiUser } from "@/lib/auth/server";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await getApiUser();
  if ("error" in authResult) return authResult.error;
  const { id } = await params;
  return Response.json(
    { error: "parser pipeline not yet implemented", projectId: id },
    { status: 501 },
  );
}
