import { getApiUser } from "@/lib/auth/server";
import { addSite, listSites } from "@/lib/platform/client-records";
import { NextResponse } from "next/server";
import { z } from "zod";

/**
 * Where the work happens.
 *
 * A client is a company; a panel goes into a building. Nearly everything
 * operational is a property of the site rather than the company, and the field
 * that earns this on its own is the access notes: turning up without knowing
 * you needed a permit is a wasted day.
 */

const site = z.object({
  name: z.string().trim().min(1).max(200),
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

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getApiUser();
  if ("error" in auth) return auth.error;
  const { id } = await params;
  return NextResponse.json({ sites: await listSites(auth.user.id, id) });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getApiUser();
  if ("error" in auth) return auth.error;
  const { id } = await params;

  const parsed = site.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "That site could not be read." }, { status: 400 });
  }
  const row = await addSite(auth.user.id, id, parsed.data);
  if (!row) return NextResponse.json({ error: "No such client." }, { status: 404 });
  return NextResponse.json({ id: row.id }, { status: 201 });
}
