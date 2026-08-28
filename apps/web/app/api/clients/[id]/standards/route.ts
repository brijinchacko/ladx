import { getApiUser } from "@/lib/auth/server";
import { getStandards, saveStandards } from "@/lib/platform/client-records";
import { NextResponse } from "next/server";
import { z } from "zod";

/**
 * The client's own engineering rules.
 *
 * The part of client management a CRM cannot do, and the reason this belongs in
 * an engineering tool. A customer specification routinely requires the drawing
 * descriptor and the PLC descriptor to match character for character, and a
 * project delivered against the wrong convention is rework rather than a
 * difference of opinion. Written down once, it travels with the work.
 */

const standards = z.object({
  tagConvention: z.string().trim().max(2000).nullish(),
  tagPattern: z.string().trim().max(400).nullish(),
  drawingNumbering: z.string().trim().max(2000).nullish(),
  preferredPlc: z.string().trim().max(200).nullish(),
  preferredHmi: z.string().trim().max(200).nullish(),
  preferredDrive: z.string().trim().max(200).nullish(),
  hmiConvention: z.string().trim().max(2000).nullish(),
  alarmConvention: z.string().trim().max(2000).nullish(),
  documentRequirements: z.string().trim().max(4000).nullish(),
  notes: z.string().trim().max(4000).nullish(),
});

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getApiUser();
  if ("error" in auth) return auth.error;
  const { id } = await params;
  return NextResponse.json({ standards: await getStandards(auth.user.id, id) });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getApiUser();
  if ("error" in auth) return auth.error;
  const { id } = await params;
  const parsed = standards.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Those standards could not be read." }, { status: 400 });
  }
  const ok = await saveStandards(auth.user.id, id, parsed.data);
  if (!ok) return NextResponse.json({ error: "No such client." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
