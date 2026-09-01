// POST /api/ladder/analyse, look a program over.
//
// The same analysis the desktop runs, reached the way the web reaches Rust:
// through the parser binary as a subprocess. The program is sent as LADX IR,
// which the client builds from its own model, so the analysis is of what is on
// screen rather than of something re-read from storage that might differ.

import { getApiUser } from "@/lib/auth/server";
import { analyseIr, whyNotIr } from "@/lib/parsers/spawn";
import { z } from "zod";

const request = z.object({
  // Not validated field by field: the shape is the IR, which Rust checks when
  // it deserialises, and duplicating that here would be a second definition to
  // keep in step.
  project: z.unknown(),
  /** Present for "why won't this come on", absent for a whole-program look. */
  tag: z.string().trim().min(1).max(200).optional(),
});

export async function POST(req: Request) {
  const auth = await getApiUser();
  if ("error" in auth) return auth.error;

  const parsed = request.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "invalid request" }, { status: 400 });
  }

  try {
    const { project, tag } = parsed.data;
    const result = tag ? await whyNotIr(project, tag) : await analyseIr(project);
    return Response.json(result);
  } catch (err) {
    // The binary says useful things, including that it is not installed, which
    // is worth passing through: it is our own message about our own
    // deployment, not anything from the request.
    const message = err instanceof Error ? err.message : "the analysis did not run";
    return Response.json({ error: message }, { status: 503 });
  }
}
