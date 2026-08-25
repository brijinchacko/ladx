// POST /api/metrics/ingest
//
// Where the middleware posts its buffered counts. Not a public endpoint and
// not a beacon: nothing in a browser calls this, and it accepts nothing that
// could identify a reader, because the batch it takes has no room for one.
//
// Guarded by a token derived from a secret the server already holds, so there
// is no new key to configure. If that secret is unset the endpoint refuses
// everything and the Traffic page says counting is off, which is better than
// an open counter anybody can inflate.

import { createHash } from "node:crypto";
import { env } from "@/lib/env";
import { type Batch, recordBatch } from "@/lib/metrics/record";
import { METRICS_LABEL } from "@/lib/metrics/token";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const schema = z.object({
  hits: z.record(z.string().max(600), z.number().int().positive().max(1_000_000)),
  referrers: z.record(z.string().max(253), z.number().int().positive().max(1_000_000)).optional(),
});

/** Constant time, so a wrong token cannot be found one character at a time. */
function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function POST(req: Request) {
  const secret = env.secretsKey;
  if (!secret) return NextResponse.json({ error: "metrics disabled" }, { status: 503 });

  const expected = createHash("sha256")
    .update(METRICS_LABEL + secret)
    .digest("hex");
  const given = req.headers.get("x-ladx-metrics") ?? "";
  if (!same(given, expected)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid batch" }, { status: 400 });

  try {
    const rows = await recordBatch(parsed.data as Batch);
    return NextResponse.json({ ok: true, rows });
  } catch {
    // A counter is not worth an error anybody sees. The middleware has already
    // dropped its buffer by the time this returns, so a lost batch is a few
    // uncounted page views and nothing else.
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
