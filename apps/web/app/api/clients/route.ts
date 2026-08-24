// GET  /api/clients  list, with a project count per client
// POST /api/clients  create

import { getApiUser } from "@/lib/auth/server";
import { createClient, listClients } from "@/lib/platform/queries";
import { NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  name: z.string().trim().min(1).max(200),
  contactName: z.string().trim().max(120).optional(),
  contactEmail: z.string().trim().max(200).optional(),
  contactPhone: z.string().trim().max(60).optional(),
  addressLine1: z.string().trim().max(200).optional(),
  addressLine2: z.string().trim().max(200).optional(),
  city: z.string().trim().max(120).optional(),
  region: z.string().trim().max(120).optional(),
  postcode: z.string().trim().max(40).optional(),
  country: z.string().trim().max(120).optional(),
  industry: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(4000).optional(),
});

export async function GET() {
  const auth = await getApiUser();
  if ("error" in auth) return auth.error;
  const clients = await listClients(auth.user.id);
  return NextResponse.json({ clients });
}

export async function POST(req: Request) {
  const auth = await getApiUser();
  if ("error" in auth) return auth.error;

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid request", detail: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  const { id } = await createClient(auth.user.id, parsed.data);
  return NextResponse.json({ id }, { status: 201 });
}
