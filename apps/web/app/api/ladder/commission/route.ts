// POST /api/ladder/commission, the checks that run before a job goes out.
//
// One route rather than five, because they are asked for together: somebody
// getting a machine ready wants the sequence, the test steps, the tag
// comparison and the pack in one go, and five round trips would only be five
// chances for one of them to be quietly skipped.
//
// Each answer carries its own caveats rather than the route flattening them.
// The pack in particular says on its own manifest what was not checked, and
// that has to survive to the screen.

import { getApiUser } from "@/lib/auth/server";
import {
  deviationsFor,
  driftFor,
  handoverPackFor,
  sequencesFor,
  testPlanFor,
} from "@/lib/parsers/spawn";
import { z } from "zod";

const tagSource = z.object({
  name: z.string().trim().min(1).max(120),
  tags: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(400),
        description: z.string().max(1000).nullish(),
        address: z.string().max(200).nullish(),
      }),
    )
    .max(20_000),
});

const request = z.object({
  // The IR is checked by Rust when it deserialises; a second definition here
  // would be a second thing to keep in step.
  project: z.unknown(),
  what: z.enum(["sequence", "tests", "deviations", "drift", "handover"]),
  /** The other lists that name the same tags: an HMI export, an I/O schedule. */
  sources: z.array(tagSource).max(20).optional(),
});

export async function POST(req: Request) {
  const auth = await getApiUser();
  if ("error" in auth) return auth.error;

  const parsed = request.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "invalid request" }, { status: 400 });
  }
  const { project, what, sources } = parsed.data;

  // Drift needs something to compare against. Running it with nothing and
  // returning "no drift" would be the worst possible answer: it reads as the
  // lists agreeing.
  if (what === "drift" && (!sources || sources.length === 0)) {
    return Response.json(
      {
        error:
          "Nothing to compare against. Drift needs at least one other list: an HMI tag export, an I/O schedule, or a spec.",
      },
      { status: 400 },
    );
  }

  try {
    switch (what) {
      case "sequence":
        return Response.json(await sequencesFor(project));
      case "tests":
        return Response.json(await testPlanFor(project));
      case "deviations":
        return Response.json(await deviationsFor(project));
      case "drift":
        return Response.json(await driftFor(project, sources));
      case "handover":
        return Response.json(await handoverPackFor(project, sources));
    }
  } catch (err) {
    // Our own message about our own deployment, including that the binary is
    // not installed, which is worth saying rather than hiding.
    const message = err instanceof Error ? err.message : "that did not run";
    return Response.json({ error: message }, { status: 503 });
  }
}
