// POST /api/ladder/schedule, the I/O list and the alarm list for a program.
//
// One route for both because they are read together: an engineer producing a
// handover pack wants the wiring schedule and the alarm schedule at the same
// moment, and two round trips to build one page is two chances for them to
// disagree about which version of the program they describe.
//
// Both are derived from the program rather than stored, so there is nothing to
// keep in step and nothing to migrate.

import { getApiUser } from "@/lib/auth/server";
import { alarmListFor, ioListFor } from "@/lib/parsers/spawn";
import { z } from "zod";

const request = z.object({
  project: z.unknown(),
  /** Which lists to build. Both by default. */
  want: z.array(z.enum(["io", "alarms"])).optional(),
});

export async function POST(req: Request) {
  const auth = await getApiUser();
  if ("error" in auth) return auth.error;

  const parsed = request.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid request" }, { status: 400 });

  const want = parsed.data.want ?? ["io", "alarms"];

  try {
    const [io, alarms] = await Promise.all([
      want.includes("io") ? ioListFor(parsed.data.project) : null,
      want.includes("alarms") ? alarmListFor(parsed.data.project) : null,
    ]);
    return Response.json({ io, alarms });
  } catch (err) {
    const message = err instanceof Error ? err.message : "the schedule could not be built";
    return Response.json({ error: message }, { status: 503 });
  }
}
