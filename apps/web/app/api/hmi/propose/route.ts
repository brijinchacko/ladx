// POST /api/hmi/propose, the screens a program implies.
//
// No model is asked. The program already says what is wired to the plant, which
// way each signal goes and which tags are safety related, and those are the
// three facts a first cut of an operator interface is made of. A model would
// add wording and take away the guarantee.
//
// The guarantee that matters: a safety tag comes back as an indicator and never
// as a button. A safety device that can be operated from a screen is not a
// safety device, and that is not a judgement to leave to a generator.

import { getApiUser } from "@/lib/auth/server";
import { proposedScreensFor } from "@/lib/parsers/spawn";
import { z } from "zod";

const request = z.object({ project: z.unknown() });

export async function POST(req: Request) {
  const auth = await getApiUser();
  if ("error" in auth) return auth.error;

  const parsed = request.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid request" }, { status: 400 });

  try {
    return Response.json(await proposedScreensFor(parsed.data.project));
  } catch (err) {
    const message = err instanceof Error ? err.message : "the proposal did not run";
    return Response.json({ error: message }, { status: 503 });
  }
}
