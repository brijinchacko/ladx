// POST /api/admin/users/:id/role
//
// Grant or revoke administrator. Three things guard it, and each is here for a
// failure the others do not cover:
//
//   the caller must already be an administrator     nobody promotes themselves
//   the address must be typed back                  not the row above the one meant
//   the last administrator cannot be removed        nobody locks everybody out
//
// Both directions are written to the audit log, because who was given the keys
// and when is exactly the question asked after something goes wrong.

import { setUserRole } from "@/lib/admin/queries";
import { requireAdminApi } from "@/lib/auth/admin";
import { writeAudit } from "@/lib/db/audit";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { and, count, eq, ne } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  role: z.enum(["user", "admin"]),
  confirmEmail: z.string().trim().min(3).max(320),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi();
  if ("error" in auth) return auth.error;
  const { id } = await params;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid request" }, { status: 400 });
  const { role, confirmEmail } = parsed.data;

  const [target] = await db()
    .select({ id: users.id, email: users.email, role: users.role })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  if (!target) return NextResponse.json({ error: "no such account" }, { status: 404 });

  if (target.email.toLowerCase() !== confirmEmail.toLowerCase()) {
    return NextResponse.json(
      { error: "The address typed does not match that account." },
      { status: 400 },
    );
  }

  // Changing your own role from inside the page you would lose is the one way
  // to end up with nobody who can undo it.
  if (target.id === auth.user.id) {
    return NextResponse.json(
      { error: "Change your own role from another administrator's account." },
      { status: 400 },
    );
  }

  if (target.role === "admin" && role === "user") {
    const [{ n } = { n: 0 }] = await db()
      .select({ n: count() })
      .from(users)
      .where(and(eq(users.role, "admin"), ne(users.id, target.id)));
    if (n === 0) {
      return NextResponse.json(
        { error: "That is the only administrator left. Make another one first." },
        { status: 400 },
      );
    }
  }

  await setUserRole(target.id, role);
  await writeAudit({
    userId: auth.user.id,
    actor: auth.user.email,
    event: role === "admin" ? "admin_granted" : "admin_revoked",
    subjectId: target.id,
    payload: { email: target.email },
  });

  return NextResponse.json({ ok: true, role });
}
