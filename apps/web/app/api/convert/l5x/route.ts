// POST /api/convert/l5x, read an uploaded L5X for its logic.
//
// The web can do what the desktop does through a native dialog: it already has
// the bytes, because the browser posted them. What it must not do is read a
// tens-of-megabyte project into memory and keep it there, so the upload is
// written straight to a temporary file and handed to the parser as a path.

import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { getApiUser } from "@/lib/auth/server";
import { ladxParserBinary } from "@/lib/parsers/spawn";

const exec = promisify(execFile);

/** Large enough for a real project, small enough not to be a way in. */
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
      { error: `That file is ${Math.round(file.size / 1024 / 1024)} MB. The limit is 64 MB.` },
      { status: 413 },
    );
  }

  const dir = await mkdtemp(path.join(os.tmpdir(), "ladx-l5x-"));
  // The extension matters: the binary dispatches on it and refuses anything
  // that is not an L5X by name rather than failing somewhere deeper.
  const local = path.join(dir, "upload.l5x");

  try {
    await writeFile(local, Buffer.from(await file.arrayBuffer()));
    const { stdout } = await exec(ladxParserBinary(), ["--ir", local], {
      timeout: 60_000,
      maxBuffer: 128 * 1024 * 1024,
    });
    return Response.json(JSON.parse(stdout));
  } catch (err) {
    const message = err instanceof Error ? err.message : "that file could not be read";
    return Response.json({ error: message }, { status: 422 });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
