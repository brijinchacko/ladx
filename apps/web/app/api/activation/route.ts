// POST /api/activation, desktop licence activation.
//
// The only outbound HTTP call ladX Studio is allowed to make (ADR-005 and the
// desktop CLAUDE.md). The desktop sends its licence key and a machine
// fingerprint; the answer decides whether it runs. After that it is offline
// forever.
//
// It used to accept any string of eight characters and hand back a year. That
// was written as a Phase 1 stub and stayed, which meant the endpoint on the
// live site would activate any copy of the installer for anybody. It now
// checks a key that was actually issued, and refuses one that was not, unless
// LADX_ACTIVATION_OPEN is explicitly set for the period before any key exists.

import { auditInBackground } from "@/lib/db/audit";
import { activate } from "@/lib/db/licences";
import { z } from "zod";

const requestSchema = z.object({
  licenceKey: z.string().min(8).max(128),
  machineId: z.string().min(1).max(256),
  productVersion: z.string().min(1).max(64),
});

/** What the desktop shows somebody. Vague on purpose about which key failed. */
const MESSAGES: Record<string, string> = {
  unknown: "That licence key was not recognised. Check it and try again.",
  revoked: "That licence has been withdrawn. Get in touch and we will sort it out.",
  expired: "That licence has expired.",
  other_machine:
    "That licence is already in use on another machine. One key runs one install; get in touch to move it.",
  closed: "Licensing is not open yet.",
};

export async function POST(req: Request) {
  const parsed = requestSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ ok: false, error: "invalid request" }, { status: 400 });
  }

  const result = await activate(parsed.data);

  if (!result.ok) {
    // Recorded: a run of failures against one machine is the only sign of
    // somebody working through guesses, and it is worth nothing unrecorded.
    auditInBackground({
      actor: "desktop",
      event: "activation_refused",
      subjectId: parsed.data.machineId.slice(0, 32),
      payload: { reason: result.reason, version: parsed.data.productVersion },
    });
    return Response.json(
      { ok: false, error: MESSAGES[result.reason] ?? MESSAGES.unknown },
      { status: 403 },
    );
  }

  auditInBackground({
    actor: "desktop",
    event: result.open ? "activation_open_mode" : "activation_accepted",
    subjectId: parsed.data.machineId.slice(0, 32),
    payload: { version: parsed.data.productVersion, open: Boolean(result.open) },
  });

  return Response.json({
    ok: true,
    expiresAt: result.expiresAt,
    productTier: result.tier,
    // Said out loud rather than hidden, so a desktop activated in open mode
    // can say so instead of looking licensed.
    ...(result.open ? { openMode: true } : {}),
  });
}

export const dynamic = "force-dynamic";
