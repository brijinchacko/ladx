// GET   /api/ladder/:projectId   the program for a project, or "scratch"
// PATCH /api/ladder/:projectId   save it
//
// The shape is dictated by httpStorage in @ladx/studio: GET returns
// { name, program } or 404, PATCH takes the same and returns ok. Keeping to
// that contract is what lets the Ladder editor be mounted here with a one-line
// change of storage rather than a fork of the component.

import { getApiUser } from "@/lib/auth/server";
import { SCRATCH, loadProgram, saveProgram } from "@/lib/db/ladder";
import { deviationsFor } from "@/lib/parsers/spawn";
import { getProject } from "@/lib/platform/queries";
import { type LadxProgram, ladxProgramToIr } from "@ladx/studio";
import { NextResponse } from "next/server";
import { z } from "zod";

const saveSchema = z.object({
  name: z.string().trim().min(1).max(200),
  // The program's internals belong to @ladx/studio; validating them here would
  // put this route in the business of tracking a shape it does not own. Size is
  // capped instead, which is the risk that actually matters.
  program: z.unknown(),
});

const MAX_BYTES = 2_000_000;

/** "scratch" means the unattached program; anything else must be an owned project. */
async function resolve(userId: string, raw: string): Promise<string | null | undefined> {
  if (raw === SCRATCH) return null;
  const project = await getProject(userId, raw);
  return project ? project.id : undefined;
}

export async function GET(_req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const auth = await getApiUser();
  if ("error" in auth) return auth.error;
  const { projectId: raw } = await params;

  const target = await resolve(auth.user.id, raw);
  if (target === undefined) return NextResponse.json({ error: "not found" }, { status: 404 });

  const stored = await loadProgram(auth.user.id, target);
  if (!stored) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ name: stored.name, program: stored.program });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const auth = await getApiUser();
  if ("error" in auth) return auth.error;
  const { projectId: raw } = await params;

  const target = await resolve(auth.user.id, raw);
  if (target === undefined) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = saveSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid request" }, { status: 400 });

  if (JSON.stringify(parsed.data.program ?? null).length > MAX_BYTES) {
    return NextResponse.json({ error: "program too large" }, { status: 413 });
  }

  await saveProgram(auth.user.id, target, parsed.data.name, parsed.data.program ?? null);

  /*
    Checked against the standards on every save, the way a linter runs on
    every keystroke rather than when somebody remembers to ask. The check is
    the same one Commissioning shows in its deviations tab; here it is a count
    the page can put next to "Saved", so a rule written down last month
    catches the rung written today. Best effort: a program the checker cannot
    read still saves.
  */
  let standards: { deviations: number; items: unknown[] } | null = null;
  if (parsed.data.program) {
    try {
      const ir = ladxProgramToIr(parsed.data.program as LadxProgram);
      const { deviations } = await deviationsFor(ir);
      standards = { deviations: deviations.length, items: deviations.slice(0, 5) };
    } catch {
      standards = null;
    }
  }

  return NextResponse.json({ ok: true, standards });
}
