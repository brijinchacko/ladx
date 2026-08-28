import { getApiUser } from "@/lib/auth/server";
import { deleteContact, updateContact } from "@/lib/platform/client-records";
import { NextResponse } from "next/server";
import { z } from "zod";

const patch = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  role: z.string().trim().max(120).nullish(),
  email: z.string().trim().email().max(320).nullish().or(z.literal("")),
  phone: z.string().trim().max(60).nullish(),
  siteId: z.string().uuid().nullish(),
  isPrimary: z.boolean().optional(),
  notes: z.string().trim().max(2000).nullish(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ contactId: string }> }) {
  const auth = await getApiUser();
  if ("error" in auth) return auth.error;
  const { contactId } = await params;

  const parsed = patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "That change could not be read." }, { status: 400 });
  }
  const ok = await updateContact(auth.user.id, contactId, {
    ...parsed.data,
    ...(parsed.data.email !== undefined ? { email: parsed.data.email || null } : {}),
  });
  if (!ok) return NextResponse.json({ error: "No such contact." }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ contactId: string }> },
) {
  const auth = await getApiUser();
  if ("error" in auth) return auth.error;
  const { contactId } = await params;
  const ok = await deleteContact(auth.user.id, contactId);
  if (!ok) return NextResponse.json({ error: "No such contact." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
