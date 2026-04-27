// POST /api/activation — desktop licence activation check.
//
// This is the ONLY outbound HTTP call ladX Studio is allowed to make
// (per ADR-005 / desktop CLAUDE.md). The desktop sends its licence key
// + machine fingerprint; the cloud responds with `{ ok: true, expiresAt }`.
// After that, the desktop runs offline forever.
//
// Phase 1 stub: accepts any non-empty licence key in dev mode.

import { z } from "zod";

const requestSchema = z.object({
  licenceKey: z.string().min(8).max(128),
  machineId: z.string().min(1).max(256),
  productVersion: z.string().min(1).max(64),
});

export async function POST(req: Request) {
  const parsed = requestSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ ok: false, error: "invalid request" }, { status: 400 });
  }

  // TODO(phase-1+): real licence lookup (per-customer key, seat counts, etc).
  // For now: dev-mode accept-all so the desktop UI flow can be tested.
  return Response.json({
    ok: true,
    expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    productTier: "studio",
  });
}
