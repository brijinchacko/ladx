// GET  /api/company  the current user's company profile
// PUT  /api/company  create or update it, logo included
//
// One profile per user. The logo arrives as a data URL and is capped, because
// it is embedded on every generated document and stored inline in the database.

import { getApiUser } from "@/lib/auth/server";
import { getCompany, upsertCompany } from "@/lib/platform/queries";
import { NextResponse } from "next/server";
import { z } from "zod";

// ~1.4 MB of base64 is ~1 MB of image. Plenty for a logo, small enough to embed.
const MAX_LOGO = 1_400_000;

const schema = z.object({
  name: z.string().trim().min(1).max(200),
  logo: z
    .string()
    .max(MAX_LOGO)
    .refine((v) => v === "" || /^data:image\/(png|jpeg|jpg|svg\+xml|webp|gif);base64,/.test(v), {
      message: "logo must be a base64 image data URL",
    })
    .optional(),
  addressLine1: z.string().trim().max(200).optional(),
  addressLine2: z.string().trim().max(200).optional(),
  city: z.string().trim().max(120).optional(),
  region: z.string().trim().max(120).optional(),
  postcode: z.string().trim().max(40).optional(),
  country: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(60).optional(),
  email: z.string().trim().max(200).optional(),
  website: z.string().trim().max(200).optional(),
  registrationNumber: z.string().trim().max(80).optional(),
  vatNumber: z.string().trim().max(80).optional(),
});

export async function GET() {
  const auth = await getApiUser();
  if ("error" in auth) return auth.error;
  const company = await getCompany(auth.user.id);
  return NextResponse.json({ company });
}

export async function PUT(req: Request) {
  const auth = await getApiUser();
  if ("error" in auth) return auth.error;

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid request", detail: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  // An empty logo string means "remove it"; undefined means "leave as is". The
  // query does a full upsert, so normalise empty to null here.
  const { logo, ...rest } = parsed.data;
  await upsertCompany(auth.user.id, {
    ...rest,
    ...(logo !== undefined ? { logo: logo === "" ? null : logo } : {}),
  });
  return NextResponse.json({ ok: true });
}
