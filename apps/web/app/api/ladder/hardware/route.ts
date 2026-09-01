// POST /api/ladder/hardware, the racks and the addresses that do not match them.
//
// Takes an uploaded L5X rather than the program on screen, because the module
// list is hardware configuration and lives in the export. A program written in
// the ladder editor has no racks behind it, and a routine-only export from
// Studio 5000 has none either; the answer says which case it is rather than
// showing an empty rack.

import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { getApiUser } from "@/lib/auth/server";
import { ladxParserBinary } from "@/lib/parsers/spawn";

const exec = promisify(execFile);
const MAX_BYTES = 64 * 1024 * 1024;

export async function POST(req: Request) {
  const auth = await getApiUser();
  if ("error" in auth) return auth.error;

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "no file was sent" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return Response.json(
      { error: `That file is ${Math.round(file.size / 1024 / 1024)}MB. The limit is 64MB.` },
      { status: 413 },
    );
  }

  const dir = await mkdtemp(path.join(os.tmpdir(), "ladx-hw-"));
  const local = path.join(dir, "upload.l5x");
  try {
    await writeFile(local, Buffer.from(await file.arrayBuffer()));
    const { stdout } = await exec(ladxParserBinary(), ["--hardware", local], {
      timeout: 60_000,
      maxBuffer: 64 * 1024 * 1024,
    });
    return Response.json(JSON.parse(stdout));
  } catch (err) {
    const message = err instanceof Error ? err.message : "the file could not be read";
    return Response.json({ error: message }, { status: 503 });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
