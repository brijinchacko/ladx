// POST /api/generated-code — record accepted generated code as a
// positive training pair (per spec workflow §8.1: "On user 'Accept':
// import via vendor connector, log to audit, store as accepted pair").
// Phase 1: persistence only; the vendor-connector import lands with
// desktop Studio (Phase 2).

import { getApiUser } from "@/lib/auth/server";
import { db } from "@/lib/db/client";
import { generatedCode, projects } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

const schema = z.object({
  projectId: z.string().uuid(),
  language: z.string().min(1).max(32),
  source: z.string().min(1).max(64_000),
  // ValidatorReport is jsonb; we accept any object so the schema can
  // evolve in ladx-types without breaking older clients.
  validatorReport: z.unknown().optional(),
  messageId: z.string().uuid().optional(),
});

export async function POST(req: Request) {
  const authResult = await getApiUser();
  if ("error" in authResult) return authResult.error;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "invalid request" }, { status: 400 });
  }

  // Confirm the project belongs to the user. Drizzle's FK gives us a
  // belated check, but we want a 404 not a 500 on the wrong row.
  const owns = await db()
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, parsed.data.projectId), eq(projects.userId, authResult.user.id)))
    .limit(1);
  if (!owns[0]) return Response.json({ error: "project not found" }, { status: 404 });

  const [row] = await db()
    .insert(generatedCode)
    .values({
      userId: authResult.user.id,
      projectId: parsed.data.projectId,
      messageId: parsed.data.messageId,
      language: parsed.data.language,
      source: parsed.data.source,
      accepted: true,
      validatorReport: parsed.data.validatorReport ?? null,
    })
    .returning();

  return Response.json({ generatedCode: row }, { status: 201 });
}
