// POST /api/ladder/compare, this program against the one on the machine.
//
// There is no version history to diff against, and inventing one would be a
// schema change to answer a question nobody asked. The question people do ask
// is the other one: what is different between what I have here and the export
// somebody just pulled off the controller. That needs no history, only the
// file.
//
// Two passes of the same binary. The upload is read into the IR first, because
// the comparison is between two programs and not between a program and a file.

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
  const projectJson = form?.get("project");
  if (!(file instanceof File)) {
    return Response.json({ error: "no file was sent" }, { status: 400 });
  }
  if (typeof projectJson !== "string") {
    return Response.json({ error: "no program was sent to compare" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return Response.json(
      { error: `That file is ${Math.round(file.size / 1024 / 1024)}MB. The limit is 64MB.` },
      { status: 413 },
    );
  }

  const bin = ladxParserBinary();
  const dir = await mkdtemp(path.join(os.tmpdir(), "ladx-compare-"));
  const uploaded = path.join(dir, "upload.l5x");
  const theirs = path.join(dir, "theirs.ir.json");
  const mine = path.join(dir, "mine.ir.json");

  try {
    await writeFile(uploaded, Buffer.from(await file.arrayBuffer()));
    await writeFile(mine, projectJson, "utf8");

    const read = await exec(bin, ["--ir", uploaded], {
      timeout: 60_000,
      maxBuffer: 128 * 1024 * 1024,
    });
    const imported = JSON.parse(read.stdout) as { project: unknown };
    await writeFile(theirs, JSON.stringify(imported.project), "utf8");

    // Mine is the "before" and theirs the "after", so the wording reads as
    // what the machine has that this does not, which is the direction somebody
    // standing at the panel is asking in.
    const { stdout } = await exec(bin, ["--diff", mine, theirs], {
      timeout: 60_000,
      maxBuffer: 64 * 1024 * 1024,
    });
    return Response.json(JSON.parse(stdout));
  } catch (err) {
    const message = err instanceof Error ? err.message : "the comparison did not run";
    return Response.json({ error: message }, { status: 503 });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
