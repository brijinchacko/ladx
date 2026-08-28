import { getApiUser } from "@/lib/auth/server";
import { addContact, listContacts } from "@/lib/platform/client-records";
import { NextResponse } from "next/server";
import { z } from "zod";

/**
 * The people at a client.
 *
 * Contact details are somebody else's personal data held on our behalf, so
 * every route here is scoped by the signed-in user twice over: the query
 * filters on the user, and adding one first checks the client is theirs. A
 * client id arrives in a URL and is never trusted on its own.
 */

const contact = z.object({
  name: z.string().trim().min(1).max(200),
  role: z.string().trim().max(120).nullish(),
  email: z.string().trim().email().max(320).nullish().or(z.literal("")),
  phone: z.string().trim().max(60).nullish(),
  siteId: z.string().uuid().nullish(),
  isPrimary: z.boolean().optional(),
  notes: z.string().trim().max(2000).nullish(),
});

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getApiUser();
  if ("error" in auth) return auth.error;
  const { id } = await params;
  return NextResponse.json({ contacts: await listContacts(auth.user.id, id) });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getApiUser();
  if ("error" in auth) return auth.error;
  const { id } = await params;

  const parsed = contact.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "That contact could not be read." }, { status: 400 });
  }

  const row = await addContact(auth.user.id, id, {
    ...parsed.data,
    email: parsed.data.email || null,
  });
  if (!row) return NextResponse.json({ error: "No such client." }, { status: 404 });
  return NextResponse.json({ id: row.id }, { status: 201 });
}
