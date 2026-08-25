// GET  /api/admin/licences   list
// POST /api/admin/licences   issue, revoke, restore, or free the machine
//
// The key is generated here, hashed, stored, and returned exactly once. There
// is no endpoint that reads one back, because there is nothing to read: only
// the hash is kept. If somebody loses a key, the answer is a new one and a
// revocation of the old, which is the same answer every credential system
// worth using gives.

import { requireAdminApi } from "@/lib/auth/admin";
import { auditInBackground } from "@/lib/db/audit";
import { clearMachine, issueLicence, listLicences, setRevoked } from "@/lib/db/licences";
import { NextResponse } from "next/server";
import { z } from "zod";

const issueSchema = z.object({
  action: z.literal("issue"),
  issuedTo: z.string().trim().min(1).max(160),
  email: z.string().trim().email().max(320).optional().or(z.literal("")),
  note: z.string().trim().max(500).optional(),
  /** Months from today, or nothing for a perpetual key. */
  months: z.number().int().min(1).max(120).optional(),
});

const idSchema = z.object({
  action: z.enum(["revoke", "restore", "free"]),
  id: z.string().uuid(),
});

export async function GET() {
  const auth = await requireAdminApi();
  if ("error" in auth) return auth.error;
  return NextResponse.json({ licences: await listLicences() });
}

export async function POST(req: Request) {
  const auth = await requireAdminApi();
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => null);

  const issue = issueSchema.safeParse(body);
  if (issue.success) {
    const expiresAt = issue.data.months
      ? new Date(Date.now() + issue.data.months * 30 * 86_400_000)
      : null;
    const { id, key } = await issueLicence({
      issuedTo: issue.data.issuedTo,
      email: issue.data.email || null,
      note: issue.data.note || null,
      expiresAt,
    });
    auditInBackground({
      userId: auth.user.id,
      actor: auth.user.email,
      event: "licence_issued",
      subjectId: id,
      payload: { issuedTo: issue.data.issuedTo, months: issue.data.months ?? null },
    });
    // The only time this value exists outside the generator.
    return NextResponse.json({ id, key });
  }

  const act = idSchema.safeParse(body);
  if (act.success) {
    if (act.data.action === "free") await clearMachine(act.data.id);
    else await setRevoked(act.data.id, act.data.action === "revoke");
    auditInBackground({
      userId: auth.user.id,
      actor: auth.user.email,
      event: `licence_${act.data.action}d`,
      subjectId: act.data.id,
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "invalid request" }, { status: 400 });
}
