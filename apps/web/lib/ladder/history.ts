import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { db } from "@/lib/db/client";
import { ladderSnapshots } from "@/lib/db/schema";
import { ladxParserBinary } from "@/lib/parsers/spawn";
import { type LadxProgram, ladxProgramToIr, programRoutines } from "@ladx/studio";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";

const exec = promisify(execFile);

/** How many saves are kept per program. Older ones go as new ones arrive. */
const KEEP = 60;

function rungsIn(program: unknown): number {
  try {
    return programRoutines(program as LadxProgram).reduce((n, r) => n + (r.rungs?.length ?? 0), 0);
  } catch {
    return 0;
  }
}

/**
 * Keep this save.
 *
 * Called by the save route after the program is stored. Bounded per program,
 * because a program saved every minute for a year is half a million rows of
 * JSON nobody will ever open; the last sixty is every save of a working day
 * and then some.
 */
export async function snapshotProgram(
  userId: string,
  projectId: string | null,
  name: string,
  program: unknown,
  author: string | null,
): Promise<void> {
  if (!program) return;
  await db()
    .insert(ladderSnapshots)
    .values({ userId, projectId, name, program, author, rungs: rungsIn(program) });

  const where =
    projectId === null
      ? and(eq(ladderSnapshots.userId, userId), isNull(ladderSnapshots.projectId))
      : and(eq(ladderSnapshots.userId, userId), eq(ladderSnapshots.projectId, projectId));
  const old = await db()
    .select({ id: ladderSnapshots.id })
    .from(ladderSnapshots)
    .where(where)
    .orderBy(desc(ladderSnapshots.savedAt))
    .offset(KEEP);
  if (old.length > 0) {
    await db()
      .delete(ladderSnapshots)
      .where(
        inArray(
          ladderSnapshots.id,
          old.map((o) => o.id),
        ),
      );
  }
}

/**
 * What changed between two versions of a program.
 *
 * The same comparison Commissioning runs against a controller export, which
 * pairs rungs by content rather than by number, so a rung inserted at the top
 * reads as one addition rather than as every rung below it changing.
 */
export async function diffPrograms(before: unknown, after: unknown): Promise<unknown> {
  const bin = ladxParserBinary();
  const dir = await mkdtemp(path.join(os.tmpdir(), "ladx-history-"));
  const a = path.join(dir, "before.ir.json");
  const b = path.join(dir, "after.ir.json");
  try {
    await writeFile(a, JSON.stringify(ladxProgramToIr(before as LadxProgram)), "utf8");
    await writeFile(b, JSON.stringify(ladxProgramToIr(after as LadxProgram)), "utf8");
    const { stdout } = await exec(bin, ["--diff", a, b], {
      timeout: 60_000,
      maxBuffer: 64 * 1024 * 1024,
    });
    return JSON.parse(stdout);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
