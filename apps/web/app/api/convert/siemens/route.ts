// POST /api/convert/siemens, an IR project as Siemens SCL.
//
// Separate from the ladder editor's own conversion targets, which run in the
// browser. This one runs in Rust because the S7 differences, TIME literals,
// timer instances, edge blocks, live there and a second implementation in
// TypeScript would drift from the one the desktop uses.

import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { getApiUser } from "@/lib/auth/server";
import { ladxSiemensBinary } from "@/lib/parsers/spawn";
import { z } from "zod";

const exec = promisify(execFile);

const request = z.object({ project: z.unknown() });

export async function POST(req: Request) {
  const auth = await getApiUser();
  if ("error" in auth) return auth.error;

  const parsed = request.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid request" }, { status: 400 });

  const dir = await mkdtemp(path.join(os.tmpdir(), "ladx-scl-"));
  const local = path.join(dir, "project.ir.json");
  try {
    await writeFile(local, JSON.stringify(parsed.data.project));
    const { stdout } = await exec(ladxSiemensBinary(), ["--scl", local], {
      timeout: 60_000,
      maxBuffer: 64 * 1024 * 1024,
    });
    return Response.json(JSON.parse(stdout));
  } catch (err) {
    const message = err instanceof Error ? err.message : "the conversion did not run";
    return Response.json({ error: message }, { status: 503 });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
