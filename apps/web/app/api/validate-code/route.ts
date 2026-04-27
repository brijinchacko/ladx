// POST /api/validate-code — runs the Rust ladx-validate CLI against the
// supplied source. Currently ST only; ladder-XML validation lands when
// the generator emits real PLCopen.

import { getApiUser } from "@/lib/auth/server";
import { validateSt } from "@/lib/validator/spawn";
import { z } from "zod";

const schema = z.object({
  language: z.enum(["st"]),
  source: z.string().min(1).max(64_000),
});

export async function POST(req: Request) {
  const authResult = await getApiUser();
  if ("error" in authResult) return authResult.error;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "invalid request" }, { status: 400 });
  }

  try {
    const report = await validateSt(parsed.data.source);
    return Response.json({ report });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "validator failed" },
      { status: 500 },
    );
  }
}
