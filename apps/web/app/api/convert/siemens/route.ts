// POST /api/convert/siemens, both directions.
//
// Separate from the ladder editor's own conversion targets, which run in the
// browser. This one runs in Rust because the S7 differences, TIME literals,
// timer instances, edge blocks, live there and a second implementation in
// TypeScript would drift from the one the desktop uses.
//
// It used to write SCL and never read it, which made LADX a writer for Siemens
// and a reader for Rockwell: a Siemens house got nothing out of the analysis,
// the tracing, the drift checks or the handover pack, because none of them
// could see the program. Reading is the same binary, the other way.

import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { getApiUser } from "@/lib/auth/server";
import { ladxSiemensBinary } from "@/lib/parsers/spawn";
import { z } from "zod";

const exec = promisify(execFile);

const request = z.union([
  // Out: an IR project becomes SCL.
  z.object({ project: z.unknown() }),
  // In: SCL text becomes an IR project. Sent as text rather than a file
  // because that is how it arrives, pasted out of TIA or out of an email.
  z.object({
    scl: z
      .string()
      .min(1)
      .max(4 * 1024 * 1024),
    name: z.string().trim().min(1).max(120).optional(),
  }),
]);

export async function POST(req: Request) {
  const auth = await getApiUser();
  if ("error" in auth) return auth.error;

  const parsed = request.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid request" }, { status: 400 });

  const reading = "scl" in parsed.data;
  const dir = await mkdtemp(path.join(os.tmpdir(), "ladx-scl-"));
  const local = path.join(dir, reading ? "block.scl" : "project.ir.json");

  try {
    if ("scl" in parsed.data) {
      await writeFile(local, parsed.data.scl, "utf8");
    } else {
      await writeFile(local, JSON.stringify(parsed.data.project));
    }

    const { stdout } = await exec(ladxSiemensBinary(), [reading ? "--read" : "--scl", local], {
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
