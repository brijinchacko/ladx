import { getApiUser } from "@/lib/auth/server";
import { deleteSite, updateSite } from "@/lib/platform/client-records";
import { NextResponse } from "next/server";
import { z } from "zod";

const patch = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  addressLine1: z.string().trim().max(200).nullish(),
  addressLine2: z.string().trim().max(200).nullish(),
  city: z.string().trim().max(120).nullish(),
  region: z.string().trim().max(120).nullish(),
  postcode: z.string().trim().max(40).nullish(),
  country: z.string().trim().max(120).nullish(),
  accessNotes: z.string().trim().max(4000).nullish(),
  inductionRequired: z.boolean().optional(),
  supplyVoltage: z.string().trim().max(80).nullish(),
  notes: z.string().trim().max(4000).nullish(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const auth = await getApiUser();
  if ("error" in auth) return auth.error;
  const { siteId } = await params;
  const parsed = patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "That change could not be read." }, { status: 400 });
  }
  const ok = await updateSite(auth.user.id, siteId, parsed.data);
  if (!ok) return NextResponse.json({ error: "No such site." }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const auth = await getApiUser();
  if ("error" in auth) return auth.error;
  const { siteId } = await params;
  const ok = await deleteSite(auth.user.id, siteId);
  if (!ok) return NextResponse.json({ error: "No such site." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
