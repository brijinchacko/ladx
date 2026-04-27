// POST /api/code/auto-fix — closes spec §8.1's "validate → feedback →
// retry up to 3 times" loop. Caller hands us source + the failing report
// + optional projectId; we re-prompt the model with the diagnostics,
// validate, retry up to MAX_ATTEMPTS, and return the final attempt
// (whether or not it passed) plus the full attempt history.

import { getApiUser } from "@/lib/auth/server";
import { db } from "@/lib/db/client";
import { projects } from "@/lib/db/schema";
import { MAX_ATTEMPTS, autoFix } from "@/lib/inference/auto-fix";
import { buildProjectSystemPrompt } from "@/lib/inference/project-prompt";
import { validateSt } from "@/lib/validator/spawn";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

const reportSchema = z.object({
  ok: z.boolean(),
  language: z.string(),
  backend: z.string(),
  diagnostics: z.array(
    z.object({
      severity: z.enum(["error", "warning", "info"]),
      line: z.number().int().nonnegative(),
      column: z.number().int().nonnegative(),
      message: z.string(),
      source: z.string(),
    }),
  ),
});

const schema = z.object({
  language: z.enum(["st"]),
  source: z.string().min(1).max(64_000),
  initialReport: reportSchema,
  projectId: z.string().uuid().optional(),
  maxAttempts: z.number().int().min(1).max(MAX_ATTEMPTS).optional(),
});

export async function POST(req: Request) {
  const authResult = await getApiUser();
  if ("error" in authResult) return authResult.error;
  const { user } = authResult;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: "invalid request", detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // Optional grounding — when projectId is given, build the manifest
  // system prompt so the model fixes against real tag/routine names.
  let systemPrompt: string | undefined;
  if (parsed.data.projectId) {
    const rows = await db()
      .select()
      .from(projects)
      .where(and(eq(projects.id, parsed.data.projectId), eq(projects.userId, user.id)))
      .limit(1);
    if (!rows[0]) {
      return Response.json({ error: "project not found" }, { status: 404 });
    }
    systemPrompt = buildProjectSystemPrompt(rows[0]);
  }

  try {
    const result = await autoFix({
      source: parsed.data.source,
      initialReport: parsed.data.initialReport,
      systemPrompt,
      validate: validateSt,
      maxAttempts: parsed.data.maxAttempts,
    });
    return Response.json(result);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "auto-fix failed" },
      { status: 500 },
    );
  }
}
